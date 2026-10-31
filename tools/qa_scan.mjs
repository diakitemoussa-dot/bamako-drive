// Contrôle qualité automatique des données du jeu (même logique que js/world.js) :
// pour chaque voie du réseau, tous les ~2 m : tuile présente, sol présent, pas de cellule « solide » (mur invisible),
// pas de poteau / tronc sur la voie, pas de marche brusque. Usage : node tools/qa_scan.mjs  → data/qa_report.json
import fs from 'fs'; import zlib from 'zlib';
const D = new URL('../data/', import.meta.url);
const man = JSON.parse(fs.readFileSync(new URL('manifest.json', D))); const T = man.tile;
const tiles = new Map();
function tile(x, z) {
  const i = Math.floor((x - man.tx0)/T), j = Math.floor((z - man.tz0)/T), k = i + ',' + j;
  if (tiles.has(k)) return tiles.get(k);
  let t = null; const f = new URL(`tiles/t_${i}_${j}.bin.gz`, D);
  if (fs.existsSync(f)) {
    const raw = zlib.gunzipSync(fs.readFileSync(f)); const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength); const dv = new DataView(buf);
    const hl = dv.getUint32(4, true); const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)).replace(/\0+$/, '')); const base = 8 + hl, off = head.off;
    t = { ox: head.ox, oz: head.oz, h0: new Int16Array(buf.slice(base + off.h0, base + off.h0 + 101*101*2)), h1: head.h1 ? new Int16Array(buf.slice(base + off.h1, base + off.h1 + 101*101*2)) : null,
      solid: new Uint8Array(buf.slice(base + off.solid, base + off.solid + 125*16)), cols: head.nc ? new Float32Array(buf.slice(base + off.cols, base + off.cols + head.nc*20)) : null, nc: head.nc || 0 };
  }
  tiles.set(k, t); return t;
}
function samp(a, gx, gz, need) {
  let i = Math.floor(gx), j = Math.floor(gz); i = Math.min(Math.max(i, 0), 99); j = Math.min(Math.max(j, 0), 99); const fx = Math.min(Math.max(gx - i, 0), 1), fz = Math.min(Math.max(gz - j, 0), 1), W = 101;
  const v = [a[j*W + i], a[j*W + i + 1], a[(j+1)*W + i], a[(j+1)*W + i + 1]], w = [(1-fx)*(1-fz), fx*(1-fz), (1-fx)*fz, fx*fz]; let sw = 0, sv = 0;
  for (let k = 0; k < 4; k++) if (v[k] !== -32768) { sw += w[k]; sv += w[k]*v[k]; } return sw >= need ? sv/sw/50 : null;
}
const lo = (t, x, z) => samp(t.h0, (x - t.ox)/2.5, (z - t.oz)/2.5, 0.99), hi = (t, x, z) => t.h1 ? samp(t.h1, (x - t.ox)/2.5, (z - t.oz)/2.5, 0.3) : null;
const solid = (t, x, z) => { const i = Math.floor((x - t.ox)/2), j = Math.floor((z - t.oz)/2); if (i < 0 || j < 0 || i > 124 || j > 124) return 0; return (t.solid[j*16 + (i >> 3)] >> (7 - (i & 7))) & 1; };
const g = JSON.parse(fs.readFileSync(new URL('graph.json', D))); const rawp = zlib.gunzipSync(fs.readFileSync(new URL('graph_pts.bin.gz', D)));
const np = rawp.readUInt32LE(0), pts = new Float32Array(rawp.buffer.slice(rawp.byteOffset + 4, rawp.byteOffset + 4 + np*8));
const issues = { notile: [], noground: [], wall: [], pole: [], step: [], nodeck: [] };
for (const e of g.edges) {
  const [id, , , , , , , , rank, level, , , , off, n] = e; if (rank < 1) continue;
  let prev = null;
  for (let i = 0; i < n - 1; i++) {
    const x0 = pts[(off + i)*2], z0 = pts[(off + i)*2 + 1], x1 = pts[(off + i + 1)*2], z1 = pts[(off + i + 1)*2 + 1], L = Math.hypot(x1 - x0, z1 - z0), k = Math.max(1, Math.ceil(L/2));
    for (let s = 0; s < k; s++) {
      const x = x0 + (x1 - x0)*s/k, z = z0 + (z1 - z0)*s/k, t = tile(x, z);
      if (!t) { issues.notile.push([x, z, id]); prev = null; continue; }
      const gl = lo(t, x, z), gh = hi(t, x, z); let y;
      if (level === 1) { y = gh; if (gh === null && (gl === null || gl < -0.5)) issues.nodeck.push([x, z, id]); if (y === null) y = gl; }
      else { const onDeck = gh !== null && (gl === null || gh > gl + 1.0) && e[10];   // voie de pont marquée « niveau 0 » : la voiture roule sur le tablier
        y = onDeck ? gh : gl; if (y === null) issues.noground.push([x, z, id]); if (solid(t, x, z) && !onDeck) issues.wall.push([x, z, id, gh !== null && gl !== null && gh > gl + 2 ? 'sous-pont' : 'sol']); }
      if (t.cols) for (let c = 0; c < t.nc; c++) { const cx = t.cols[c*5] + t.ox, cz = t.cols[c*5 + 1] + t.oz, cr = t.cols[c*5 + 2], y0 = t.cols[c*5 + 3], y1 = t.cols[c*5 + 4];
        if (Math.abs(cx - x) < 1.2 && Math.abs(cz - z) < 1.2 && Math.hypot(cx - x, cz - z) < 0.6 + Math.min(cr, 0.6) && y !== null && y1 > y + 0.3 && y0 < y + 1.5) issues.pole.push([x, z, id, cx, cz]); }
      if (prev && y !== null && prev[2] !== null && Math.hypot(x - prev[0], z - prev[1]) < 2.6 && Math.abs(y - prev[2]) > 0.6) issues.step.push([x, z, id, +(y - prev[2]).toFixed(2), +prev[2].toFixed(2), +y.toFixed(2), gh !== null ? +gh.toFixed(2) : null, level]);
      prev = [x, z, y];
    }
  }
}
const cluster = (arr, r = 25) => { const cl = []; for (const p of arr) { const c = cl.find(c => Math.abs(c.x - p[0]) < r && Math.abs(c.z - p[1]) < r); if (c) c.n++; else cl.push({ x: Math.round(p[0]), z: Math.round(p[1]), n: 1, extra: p.slice(3) }); } return cl.sort((a, b) => b.n - a.n); };
const rep = {}; for (const k in issues) rep[k] = { points: issues[k].length, places: cluster(issues[k]) };
fs.writeFileSync(new URL('qa_report.json', D), JSON.stringify(rep, null, 1));
for (const k in rep) console.log(k.padEnd(9), 'points', String(rep[k].points).padStart(6), '| endroits', String(rep[k].places.length).padStart(4), '|', rep[k].places.slice(0, 6).map(c => `(${c.x},${-c.z})x${c.n}`).join(' '));
