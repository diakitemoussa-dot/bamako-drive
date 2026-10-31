// Itinéraire A* sur le graphe routier (voies) : de la voie du joueur jusqu'à la voie de destination.
// Retourne { pts: Float32Array [x,z,...], cum: Float32Array (distance cumulée), len, edges: Set<id> } ou null.
const OK = e => e.rank >= 1;

class Heap {
  constructor() { this.a = []; }
  push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2*i + 1, r = l + 1, m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

/** suite d'arêtes entre le nœud `from` et le nœud `to` (ids d'arêtes) ou null */
function astar(g, from, to) {
  if (from === to) return [];
  const N = g.nodes, tx = N[to][0], tz = N[to][1], h = n => Math.hypot(N[n][0] - tx, N[n][1] - tz);
  const best = new Map([[from, 0]]), prev = new Map(), heap = new Heap(); heap.push(h(from), from); const done = new Set();
  while (heap.size) {
    const [, n] = heap.pop(); if (done.has(n)) continue; done.add(n); if (n === to) break;
    for (const id of g.out.get(n) || []) { const e = g.edges[id]; if (!OK(e)) continue; const c = best.get(n) + e.len*(e.rank >= 3 ? 0.8 : 1);
      if (c < (best.get(e.to) ?? Infinity)) { best.set(e.to, c); prev.set(e.to, id); heap.push(c + h(e.to), e.to); } }
  }
  if (!prev.has(to)) return null;
  const out = []; for (let n = to; n !== from;) { const id = prev.get(n); out.push(id); n = g.edges[id].from; } return out.reverse();
}

/** i0 : indice de départ sur l'arête e0, i1 : indice d'arrivée sur l'arête e1 */
export function findRoute(g, e0, i0, e1, i1) {
  let ids;
  if (e0.id === e1.id && i1 >= i0) ids = [];
  else { ids = astar(g, e0.to, e1.from); if (!ids) return null; }
  const pts = [], add = (e, a, b) => { for (let i = a; i <= b; i++) pts.push(g.px(e, i), g.pz(e, i)); }, set = new Set([e0.id, e1.id]);
  if (e0.id === e1.id && i1 >= i0) add(e0, i0, i1);
  else { add(e0, i0, e0.n - 1); for (const id of ids) { const e = g.edges[id]; set.add(id); add(e, 0, e.n - 1); } add(e1, 0, i1); }
  const P = new Float32Array(pts), cum = new Float32Array(P.length/2); for (let i = 1; i < cum.length; i++) cum[i] = cum[i - 1] + Math.hypot(P[i*2] - P[i*2 - 2], P[i*2 + 1] - P[i*2 - 1]);
  return { pts: P, cum, len: cum[cum.length - 1], edges: set, from: e0.id };
}

/** point le plus proche du joueur sur l'itinéraire (cherche autour de `hint`) : {i, d} */
export function nearestOnRoute(r, x, z, hint = 0) {
  const n = r.cum.length; let bi = hint, bd = Infinity; const a = Math.max(0, hint - 25), b = Math.min(n - 1, hint + 120);
  for (let i = a; i <= b; i++) { const d = (r.pts[i*2] - x)**2 + (r.pts[i*2 + 1] - z)**2; if (d < bd) { bd = d; bi = i; } }
  return { i: bi, d: Math.sqrt(bd) };
}
/** point situé `ahead` mètres plus loin sur l'itinéraire à partir de l'indice i */
export function pointAhead(r, i, ahead) {
  const n = r.cum.length, target = r.cum[i] + ahead; let j = i; while (j < n - 1 && r.cum[j] < target) j++; return [r.pts[j*2], r.pts[j*2 + 1]];
}

// ---------- aides partagées par les missions ----------
const rightOf = h => [-Math.sin(h), Math.cos(h)];
/** voie roulable la plus proche (rang ≥ 1, niveau sol, hors pont) */
export function laneNear(g, x, z, maxD = 60) { return g.nearest(x, z, maxD, e => e.rank >= 1 && e.level === 0 && !e.bridge); }
/** point d'arrêt sur la voie (e,i) décalé de `off` m vers le bord droit */
export function stopPoint(g, e, i, off = 1.6) { const h = g.heading(e, i), [rx, rz] = rightOf(h); return { x: g.px(e, i) + rx*off, z: g.pz(e, i) + rz*off, e, i }; }
export const nearestLandmark = (E, x, z) => { let b = null, bd = 450*450; for (const l of E.landmarks) { const d = (l.x - x)**2 + (l.z - z)**2; if (d < bd) { bd = d; b = l; } } return b; };

/** destination = un lieu connu à minD–maxD mètres (à vol d'oiseau) avec un itinéraire existant → { dest, route } ou null */
export function planTrip(E, p, minD, maxD, minLen = 400) {
  const g = E.graph, n0 = laneNear(g, p.x, p.z); if (!n0) return null;
  const lm = E.landmarks.map(l => ({ l, d: Math.hypot(l.x - p.x, l.z - p.z) })).filter(o => o.d > minD && o.d < maxD).sort(() => Math.random() - 0.5);
  for (const { l } of lm) {
    const n1 = g.nearest(l.x, l.z, 120, e => e.rank >= 1 && e.level === 0 && !e.bridge && e.len > 25); if (!n1) continue;
    const route = findRoute(g, n0.edge, n0.i, n1.edge, n1.i); if (!route || route.len < minLen) continue;
    return { dest: { name: l.name, ...stopPoint(g, n1.edge, n1.i) }, route };
  }
  return null;
}
/** arrêt aléatoire à minD–maxD de `from`, sur une voie principale ; le nom vient du lieu connu le plus proche */
export function randomStop(E, from, minD, maxD, avoid = []) {
  const g = E.graph;
  for (let k = 0; k < 80; k++) {
    const e = g.edges[(Math.random()*g.edges.length) | 0]; if (e.rank < 1 || e.level !== 0 || e.bridge || e.len < 40) continue;
    const i = Math.min(e.n - 3, Math.max(2, (e.n*(0.3 + Math.random()*0.4)) | 0)), x = g.px(e, i), z = g.pz(e, i), d = Math.hypot(x - from.x, z - from.z); if (d < minD || d > maxD) continue;
    if (avoid.some(a => Math.hypot(a.x - x, a.z - z) < 120)) continue; const lm = nearestLandmark(E, x, z);
    return { name: lm ? lm.name : 'Arrêt', ...stopPoint(g, e, i) };
  }
  return null;
}
/** suit l'itinéraire de `st` {route, routeI, dest, rrT} : met à jour l'indice, recalcule si on s'écarte ; renvoie { rel, dd, remain } */
export function follow(E, st, p, dt) {
  const on = nearestOnRoute(st.route, p.x, p.z, st.routeI); st.routeI = on.i; st.rrT = (st.rrT || 0) - dt;
  if (on.d > 28 && st.rrT <= 0) { st.rrT = 2.5; const n0 = laneNear(E.graph, p.x, p.z, 40); if (n0) { const r = findRoute(E.graph, n0.edge, n0.i, st.dest.e, st.dest.i); if (r) { st.route = r; st.routeI = 0; } } }
  const dd = Math.hypot(st.dest.x - p.x, st.dest.z - p.z), remain = st.route.len - st.route.cum[st.routeI];
  const [tx, tz] = remain > 70 ? pointAhead(st.route, st.routeI, 55) : [st.dest.x, st.dest.z]; let rel = Math.atan2(tz - p.z, tx - p.x) - p.yaw; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
  return { rel, dd, remain };
}
export const distTxt = d => d > 1000 ? (d/1000).toFixed(1).replace('.', ',') + ' km' : Math.round(d/10)*10 + ' m';
