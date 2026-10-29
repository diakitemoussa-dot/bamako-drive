// Street furniture (traffic lights, zebra crossings, signs) and pedestrians for the AI traffic. Installed onto Traffic.prototype.
import * as THREE from 'three';
const rnd = (a, b) => a + Math.random()*(b - a);
const PED_COLS = [[0.85, 0.3, 0.15], [0.15, 0.35, 0.7], [0.92, 0.92, 0.88], [0.8, 0.7, 0.15], [0.1, 0.45, 0.25], [0.55, 0.15, 0.35], [0.15, 0.15, 0.18], [0.95, 0.55, 0.15]];
const SKIN = [[0.3, 0.18, 0.12], [0.38, 0.24, 0.16], [0.24, 0.14, 0.1], [0.45, 0.3, 0.2]];
const LAMP = { R: [1.0, 0.05, 0.04], A: [1.0, 0.58, 0.02], G: [0.08, 1.0, 0.25] };

function signTexture(kind, val) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.clearRect(0, 0, 128, 128);
  if (kind === 'speed') { g.fillStyle = '#d3201a'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 46, 0, 7); g.fill(); g.fillStyle = '#111'; g.font = 'bold 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(val), 64, 68); }
  else if (kind === 'stop') { g.fillStyle = '#c4141a'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI/8 + i*Math.PI/4; g.lineTo(64 + 62*Math.cos(a), 64 + 62*Math.sin(a)); } g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 5; g.stroke(); g.fillStyle = '#fff'; g.font = 'bold 36px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', 64, 66); }
  else if (kind === 'yield') { g.fillStyle = '#d3201a'; g.beginPath(); g.moveTo(6, 22); g.lineTo(122, 22); g.lineTo(64, 122); g.closePath(); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(26, 34); g.lineTo(102, 34); g.lineTo(64, 100); g.closePath(); g.fill(); }
  else { g.fillStyle = '#0a3fa8'; g.fillRect(6, 6, 116, 116); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(64, 20); g.lineTo(108, 100); g.lineTo(20, 100); g.closePath(); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(64, 54, 8, 0, 7); g.fill(); g.fillRect(58, 62, 12, 22); g.fillRect(52, 84, 8, 12); g.fillRect(68, 84, 8, 12); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function install(T) {
  const P = T.prototype;
  P._buildFurniture = function () {
    this.furn = {}; const box = new THREE.BoxGeometry(1, 1, 1), dark = new THREE.MeshLambertMaterial({ color: 0x4a4e55, flatShading: true }), head = new THREE.MeshLambertMaterial({ color: 0x0b0b0d, flatShading: true });
    const mk = (g, m, cap, color) => { const o = new THREE.InstancedMesh(g, m, cap); o.frustumCulled = false; o.count = 0; if (color) o.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap*3), 3); this.scene.add(o); this.objs.push(o); return o; };
    this.furn.poles = mk(box, dark, 420); this.furn.arms = mk(box, dark, 420); this.furn.heads = mk(box, head, 700); this.furn.lamps = mk(box, new THREE.MeshBasicMaterial({ color: 0xffffff }), 2200, true);
    this.furn.zebra = mk(box, new THREE.MeshLambertMaterial({ color: 0xe9e9e2 }), 2400); this.furn.spoles = mk(box, dark, 1300);
    const pg = new THREE.PlaneGeometry(0.8, 0.8); this.furn.signs = {};
    const defs = [['speed', 40], ['speed', 50], ['speed', 60], ['stop', 0], ['yield', 0], ['cross', 0]];
    for (const [k, v] of defs) { const tex = signTexture(k, v); const m = new THREE.MeshBasicMaterial({ map: tex, transparent: k === 'speed', alphaTest: 0.5, side: THREE.DoubleSide }); this.furn.signs[k + v] = mk(pg, m, 500); }
    this.signList = this.signList || null; this.lampIdx = []; this.lastState = new Map();
    fetch('data/signs.json').then(r => r.json()).then(s => { this.signList = s; this.furnT = 0; }).catch(() => {});
  };
  P._furniture = function (dt) {
    this.furnT -= dt; const p = this.player; const moved = Math.hypot(p.x - this.furnPos[0], p.z - this.furnPos[1]) > 120;
    if (this.furnT <= 0 || moved) { this.furnT = 4; this.furnPos = [p.x, p.z]; this._rebuildFurniture(); }
    // lamp colours by phase state (only when a phase changes)
    if (this.lampIdx.length) { const night = this.night; let dirty = false; const lamps = this.furn.lamps, C = new THREE.Color();
      for (const L of this.lampIdx) { const st = this.sigState(L.node, L.phase); const key = L.node + '_' + L.phase; const prev = L.last; const nk = st + (night > 0.4 ? 'n' : 'd'); if (L.last === nk) continue; L.last = nk;
        const on = LAMP[L.col === 0 ? 'R' : L.col === 1 ? 'A' : 'G'], act = st === (L.col === 0 ? 'R' : L.col === 1 ? 'A' : 'G'), gain = act ? (night > 0.4 ? 2.0 : 1.3) : 0.04; lamps.setColorAt(L.i, C.setRGB(on[0]*gain, on[1]*gain, on[2]*gain)); dirty = true; }
      if (dirty) lamps.instanceColor.needsUpdate = true; }
  };
  P._rebuildFurniture = function () {
    const p = this.player, R = 620, R2 = R*R, world = this.world, F = this.furn, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
    let np = 0, na = 0, nh = 0, nl = 0, nz = 0, ns = 0; this.lampIdx = []; const cols = [];
    const put = (mesh, i, x, y, z, sx, sy, sz, ry) => { E.set(0, ry, 0); Q.setFromEuler(E); V.set(x, y, z); S.set(sx, sy, sz); M.compose(V, Q, S); mesh.setMatrixAt(i, M); };
    for (const s of this.g.signals) { if ((s.x - p.x)**2 + (s.z - p.z)**2 > R2) continue;
      for (const a of s.approaches) { const T = a.T, ry = -Math.atan2(T[1], T[0]), Rn = [-T[1], T[0]], L = [T[1], -T[0]];     // R = right of travel, L = left
        const bx = a.stop[0] + T[0]*1.2 + Rn[0]*2.5, bz = a.stop[1] + T[1]*1.2 + Rn[1]*2.5, gy = world.ground(bx, bz, null); if (gy === null || np >= 418) continue;
        put(F.poles, np++, bx, gy + 2.8, bz, 0.22, 5.6, 0.22, ry); cols.push([bx, bz, 0.26, gy, gy + 5.6]); const reach = 2.5 + (a.nl === 2 ? 3.4 : 0) + 0.6; put(F.arms, na++, bx + L[0]*reach/2, gy + 5.45, bz + L[1]*reach/2, 0.14, 0.14, reach, -Math.atan2(L[1], L[0]));
        const heads = [[a.stop[0] + T[0]*1.2, a.stop[1] + T[1]*1.2]]; if (a.nl === 2) heads.push([a.stop[0] + T[0]*1.2 + L[0]*3.4, a.stop[1] + T[1]*1.2 + L[1]*3.4]);
        for (const h of heads) { if (nh >= 698) break; put(F.heads, nh++, h[0], gy + 4.75, h[1], 0.32, 1.05, 0.34, ry); for (let c = 0; c < 3 && nl < 2198; c++) { const lx = h[0] - T[0]*0.18, lz = h[1] - T[1]*0.18, ly = gy + 4.75 + [0.32, 0, -0.32][c]; put(F.lamps, nl, lx, ly, lz, 0.05, 0.22, 0.22, ry); F.lamps.setColorAt(nl, C.setRGB(0.05, 0.05, 0.05)); this.lampIdx.push({ i: nl, node: s.node, phase: a.phase, col: c, last: '' }); nl++; } }
        const Cc = a.C; for (let k = -3; k <= 3 && nz < 2398; k++) { const zx = Cc[0] - T[0]*2.4 + Rn[0]*k, zz = Cc[1] - T[1]*2.4 + Rn[1]*k, zy = world.ground(zx, zz, gy); if (zy === null) continue; put(F.zebra, nz++, zx, zy + 0.05, zz, 3.0, 0.04, 0.5, ry); } } }
    // signs
    const counts = {}; let sp = 0; if (this.signList) for (const s of this.signList) { if ((s[0] - p.x)**2 + (s[1] - p.z)**2 > R2) continue; const gy = world.ground(s[0], s[1], null); if (gy === null) continue; const key = s[4] === 'speed' ? 'speed' + (s[5] === 40 || s[5] === 50 || s[5] === 60 ? s[5] : 50) : s[4] + 0; const m = F.signs[key]; if (!m) continue; const i = counts[key] || 0; if (i >= 498 || sp >= 1298) continue; counts[key] = i + 1;
      put(F.spoles, sp++, s[0], gy + 1.18, s[1], 0.08, 2.36, 0.08, 0); cols.push([s[0], s[1], 0.16, gy, gy + 2.4]); put(m, i, s[0] - s[2]*0.07, gy + 1.97, s[1] - s[3]*0.07, 1, 1, 1, Math.atan2(-s[2], -s[3])); }
    for (const k in F.signs) { F.signs[k].count = counts[k] || 0; F.signs[k].instanceMatrix.needsUpdate = true; }
    const set = (m, n) => { m.count = n; m.instanceMatrix.needsUpdate = true; }; set(F.poles, np); set(F.arms, na); set(F.heads, nh); set(F.lamps, nl); set(F.zebra, nz); set(F.spoles, sp); if (F.lamps.instanceColor) F.lamps.instanceColor.needsUpdate = true;
    for (const L of this.lampIdx) L.last = ''; this.sigCount = { poles: np, lamps: nl, zebra: nz, signs: sp }; this.world.extraCols = cols;
  };
  P._signals = function (dt) { };
  // ---------- pedestrians ----------
  P._buildPeds = function () {
    const cap = Math.max(20, this.prof.peds), mk = (g, m, tint) => { const o = new THREE.InstancedMesh(g, m, cap); o.frustumCulled = false; o.count = 0; if (tint) o.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap*3), 3); this.scene.add(o); this.objs.push(o); return o; };
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }); const body = new THREE.BoxGeometry(0.4, 0.62, 0.24); body.translate(0, 1.16, 0); const head = new THREE.BoxGeometry(0.2, 0.24, 0.2); head.translate(0, 1.6, 0); const leg = new THREE.BoxGeometry(0.14, 0.86, 0.14); leg.translate(0, -0.43, 0);
    this.pm = { body: mk(body, mat, true), head: mk(head, mat, true), legL: mk(leg, mat, true), legR: mk(leg, mat, true), cap }; this.peds = [];
  };
  P._initPeds = function (c) {
    this.peds = []; const n = this.prof.peds, crossN = Math.round(n*0.28);
    this.xwalks = []; for (const s of this.g.signals) for (const a of s.approaches) { const T = a.T, Rn = [-T[1], T[0]]; this.xwalks.push({ node: s.node, phase: a.phase, x: a.C[0] - T[0]*2.4, z: a.C[1] - T[1]*2.4, Rn, T }); }
    for (let i = 0; i < n; i++) { const pd = { mode: 'off', x: 0, z: 0, y: 0, head: 0, speed: rnd(1.0, 1.6), ph: rnd(0, 6.28), col: PED_COLS[(Math.random()*PED_COLS.length) | 0], skin: SKIN[(Math.random()*SKIN.length) | 0], h: rnd(0.93, 1.08), edge: null, s: 0, lo: 0, hi: 1, dirn: 1, off: 2.9, wait: 0, prog: 0, side: 1, xw: null, vis: false };
      this.peds.push(pd); if (i < crossN) this._pedCross(pd, c.x, c.z, 520); else this._pedWalk(pd, c.x, c.z, 20, 480); }
  };
  P._pedWalk = function (pd, cx, cz, rmin, rmax) {
    const g = this.g, cell = 24, r = Math.ceil(rmax/cell), ci = Math.floor(cx/cell), cj = Math.floor(cz/cell), ids = new Set();
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) { const a = g.grid.get(i*100000 + j); if (a) for (const id of a) ids.add(id); }
    const c = [...ids].filter(id => { const e = g.edges[id]; if (e.len < 40 || e.level === 1 || e.bridge) return false; const d = Math.hypot(g.px(e, e.n >> 1) - cx, g.pz(e, e.n >> 1) - cz); return d >= rmin && d <= rmax; }); if (!c.length) { pd.mode = 'off'; return; }
    const id = c[(Math.random()*c.length) | 0], Pc = this.edgePiece(id), span = rnd(18, 55), lo = rnd(Pc.a + 2, Math.max(Pc.a + 3, Pc.b - span)); Object.assign(pd, { mode: 'walk', edge: Pc, lo, hi: Math.min(Pc.b - 2, lo + span), s: rnd(lo, Math.min(Pc.b - 2, lo + span)), dirn: Math.random() < 0.5 ? 1 : -1, off: 2.9 + rnd(-0.3, 0.9) });
  };
  P._pedCross = function (pd, cx, cz, R) {
    const xs = this.xwalks.filter(x => (x.x - cx)**2 + (x.z - cz)**2 < R*R); if (!xs.length) { this._pedWalk(pd, cx, cz, 20, 480); return; } const xw = xs[(Math.random()*xs.length) | 0];
    Object.assign(pd, { mode: 'wait', xw, side: Math.random() < 0.5 ? 1 : -1, wait: rnd(0, 12) }); pd.x = xw.x + xw.Rn[0]*5.3*pd.side; pd.z = xw.z + xw.Rn[1]*5.3*pd.side;
  };
  P._stepPeds = function (dt) {
    const pl = this.player, R2 = (this.renderR + 60)**2; this._pedT = (this._pedT || 0) + dt;
    for (const pd of this.peds) { if (pd.mode === 'off') continue; let moving = false;
      if (pd.mode === 'walk') { const E = pd.edge; let s = pd.s + pd.dirn*pd.speed*dt; if (s > pd.hi) { s = pd.hi; pd.dirn = -1; } else if (s < pd.lo) { s = pd.lo; pd.dirn = 1; } pd.s = s; const q = E.at(s); pd.x = q.x + Math.sin(q.ang)*pd.off; pd.z = q.z - Math.cos(q.ang)*pd.off; pd.head = pd.dirn > 0 ? q.ang : q.ang + Math.PI; moving = true; }
      else { const xw = pd.xw; if (pd.mode === 'wait') { pd.wait -= dt; pd.head = Math.atan2(-xw.Rn[1]*pd.side, -xw.Rn[0]*pd.side); if (pd.wait <= 0 && this.sigState(xw.node, xw.phase) === 'R' && this.sigState(xw.node, xw.phase, 7.5) === 'R') { pd.mode = 'cross'; pd.prog = 0; } }
        else { pd.prog += pd.speed*dt; const k = Math.min(pd.prog/10.6, 1); pd.x = xw.x + xw.Rn[0]*5.3*pd.side*(1 - 2*k); pd.z = xw.z + xw.Rn[1]*5.3*pd.side*(1 - 2*k); pd.head = Math.atan2(-xw.Rn[1]*pd.side, -xw.Rn[0]*pd.side); moving = true; if (k >= 1) { pd.mode = 'wait'; pd.side = -pd.side; pd.wait = rnd(6, 22); } } }
      pd.moving = moving; if (moving) pd.ph += pd.speed*dt*4.4;
      const dx = pd.x - pl.x, dz = pd.z - pl.z; if (dx*dx + dz*dz > R2*1.6 && pd.mode === 'walk') { if (Math.random() < 0.02) this._pedWalk(pd, pl.x, pl.z, this.renderR*0.5, this.renderR + 80); } }
  };
  P._renderPeds = function (dt) {
    const pl = this.player, pm = this.pm; if (!pm) return; const R2 = this.renderR**2, M = new THREE.Matrix4(), M2 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), E = new THREE.Euler(), C = new THREE.Color(); let n = 0;
    for (const pd of this.peds) { if (pd.mode === 'off' || n >= pm.cap) continue; const dx = pd.x - pl.x, dz = pd.z - pl.z; if (dx*dx + dz*dz > R2) continue; const gy = this.world.ground(pd.x, pd.z, pd.mode === 'cross' ? pl.y : null); if (gy === null) continue;
      pd.y += ((gy + 0.1) - pd.y)*Math.min(1, dt*10) + (Math.abs(gy + 0.1 - pd.y) > 1 ? gy + 0.1 - pd.y : 0); E.set(0, -pd.head, 0); Q.setFromEuler(E); const bob = pd.moving ? 0.03*Math.abs(Math.sin(pd.ph)) : 0; V.set(pd.x, pd.y + bob, pd.z); S.set(1, pd.h, 1); M.compose(V, Q, S);
      pm.body.setMatrixAt(n, M); pm.head.setMatrixAt(n, M); const sw = pd.moving ? 0.55*Math.sin(pd.ph) : 0;
      for (const [leg, off, sg] of [[pm.legL, -0.1, 1], [pm.legR, 0.1, -1]]) { E.set(0, 0, sg*sw); const q2 = new THREE.Quaternion().setFromEuler(E); V.set(0, 0.86*pd.h, off); M2.compose(V, q2, S.set(1, pd.h, 1)); M2.premultiply(M); leg.setMatrixAt(n, M2); }
      pm.body.setColorAt(n, C.setRGB(...pd.col)); pm.head.setColorAt(n, C.setRGB(...pd.skin)); pm.legL.setColorAt(n, C.setRGB(0.14, 0.15, 0.2)); pm.legR.setColorAt(n, C.setRGB(0.14, 0.15, 0.2)); n++; }
    for (const k of ['body', 'head', 'legL', 'legR']) { pm[k].count = n; pm[k].instanceMatrix.needsUpdate = true; pm[k].instanceColor.needsUpdate = true; } this.pedShown = n;
  };
}
