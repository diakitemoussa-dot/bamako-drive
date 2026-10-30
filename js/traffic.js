// AI traffic: IDM car-following on the lane graph, curve slow-down, junction conflict rules, traffic lights, motorbike weaving, pedestrians. Everything is instanced.
import * as THREE from 'three';
import { KINDS } from './vehicles.js';
import { install } from './traffic_extras.js';

const MIX_BIG = { moto: 33, sedan: 17, taxi: 14, sotrama: 15, suv: 7, pickup: 5, truck: 4, tricycle: 3 };
const MIX_SMALL = { moto: 52, sedan: 14, taxi: 8, sotrama: 4, suv: 4, pickup: 5, truck: 2, tricycle: 11 };
const PAR = { moto: [3.4, 4.0, 0.7, 1.0, 0.95, 1.35, 3.2], sedan: [2.2, 3.0, 1.3, 2.0, 0.85, 1.25, 2.4], taxi: [2.4, 3.2, 1.1, 1.8, 1.0, 1.4, 2.6], suv: [2.1, 3.0, 1.3, 2.2, 0.85, 1.2, 2.4],
  pickup: [1.8, 3.0, 1.4, 2.2, 0.8, 1.1, 2.2], sotrama: [1.7, 3.0, 1.2, 2.0, 0.9, 1.25, 2.3], truck: [1.0, 2.5, 1.8, 3.0, 0.65, 0.9, 1.8], tricycle: [1.2, 3.0, 1.2, 1.5, 0.5, 0.75, 2.0] };
const DENS = [0.8, 1.3, 5.5, 8.0, 11.0, 11.0];             // vehicles / km / lane by road rank (0 unclassified .. 5 trunk)
const TRIM = 6.0, DS = 2.5;
const rnd = (a, b) => a + Math.random()*(b - a);
const pickW = (mix) => { const ks = Object.keys(mix); let t = 0; for (const k of ks) t += mix[k]; let r = Math.random()*t; for (const k of ks) { r -= mix[k]; if (r <= 0) return k; } return ks[0]; };

class Piece {
  constructor(key, xy, edge, conn) { this.key = key; this.xy = xy; this.edge = edge; this.conn = conn; this.agents = []; const n = xy.length/2; this.n = n; this.cum = new Float32Array(n); this.ang = new Float32Array(n); let a0 = 0;
    for (let i = 1; i < n; i++) { const dx = xy[i*2] - xy[i*2 - 2], dz = xy[i*2 + 1] - xy[i*2 - 1]; this.cum[i] = this.cum[i - 1] + Math.hypot(dx, dz); let a = Math.atan2(dz, dx); if (i > 1) { while (a - a0 > Math.PI) a -= 2*Math.PI; while (a - a0 < -Math.PI) a += 2*Math.PI; } this.ang[i] = a; a0 = a; }
    this.ang[0] = n > 1 ? this.ang[1] : 0; this.L = this.cum[n - 1]; const tr = Math.min(TRIM, 0.3*this.L); this.a = conn ? 0 : tr; this.b = conn ? this.L : this.L - tr;
    this.vc = new Float32Array(n).fill(45); for (let i = 1; i < n - 1; i++) { const ds = Math.max(this.cum[i + 1] - this.cum[i - 1], 1e-3) * 0.5; this.vc[i] = Math.min(45, Math.max(2.5, Math.sqrt(2.4/Math.max(Math.abs(this.ang[i + 1] - this.ang[i - 1])/(2*ds), 1e-3)))); }
    for (let k = 0; k < 2; k++) for (let i = 1; i < n - 1; i++) this.vc[i] = (this.vc[i - 1] + this.vc[i]*2 + this.vc[i + 1])/4;
    this.limit = 14; this.rank = 0; this.node = -1; this.nl = 1; this.lane = 0; this.par = -1; this.mid = [xy[(n >> 1)*2], xy[(n >> 1)*2 + 1]]; }
  at(s) { s = Math.min(Math.max(s, 0), this.L); let lo = 0, hi = this.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    const f = (s - this.cum[lo])/Math.max(this.cum[hi] - this.cum[lo], 1e-6), xy = this.xy; return { x: xy[lo*2] + f*(xy[hi*2] - xy[lo*2]), z: xy[lo*2 + 1] + f*(xy[hi*2 + 1] - xy[lo*2 + 1]), ang: this.ang[lo] + f*(this.ang[hi] - this.ang[lo]), i: lo, f }; }
  vAhead(s, H, k) { let v = 99; const i0 = this.idx(s), i1 = this.idx(Math.min(this.L, s + H)); for (let i = i0; i <= i1 && i < this.n; i++) v = Math.min(v, Math.sqrt((this.vc[i]*k)**2)); return v; }
  idx(s) { let lo = 0, hi = this.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; } return lo; }
}

export class Traffic {
  constructor(scene, world, graph, models, prof) { this.scene = scene; this.world = world; this.g = graph; this.models = models; this.prof = prof; this.agents = []; this.pieces = new Map(); this.nodeState = new Map(); this.confl = new Map(); this.t = 0; this.night = 0; this.player = null; this.density = 0.7; this.count = 0; this.renderR = 360; this.rr = 0; this.furnT = 0; this.furnPos = [1e9, 1e9]; this.on = false; }
  async init() { this._buildSignals(); this._buildMeshes(); this._buildFurniture(); this._buildPeds(); this.world.onTilesChanged = (f => () => { f && f(); this.furnT = 0; })(this.world.onTilesChanged); }
  rebind(scene, world, prof) { this.scene = scene; this.world = world; this.prof = prof; this.off(); this._buildMeshes(); this._buildFurniture(); this._buildPeds(); if (this.player) this.start({ x: this.player.x, z: this.player.z }, this.density, this.player); }
  off() { for (const o of this.objs || []) { this.scene.remove(o); } this.objs = []; }
  // ---------- pieces ----------
  edgePiece(id) {
    let p = this.pieces.get('e' + id); if (p) return p; const e = this.g.edges[id], xy = new Float32Array(e.n*2); for (let i = 0; i < e.n; i++) { xy[i*2] = this.g.px(e, i); xy[i*2 + 1] = this.g.pz(e, i); }
    p = new Piece('e' + id, xy, id, null); p.limit = e.limit/3.6; p.rank = e.rank; p.node = e.to; p.nl = e.nl; p.lane = e.lane; p.par = e.par; this.pieces.set(p.key, p); return p;
  }
  connPiece(A, B) {
    const key = 'c' + A.edge + '_' + B.edge; let p = this.pieces.get(key); if (p) return p; const a = A.at(A.b), b = B.at(B.a), d = Math.hypot(b.x - a.x, b.z - a.z), h = Math.max(1.5, 0.5*d + 0.5);
    const c1 = [a.x + h*Math.cos(a.ang), a.z + h*Math.sin(a.ang)], c2 = [b.x - h*Math.cos(b.ang), b.z - h*Math.sin(b.ang)], xy = new Float32Array(26);
    for (let i = 0; i < 13; i++) { const t = i/12, u = 1 - t; xy[i*2] = u*u*u*a.x + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t*t*t*b.x; xy[i*2 + 1] = u*u*u*a.z + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t*t*t*b.z; }
    p = new Piece(key, xy, null, [A.edge, B.edge]); p.limit = Math.min(A.limit, B.limit); p.rank = A.rank; p.node = this.g.edges[A.edge].to; this.pieces.set(key, p); return p;
  }
  conflict(c1, c2) { const k = c1.key < c2.key ? c1.key + '|' + c2.key : c2.key + '|' + c1.key; let r = this.confl.get(k); if (r === undefined) { r = false; for (let i = 0; i < c1.n && !r; i++) for (let j = 0; j < c2.n; j++) if ((c1.xy[i*2] - c2.xy[j*2])**2 + (c1.xy[i*2 + 1] - c2.xy[j*2 + 1])**2 < 5.8) { r = true; break; } this.confl.set(k, r); } return r; }
  // ---------- signals ----------
  _buildSignals() { this.sig = new Map(); this.edgeSig = new Map(); for (const s of this.g.signals) { this.sig.set(s.node, s); s.phases.forEach((ph, pi) => ph.edges.forEach(e => this.edgeSig.set(e, [s.node, pi]))); } }
  sigState(node, phase, ahead = 0) { const sg = this.sig.get(node); let t = (this.t + ahead + sg.offset) % sg.cycle; for (let pi = 0; pi < sg.phases.length; pi++) { const ph = sg.phases[pi]; if (t < ph.green) return pi === phase ? 'G' : 'R'; t -= ph.green; if (t < ph.amber) return pi === phase ? 'A' : 'R'; t -= ph.amber; if (t < 1.5) return 'R'; t -= 1.5; } return 'R'; }
  // ---------- node access ----------
  ns(node) { let s = this.nodeState.get(node); if (!s) this.nodeState.set(node, s = { act: new Map() }); return s; }
  canEnter(ag, A, conn, B) {
    const sgn = this.edgeSig.get(A.edge), st = this.ns(A.node);
    if (sgn) { const ls = this.sigState(sgn[0], sgn[1]); if (ls === 'R') return false; if (ls === 'A' && (A.b - ag.s) > ag.v*ag.v/7 + 1) return false; }
    for (const [k, rec] of st.act) { if (rec.n <= 0 || k === conn.key || rec.from === A.edge) continue; if (this.t - rec.t < 7 && this.conflict(conn, this.pieces.get(k))) return false; }
    for (const o of B.agents) if (o.s < B.a + 3.5 + ag.len) return false;
    if (!sgn) for (const ei of this.g.inn.get(A.node) || []) { if (ei === A.edge) continue; if (this.g.edges[ei].rank > A.rank) { const Q = this.pieces.get('e' + ei); if (Q) for (const o of Q.agents) if (Q.b - o.s < 24 && o.v > 1.2) return false; } }
    return true;
  }
  acquire(ag, A, conn) { const st = this.ns(A.node); let r = st.act.get(conn.key); if (!r) st.act.set(conn.key, r = { n: 0, t: 0, from: A.edge }); r.n++; r.t = this.t; ag.hold = [A.node, conn.key]; }
  release(ag) { if (!ag.hold) return; const r = this.ns(ag.hold[0]).act.get(ag.hold[1]); if (r) r.n = Math.max(0, r.n - 1); ag.hold = null; }
  // ---------- routing ----------
  choose(A, ag) {
    const g = this.g, node = A.node, Ae = g.edges[A.edge], outs = g.out.get(node) || []; if (!outs.length) return -1; const a_end = A.at(A.b).ang, groups = new Map();
    for (const ei of outs) { const e = g.edges[ei], k = e.road*2 + (e.dir > 0 ? 1 : 0); (groups.get(k) || groups.set(k, []).get(k)).push(ei); }
    const cand = []; for (const lanes of groups.values()) { const e0 = g.edges[lanes[0]]; if (e0.road === Ae.road && e0.dir !== Ae.dir && groups.size > 1) continue; const P0 = this.edgePiece(lanes[0]); let d = Math.abs(((P0.at(P0.a).ang - a_end + Math.PI) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI) - Math.PI);
      cand.push([(e0.rank === Ae.rank ? 3 : e0.rank > Ae.rank ? 1.6 : 1)*(d < 0.45 ? 1.5 : d < 1.4 ? 1 : d < 2.2 ? 0.6 : 0.05), lanes]); }
    if (!cand.length) return outs[0]; let t = 0; for (const c of cand) t += c[0]; let r = Math.random()*t, sel = cand[0][1]; for (const c of cand) { r -= c[0]; if (r <= 0) { sel = c[1]; break; } }
    if (sel.length === 2) { const pick = Ae.nl === 2 ? Ae.lane : (Math.random() < (['taxi', 'moto', 'sedan', 'suv'].includes(ag.kind) ? 0.45 : 0.75) ? 0 : 1); return sel[pick] ?? sel[0]; } return sel[0];
  }
  plan(ag) { while (ag.next.length < 2) { const last = ag.next.length ? ag.next[ag.next.length - 1] : ag.piece; if (last.edge === null) return; const ei = this.choose(last, ag); if (ei < 0) return; const B = this.edgePiece(ei); ag.next.push(this.connPiece(last, B), B); } }
  // ---------- spawn ----------
  start(center, density, player) {
    this.player = player; this.density = density; this.on = true; for (const a of this.agents) this.detach(a); this.agents.length = 0; this.nodeState.clear(); for (const p of this.pieces.values()) p.agents.length = 0;
    const n = Math.round(this.prof.traffic*density); for (let i = 0; i < n; i++) { const k = pickW(Math.random() < 0.55 ? MIX_BIG : MIX_SMALL), ag = this._newAgent(k); this.agents.push(ag); if (!this.place(ag, center.x, center.z, 30, 520, true)) this.detach(ag); }
    this.agents = this.agents.filter(a => a.piece); this.count = this.agents.length; this._initPeds(center);
  }
  _newAgent(kind) { const K = this.models.kinds[kind], p = PAR[kind]; return { kind, K, len: K.len, a: p[0], b: p[1], T: p[2], s0: p[3], fv: rnd(p[4], p[5]), alat: p[6], piece: null, s: 0, v: 0, lat: 0, latT: 0, latTimer: rnd(1, 6), next: [], hold: null, stuck: 0, blocked: 0, vlT: 0, vlP: null, vcache: 99, wang: rnd(0, 6.28), steer: 0, roll: 0, pitch: 0, y: null, x: 0, z: 0, ang: 0, color: null, wheelR: K.wheels[0].r, slot: -1 }; }
  detach(ag) { if (ag.piece) { const i = ag.piece.agents.indexOf(ag); if (i >= 0) ag.piece.agents.splice(i, 1); } if (ag.hold) this.release(ag); ag.piece = null; }
  place(ag, cx, cz, rmin, rmax, initial = false) {
    const g = this.g, cell = 24, r = Math.ceil(rmax/cell), ids = new Set(); const ci = Math.floor(cx/cell), cj = Math.floor(cz/cell);
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) { const a = g.grid.get(i*100000 + j); if (a) for (const id of a) ids.add(id); }
    const c = []; let tot = 0; for (const id of ids) { const e = g.edges[id]; if (e.len < 25) continue; const mx = g.px(e, e.n >> 1) - cx, mz = g.pz(e, e.n >> 1) - cz, d = Math.hypot(mx, mz); if (d < rmin || d > rmax) continue; const w = e.len*DENS[e.rank]*(e.nl === 2 ? 0.5 : 1); tot += w; c.push([id, w]); }
    for (let tr = 0; tr < 40 && tot > 0; tr++) { let q = Math.random()*tot, id = c[0][0]; for (const [i, w] of c) { q -= w; if (q <= 0) { id = i; break; } } const P = this.edgePiece(id); if (P.b - P.a < 10) continue; const s = rnd(P.a, P.b - 4);
      if (P.agents.some(o => Math.abs(o.s - s) < 13)) continue; this.detach(ag); ag.piece = P; ag.s = s; ag.v = 0.7*Math.min(P.limit*ag.fv, 12); ag.next = []; ag.lat = 0; ag.latT = 0; ag.stuck = 0; ag.blocked = 0; ag.vlP = null; ag.y = null; P.agents.push(ag); return true; }
    return false;
  }
  // ---------- simulation ----------
  leader(ag, H = 70) {
    const P = ag.piece, half = ag.len*0.5; let best = null;
    for (const o of P.agents) { if (o === ag || o.s <= ag.s || Math.abs(o.lat - ag.lat) >= 1.05) continue; const gp = o.s - ag.s - half - o.len*0.5; if (!best || gp < best[0]) best = [gp, o.v]; }
    if (best) return best; let acc = P.b - ag.s;
    for (const Q of ag.next) { if (acc > H) break; for (const o of Q.agents) { if (Math.abs(o.lat - ag.lat) >= 1.05) continue; const gp = acc + (o.s - Q.a) - half - o.len*0.5; if (!best || gp < best[0]) best = [gp, o.v]; } if (best) return best; acc += Q.b - Q.a; }
    return null;
  }
  playerAhead(ag) {   // the player as an obstacle in this vehicle's lane
    const p = this.player; if (!p) return null; const dx = p.x - ag.x, dz = p.z - ag.z; if (dx*dx + dz*dz > 1600) return null; const c = Math.cos(ag.ang), s = Math.sin(ag.ang), fwd = dx*c + dz*s, lat = -dx*s + dz*c;
    if (fwd > 0 && fwd < 38 && Math.abs(lat) < 1.4 && Math.abs(p.y - ag.yy) < 3) return [fwd - ag.len*0.5 - p.len*0.5, Math.max(0, p.vf*Math.cos(p.yaw - ag.ang))]; return null;
  }
  step(dt) {
    this.t += dt; const pl = this.player;
    for (const ag of this.agents) {
      let P = ag.piece; if (!P) continue; if (!ag.next.length) this.plan(ag); if (!ag.next.length && P.edge !== null && P.b - ag.s < 6) { this.place(ag, pl.x, pl.z, 380, 520); continue; }
      let v0 = Math.min(P.limit*ag.fv, 33); if (ag.kind === 'moto') v0 = Math.max(v0, Math.min(P.limit*1.15, 20)*ag.fv/1.1);
      ag.vlT -= dt; if (ag.vlT <= 0 || ag.vlP !== P) { const k = ag.alat/2.4, H = 45; let vc = P.vAhead(ag.s, H, k), acc = P.b - ag.s; vc = Math.min(vc, Math.sqrt(0 + 1e9));
        for (const Q of ag.next) { if (acc > H) break; vc = Math.min(vc, Q.vAhead(Q.a, Math.min(Q.L - Q.a, H - acc), k) + 0*acc); if (Q.edge !== null) vc = Math.min(vc, Q.limit*ag.fv); acc += Q.b - Q.a; }
        const dEnd = Math.max(0, Math.min(P.b - ag.s, H)); ag.vcache = vc; ag.vlT = 0.2 + Math.random()*0.15; ag.vlP = P; }
      const vlim = Math.min(v0, ag.vcache);
      let lead = this.leader(ag), gap = null, vl = 0; if (lead) { gap = lead[0]; vl = lead[1]; }
      const pa = pl ? this.playerAhead(ag) : null; if (pa && (gap === null || pa[0] < gap)) { gap = pa[0]; vl = pa[1]; }
      if (P.edge !== null && ag.next.length >= 2) { const dist = P.b - ag.s, stopd = ag.v*ag.v/(2*ag.b) + 6; if (dist < stopd && !this.canEnter(ag, P, ag.next[0], ag.next[1])) { const g2 = dist - 1.5 - ag.len*0.5; if (gap === null || g2 < gap) { gap = g2; vl = 0; } } }
      const v = ag.v, aFree = ag.a*(1 - Math.pow(v/Math.max(vlim, 0.5), 4)); let a = aFree;
      if (gap !== null) { const sst = ag.s0 + Math.max(0, v*ag.T + v*(v - vl)/(2*Math.sqrt(ag.a*ag.b))); a = aFree - ag.a*Math.pow(sst/Math.max(gap, 0.3), 2); }
      a = Math.max(-9, Math.min(ag.a, a)); if (gap !== null && gap < 0.3) a = Math.max(a, -9);
      const nv = Math.max(0, v + a*dt), ds = 0.5*(v + nv)*dt; ag.v = nv; ag.brake = a < -2.0;
      ag.blocked = (gap !== null && gap < 14 && vl < 0.7*vlim && nv < 0.8*vlim) ? ag.blocked + dt : Math.max(0, ag.blocked - dt); ag.stuck = nv < 0.15 ? ag.stuck + dt : 0;
      if (ag.kind === 'moto') { ag.latTimer -= dt; if (ag.latTimer <= 0) { ag.latT = ag.blocked > 0.8 ? (Math.random() < 0.6 ? 1 : -1)*rnd(0.7, 1.15) : rnd(-0.5, 0.9); ag.latTimer = rnd(2.5, 7); } }
      if (ag.lat !== ag.latT) { const r = (ag.kind === 'moto' ? 1.6 : 1.9)*dt; ag.lat += Math.max(-r, Math.min(r, ag.latT - ag.lat)); }
      ag.s += ds; ag.wang = (ag.wang + ds/ag.wheelR) % (2*Math.PI);
      while (ag.s >= ag.piece.b && ag.next.length) {
        const over = ag.s - ag.piece.b, old = ag.piece, nx = ag.next.shift(); if (old.edge !== null && nx.conn !== null && !ag.hold) this.acquire(ag, old, nx); if (old.conn !== null && ag.hold) this.release(ag);
        const i = old.agents.indexOf(ag); if (i >= 0) old.agents.splice(i, 1); ag.piece = nx; nx.agents.push(ag); ag.s = nx.a + over; if (ag.kind !== 'moto') ag.latT = 0; if (ag.next.length < 2) this.plan(ag);
      }
      if (ag.s > ag.piece.b) { ag.s = ag.piece.b; ag.v = 0; }
      const R = ag.piece, q = R.at(ag.s); ag.ang = q.ang; ag.x = q.x + Math.sin(q.ang)*ag.lat; ag.z = q.z - Math.cos(q.ang)*ag.lat; ag.yy = ag.y ?? 0; ag.i = q.i;
      if (ag.stuck > 30 || (ag.piece && Math.hypot(ag.x - pl.x, ag.z - pl.z) > 700)) { if (!this.place(ag, pl.x, pl.z, 330, 560)) ag.stuck = 0; }
    }
    this._stepPeds(dt);
  }
  // ---------- rendering ----------
  _buildMeshes() {
    this.objs = this.objs || []; const cap = Math.max(60, Math.ceil(this.prof.traffic*1.15)), M = this.models.mats; this.inst = {}; this.cap = cap;
    const mk = (geo, mat, c, tint) => { const m = new THREE.InstancedMesh(geo, mat, c); m.frustumCulled = false; m.count = 0; m.castShadow = false; this.scene.add(m); this.objs.push(m); if (tint) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(c*3), 3); return m; };
    for (const k of KINDS) { const K = this.models.kinds[k], c = cap; this.inst[k] = { body: mk(K.body, M.body, c, true), detail: mk(K.detail, M.detail, c), front: K.front ? mk(K.front, M.front, c) : null, rear: K.rear ? mk(K.rear, new THREE.MeshBasicMaterial({ color: 0x5a0a08 }), c) : null, sign: K.sign ? mk(K.sign, M.sign, c) : null, wheels: mk(K.wheelGeo, M.wheel, c*K.wheels.length), n: 0 }; this.inst[k].rearMat = this.inst[k].rear && this.inst[k].rear.material; }
    // halos de phares (nuit) : un point lumineux additif par phare, positionné chaque image devant les véhicules affichés
    { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), r = g.createRadialGradient(32, 32, 1, 32, 32, 31); r.addColorStop(0, 'rgba(255,248,225,1)'); r.addColorStop(0.25, 'rgba(255,236,190,.65)'); r.addColorStop(1, 'rgba(255,220,150,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      const geo = new THREE.BufferGeometry(); this.hlPos = new Float32Array(cap*2*3); geo.setAttribute('position', new THREE.BufferAttribute(this.hlPos, 3)); geo.setDrawRange(0, 0);
      this.hl = new THREE.Points(geo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(cv), size: 2.6, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); this.hl.frustumCulled = false; this.scene.add(this.hl); this.objs.push(this.hl); }
    this.M4 = new THREE.Matrix4(); this.M5 = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.E = new THREE.Euler(0, 0, 0, 'YXZ'); this.V = new THREE.Vector3(); this.S1 = new THREE.Vector3(1, 1, 1); this.C = new THREE.Color();
  }
  setNight(k) { this.night = k; if (this.hl) this.hl.material.opacity = Math.min(1, k*1.15); const f = 0.9 + 0.9*k; for (const kn of KINDS) { const I = this.inst[kn]; if (I.front) I.front.material.color.setScalar(0.55 + 3.2*k); } }
  update(dt, night, camera) {
    if (!this.on) return; this.step(Math.min(dt, 0.1)); this.cam = camera; const cx = this.player.x, cz = this.player.z, R2 = this.renderR*this.renderR;
    this.S1.setScalar(this.scale || 1); for (const k of KINDS) this.inst[k].n = 0; let shown = 0; let hn = 0; const hlOn = this.night > 0.05 && this.hl; if (this.hl) this.hl.material.size = 2.6*(this.scale || 1);
    for (const ag of this.agents) {
      if (!ag.piece) continue; const dx = ag.x - cx, dz = ag.z - cz; if (dx*dx + dz*dz > R2) continue;
      const I = this.inst[ag.kind]; if (I.n >= this.cap) continue; const i = I.n++; shown++;
      const gy = this.world.ground(ag.x, ag.z, ag.y ?? this.player.y); if (gy === null) { I.n--; continue; } if (ag.y === null || Math.abs(gy - ag.y) > 8) ag.y = gy; else { const mv = ag._px === undefined ? 0 : Math.hypot(ag.x - ag._px, ag.z - ag._pz), lim = 0.16*mv + 0.02, d = (gy - ag.y)*Math.min(1, dt*14); ag.y += Math.max(-lim, Math.min(lim, d)); } ag._px = ag.x; ag._pz = ag.z;   // ramps: climb at a realistic grade, never jump
      const L = ag.K.wb ? ag.K.wb/2 : 0.9, f = [Math.cos(ag.ang), Math.sin(ag.ang)]; const gf = this.world.ground(ag.x + f[0]*L, ag.z + f[1]*L, ag.y), gb = this.world.ground(ag.x - f[0]*L, ag.z - f[1]*L, ag.y); const pitch = (gf !== null && gb !== null && Math.abs(gf - gb) < 2) ? Math.atan2(gf - gb, 2*L) : 0; ag.pitch += (pitch - ag.pitch)*Math.min(1, dt*8);
      const kap = (ag.piece.ang[Math.min(ag.i + 1, ag.piece.n - 1)] - ag.piece.ang[Math.max(ag.i - 1, 0)])/Math.max(ag.piece.cum[Math.min(ag.i + 1, ag.piece.n - 1)] - ag.piece.cum[Math.max(ag.i - 1, 0)], 1e-3);
      const st = ag.K.wb ? Math.max(-0.55, Math.min(0.55, Math.atan(ag.K.wb*kap))) : 0; ag.steer += (st - ag.steer)*Math.min(1, dt*8); const rl = ag.kind === 'moto' ? -Math.atan(ag.v*ag.v*kap/9.81)*0.85 : -Math.atan(ag.v*ag.v*kap/9.81)*0.1; ag.roll += (Math.max(-0.55, Math.min(0.55, rl)) - ag.roll)*Math.min(1, dt*6);
      this.E.set(ag.roll, -ag.ang, ag.pitch); this.Q.setFromEuler(this.E); this.V.set(ag.x, ag.y + 0.02, ag.z); this.M4.compose(this.V, this.Q, this.S1);
      if (hlOn) { const hw = ag.kind === 'moto' ? 0 : 0.55*(this.scale || 1), fx = f[0]*(ag.len*0.5 + 0.1), fz = f[1]*(ag.len*0.5 + 0.1), n = hw ? 2 : 1; for (let q = 0; q < n; q++) { const sd = hw ? (q ? hw : -hw) : 0, o = hn++*3; this.hlPos[o] = ag.x + fx - f[1]*sd; this.hlPos[o + 1] = ag.y + (ag.kind === 'truck' || ag.kind === 'sotrama' ? 0.9 : 0.65); this.hlPos[o + 2] = ag.z + fz + f[0]*sd; } }
      I.body.setMatrixAt(i, this.M4); I.detail.setMatrixAt(i, this.M4); if (I.front) I.front.setMatrixAt(i, this.M4); if (I.rear) I.rear.setMatrixAt(i, this.M4); if (I.sign) I.sign.setMatrixAt(i, this.M4);
      if (!ag.color) ag.color = ag.K.colors[(Math.random()*ag.K.colors.length) | 0]; I.body.instanceColor.setXYZ(i, ag.color[0], ag.color[1], ag.color[2]);
      const nw = ag.K.wheels.length; for (let w = 0; w < nw; w++) { const W = ag.K.wheels[w]; this.E.set(0, W.front && ag.kind !== 'moto' ? -ag.steer : 0, -ag.wang); this.Q.setFromEuler(this.E); this.V.set(W.x, W.y, W.z); this.M5.compose(this.V, this.Q, this.S1); this.M5.premultiply(this.M4); I.wheels.setMatrixAt(i*nw + w, this.M5); }
    }
    if (this.hl) { this.hl.geometry.setDrawRange(0, hn); this.hl.geometry.attributes.position.needsUpdate = true; }
    for (const k of KINDS) { const I = this.inst[k], n = I.n, nw = this.models.kinds[k].wheels.length; for (const p of ['body', 'detail', 'front', 'rear', 'sign']) if (I[p]) { I[p].count = n; I[p].instanceMatrix.needsUpdate = true; } I.wheels.count = n*nw; I.wheels.instanceMatrix.needsUpdate = true; if (I.body.instanceColor) I.body.instanceColor.needsUpdate = true; }
    this.shown = shown; this._signals(dt); this._furniture(dt); this._renderPeds(dt);
  }
  /** Exploration 3D : la circulation suit le point regardé (focus = {x, z, y, len, vf, yaw}) ; les véhicules sont agrandis avec l'altitude pour rester visibles. */
  beginExplore(focus) { this._pl = this.player; this._dens = this.density; this.renderR = 700; this.scale = 1; this.start({ x: focus.x, z: focus.z }, this.density, focus); }
  endExplore(player) { this.renderR = 360; this.scale = 1; this.S1.setScalar(1); if (player) this.start({ x: player.x, z: player.z }, this._dens ?? this.density, player); else { this.on = false; this.hide(); } }
  hide() { if (this.hl) this.hl.geometry.setDrawRange(0, 0); for (const k of KINDS) { const I = this.inst[k]; for (const p of ['body', 'detail', 'front', 'rear', 'sign', 'wheels']) if (I[p]) I[p].count = 0; I.n = 0; } }
  nearPositions(R) { const out = [], cx = this.player.x, cz = this.player.z, R2 = R*R; for (const a of this.agents) if (a.piece && (a.x - cx)**2 + (a.z - cz)**2 < R2) out.push([a.x, a.z]); return out; }
  // ---------- player collisions ----------
  collidePlayer(p, dt) {
    for (const ag of this.agents) { if (!ag.piece) continue; const dx = ag.x - p.x, dz = ag.z - p.z; const rr = (ag.len + p.len)*0.5*0.78; if (dx*dx + dz*dz > rr*rr*1.4) continue; if (Math.abs((ag.y ?? p.y) - p.y) > 2.5) continue;
      // oriented boxes, 3 circles per vehicle
      const cp = [-0.3, 0, 0.3].map(f => [p.x + Math.cos(p.yaw)*p.len*f, p.z + Math.sin(p.yaw)*p.len*f]), ca = [-0.3, 0, 0.3].map(f => [ag.x + Math.cos(ag.ang)*ag.len*f, ag.z + Math.sin(ag.ang)*ag.len*f]); const r1 = p.wid*0.52, r2 = (ag.kind === 'moto' ? 0.45 : ag.kind === 'truck' ? 1.15 : 0.9);
      let hit = null; for (const a of cp) for (const b of ca) { const ddx = b[0] - a[0], ddz = b[1] - a[1], d = Math.hypot(ddx, ddz); if (d < r1 + r2) { hit = [ddx/(d || 1), ddz/(d || 1), r1 + r2 - d]; break; } } if (!hit) continue;
      const rel = Math.hypot(p.vx - ag.v*Math.cos(ag.ang), p.vz - ag.v*Math.sin(ag.ang)); const mp = p.P.mass, ma = ag.kind === 'truck' ? 7500 : ag.kind === 'moto' ? 190 : ag.kind === 'sotrama' ? 2400 : 1300, w = ma/(mp + ma);
      p.x -= hit[0]*hit[2]*w; p.z -= hit[1]*hit[2]*w; ag.x += hit[0]*hit[2]*(1 - w)*0.5; ag.z += hit[1]*hit[2]*(1 - w)*0.5; const pushV = Math.max(0, p.vx*hit[0] + p.vz*hit[1]); p.vx -= hit[0]*pushV*w*1.2; p.vz -= hit[1]*pushV*w*1.2; ag.v = Math.max(0, ag.v - 2.5);
      if (rel > 2.5 && (ag.hitT || 0) < this.t - 0.8) { ag.hitT = this.t; p.onCrash && p.onCrash(rel); } }
  }
}
install(Traffic);
