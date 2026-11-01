// Sens de circulation des chaussées séparées (routes à sens unique avec terre-plein). Règle (conduite à droite) : l'autre chaussée est à GAUCHE du sens de marche.
// Le générateur d'origine choisissait le sens avec le point le plus proche d'une autre chaussée (parfois une route transversale) : certaines chaussées roulaient
// à contre-sens. Ici on apparie chaque chaussée avec sa jumelle (parallèle, 4 à 50 m, appariement réciproque) et on inverse celles qui sont du mauvais côté.
// Usage : node tools/fix_lane_directions.mjs [--dry]  (sauvegarde data/graph_avant_sens.json / graph_pts_avant_sens.bin.gz, relire d'abord la sauvegarde si elle existe)
import fs from 'fs'; import zlib from 'zlib';
const D = 'C:/Users/Kabakoo Apprenant.e/Documents/bamako_game/data/', dry = process.argv.includes('--dry');
const J = D + 'graph.json', P = D + 'graph_pts.bin.gz', JB = D + 'graph_avant_sens.json', PB = D + 'graph_pts_avant_sens.bin.gz';
if (!fs.existsSync(JB)) { fs.copyFileSync(J, JB); fs.copyFileSync(P, PB); }
const g = JSON.parse(fs.readFileSync(JB, 'utf8')); const raw = zlib.gunzipSync(fs.readFileSync(PB)); const n = raw.readUInt32LE(0);
const pts = new Float32Array(raw.buffer.slice(raw.byteOffset + 4, raw.byteOffset + 4 + n*8)), hh = new Uint8Array(raw.buffer.slice(raw.byteOffset + 4 + n*8, raw.byteOffset + 4 + n*9));
const meta = g.edges; const E = meta.map(m => ({ id: m[0], len: m[3], lane: m[5], nl: m[6], rank: m[8], level: m[9], bridge: m[10], road: m[11], dir: m[12], off: m[13], n: m[14] }));
const px = (e, i) => pts[(e.off + i)*2], pz = (e, i) => pts[(e.off + i)*2 + 1];
const hd = (e, i) => { const j = Math.min(e.n - 1, i + 1), k = Math.max(0, j - 1), hx = px(e, j) - px(e, k), hz = pz(e, j) - pz(e, k), l = Math.hypot(hx, hz) || 1; return [hx/l, hz/l]; };
const sig = new Set(); for (const s of JSON.parse(fs.readFileSync(D + 'signals.json', 'utf8'))) for (const ph of s.phases) for (const e of ph.edges) sig.add(e);
const byRoad = new Map(); for (const e of E) if (e.nl === 2) { if (!byRoad.has(e.road)) byRoad.set(e.road, []); byRoad.get(e.road).push(e); }
const roads = [...byRoad.entries()].map(([id, es]) => ({ id, es, a: es.find(e => e.lane === 0) || es[0] })).filter(r => r.a.level === 0 && !r.a.bridge);
function partner(r) {   // jumelle la plus proche, vue depuis 3 points de la chaussée
  const a = r.a; let best = null;
  for (const f of [0.25, 0.5, 0.75]) { const i = Math.floor(a.n*f), x = px(a, i), z = pz(a, i), [hx, hz] = hd(a, i);
    for (const o of roads) { if (o === r) continue; const b = o.a; for (let k = 0; k < b.n; k += 2) { const dx = px(b, k) - x, dz = pz(b, k) - z, d = Math.hypot(dx, dz); if (d < 4 || d > 50) continue; const [gx, gz] = hd(b, k); if (Math.abs(hx*gx + hz*gz) < 0.85) continue; if (Math.abs(dx*hx + dz*hz) > d*0.5) continue;
      if (!best || d < best.d) best = { o, d, dot: hx*gx + hz*gz, lat: dx*(-hz) + dz*hx }; } } }   // lat > 0 : la jumelle est à DROITE (mauvais)
  return best;
}
const P1 = new Map(); for (const r of roads) P1.set(r, partner(r));
const flip = new Set(), skipped = []; let pairs = 0;
for (const r of roads) { const p = P1.get(r); if (!p) continue; const q = P1.get(p.o); if (!q || q.o !== r) continue; if (r.a.id > p.o.a.id) continue; pairs++;
  const A = r, B = p.o; if (A.a.len < 30 || B.a.len < 30) continue;
  const latA = p.lat, latB = q.lat, anti = p.dot < 0;
  let fl = [];
  if (anti) { if (latA > 0 && latB > 0) fl = [A, B]; }          // face à face mais chacune du mauvais côté : les deux sont inversées
  else { if (latA > 0) fl = [A]; else if (latB > 0) fl = [B]; } // même sens : on inverse celle dont la jumelle est à droite
  for (const f of fl) { if (f.es.some(e => sig.has(e.id))) skipped.push(f.id); else flip.add(f); } }
console.log('chaussées jumelles', roads.length, '| paires réciproques', pairs, '| chaussées à inverser', flip.size, '| ignorées (feux tricolores)', skipped.length);
for (const f of flip) console.log(' route', f.id, 'edges', f.es.map(e => e.id).join('/'), 'x,z', Math.round(px(f.a, f.a.n >> 1)), Math.round(pz(f.a, f.a.n >> 1)), 'long.', Math.round(f.a.len));
if (dry) process.exit(0);
for (const f of flip) for (const e of f.es) {
  const m = meta[e.id]; [m[1], m[2]] = [m[2], m[1]]; m[12] = -m[12]; m[5] = 1 - m[5];   // from<->to, sens, et voie droite <-> gauche (les points retournés d'une voie deviennent ceux de l'autre côté de la route)
  for (let i = 0; i < (e.n >> 1); i++) { const a = e.off + i, b = e.off + e.n - 1 - i; for (let c = 0; c < 2; c++) { const t = pts[a*2 + c]; pts[a*2 + c] = pts[b*2 + c]; pts[b*2 + c] = t; } const t = hh[a]; hh[a] = hh[b]; hh[b] = t; }
}
const out = Buffer.alloc(4 + n*9); out.writeUInt32LE(n, 0); Buffer.from(pts.buffer).copy(out, 4); Buffer.from(hh.buffer).copy(out, 4 + n*8);
fs.writeFileSync(P, zlib.gzipSync(out, { level: 9 })); fs.writeFileSync(J, JSON.stringify(g)); console.log('graphe réécrit');
