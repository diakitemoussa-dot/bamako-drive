// Road lane graph (shared by AI traffic, player road detection, minimap).
import { gunzipSync } from 'fflate';
const CELL = 24;
export class Graph {
  async load() {
    const [meta, ptsGz, sig] = await Promise.all([fetch('data/graph.json').then(r => r.json()), fetch('data/graph_pts.bin.gz').then(r => r.arrayBuffer()), fetch('data/signals.json').then(r => r.json())]);
    this.nodes = meta.nodes; this.signals = sig;
    const raw = gunzipSync(new Uint8Array(ptsGz)); const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength); const n = dv.getUint32(0, true);
    this.pts = new Float32Array(raw.buffer.slice(raw.byteOffset + 4, raw.byteOffset + 4 + n*8)); this.h = new Uint8Array(raw.buffer.slice(raw.byteOffset + 4 + n*8, raw.byteOffset + 4 + n*9));
    this.edges = meta.edges.map(m => ({ id: m[0], from: m[1], to: m[2], len: m[3], limit: m[4], lane: m[5], nl: m[6], par: m[7], rank: m[8], level: m[9], bridge: m[10], road: m[11], dir: m[12], off: m[13], n: m[14] }));
    this.out = new Map(); this.inn = new Map();
    for (const e of this.edges) { (this.out.get(e.from) || this.out.set(e.from, []).get(e.from)).push(e.id); (this.inn.get(e.to) || this.inn.set(e.to, []).get(e.to)).push(e.id); }
    this.grid = new Map(); const g = this.grid;
    for (const e of this.edges) for (let i = 0; i < e.n; i += 3) { const x = this.pts[(e.off + i)*2], z = this.pts[(e.off + i)*2 + 1]; const k = Math.floor(x/CELL)*100000 + Math.floor(z/CELL); let a = g.get(k); if (!a) g.set(k, a = []); if (a[a.length - 1] !== e.id) a.push(e.id); }
    return this;
  }
  px(e, i) { return this.pts[(e.off + i)*2]; } pz(e, i) { return this.pts[(e.off + i)*2 + 1]; }
  /** closest lane point within maxD: {edge, i, d} */
  nearest(x, z, maxD = 12, pred = null) {
    let best = null; const cx = Math.floor(x/CELL), cz = Math.floor(z/CELL), r = Math.ceil(maxD/CELL);
    for (let i = cx - r; i <= cx + r; i++) for (let j = cz - r; j <= cz + r; j++) { const a = this.grid.get(i*100000 + j); if (!a) continue;
      for (const id of a) { const e = this.edges[id]; if (pred && !pred(e)) continue;
        for (let k = 0; k < e.n; k += 2) { const dx = this.px(e, k) - x, dz = this.pz(e, k) - z, d = dx*dx + dz*dz; if (d < maxD*maxD && (!best || d < best.d2)) best = { edge: e, i: k, d2: d }; } } }
    if (best) best.d = Math.sqrt(best.d2); return best;
  }
  heading(e, i) { const j = Math.min(i + 1, e.n - 1), k = Math.max(j - 1, 0); return Math.atan2(this.pz(e, j) - this.pz(e, k), this.px(e, j) - this.px(e, k)); }
  /** pre-render the main roads for the minimap: 1 px = 5 m */
  renderMap(x0, z0, w, h, scale = 5, river = null) {
    const c = document.createElement('canvas'); c.width = Math.ceil(w/scale); c.height = Math.ceil(h/scale); const g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
    if (river) { g.fillStyle = '#7d93bd'; g.beginPath(); for (const ring of river) { ring.forEach(([x, z], i) => { const px = (x - x0)/scale, py = (z - z0)/scale; i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.closePath(); } g.fill('evenodd'); }
    for (const pass of [[0, 1.2, '#6b5575'], [1, 1.2, '#6b5575'], [2, 1.8, '#8e739a'], [3, 2.4, '#C3A5C7'], [4, 3.4, '#F8F3EA'], [5, 4.0, '#F9D58B']]) {
      g.strokeStyle = pass[2]; g.lineWidth = pass[1]; g.beginPath();
      for (const e of this.edges) { if (e.rank !== pass[0] || (e.nl === 1 && e.dir < 0 && e.rank < 4) ) continue; if (e.lane === 1) continue;
        for (let i = 0; i < e.n; i += 3) { const x = (this.px(e, i) - x0)/scale, y = (this.pz(e, i) - z0)/scale; i === 0 ? g.moveTo(x, y) : g.lineTo(x, y); } }
      g.stroke();
    }
    this.mapCanvas = c; this.mapOrg = [x0, z0, scale]; return c;
  }
}
