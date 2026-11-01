// Réparation de l'eau du fleuve (sans Blender). Les triangles d'eau de l'export étaient géants (jusqu'à 170 000 m2) : rangés dans la tuile de leur centre,
// et coordonnées parfois hors de la plage int16 d'une tuile -> trous dans le fleuve (3,5 % de sa surface).
// Ici : on retire toute l'eau (classe 3) des tuiles, on retriangule le contour du fleuve (data/river.json : contour + îles) à la hauteur de l'eau,
// on coupe en morceaux de 120 m max et on range chaque morceau dans la tuile de son centre.
// Usage : node tools/fix_water_tiles.mjs [--dry]. Les tuiles d'origine sont gardées dans data/tiles_avant_eau/ (lues en priorité : relancer est sans danger).
import fs from 'fs'; import zlib from 'zlib'; import { ShapeUtils, Vector2 } from 'three';
const D = 'C:/Users/Kabakoo Apprenant.e/Documents/bamako_game/data/', BK = D + 'tiles_avant_eau/', dry = process.argv.includes('--dry'), MAXE = 120, QS = 0.02;
const man = JSON.parse(fs.readFileSync(D + 'manifest.json', 'utf8')), TILE = man.tile, TX0 = man.tx0, TZ0 = man.tz0, river = JSON.parse(fs.readFileSync(D + 'river.json', 'utf8'));
const hasBK = fs.existsSync(BK); if (!hasBK && !dry) { fs.mkdirSync(BK); for (const t of man.tiles) fs.copyFileSync(D + `tiles/t_${t.ix}_${t.iz}.bin.gz`, BK + `t_${t.ix}_${t.iz}.bin.gz`); }
const src = (ix, iz) => (fs.existsSync(BK + `t_${ix}_${iz}.bin.gz`) ? BK : D + 'tiles/') + `t_${ix}_${iz}.bin.gz`;
function parse(buf) {
  const b = zlib.gunzipSync(buf), hl = b.readUInt32LE(4), head = JSON.parse(b.slice(8, 8 + hl).toString().replace(/\0+$/, '')), base = 8 + hl;
  const offs = Object.entries(head.off).sort((a, c) => a[1] - c[1]), secs = {}; offs.forEach(([k, o], i) => { secs[k] = b.slice(base + o, base + (i + 1 < offs.length ? offs[i + 1][1] : b.length - base)); });
  return { head, secs, order: offs.map(x => x[0]) };
}
function build(t) {
  let off = 0; const blobs = []; t.head.off = {}; for (const k of t.order) { t.head.off[k] = off; blobs.push(t.secs[k]); off += t.secs[k].length; }
  let hb = Buffer.from(JSON.stringify(t.head)); hb = Buffer.concat([hb, Buffer.alloc((4 - hb.length % 4) % 4)]); const pre = Buffer.alloc(8); pre.write('BKT1', 0); pre.writeUInt32LE(hb.length, 4);
  return zlib.gzipSync(Buffer.concat([pre, hb, ...blobs]), { level: 9 });
}
const tiles = new Map(); const cols = []; let yW = 0, nOld = 0;
for (const t of man.tiles) {
  const tl = parse(fs.readFileSync(src(t.ix, t.iz))); tiles.set(t.ix + '_' + t.iz, tl); const { head, secs } = tl; if (!secs.pos) continue;
  const q = new Int16Array(secs.pos.buffer.slice(secs.pos.byteOffset, secs.pos.byteOffset + head.n*6)), col = secs.col, kq = [], kc = [];
  for (let i = 0; i < head.n; i += 3) {
    if (col[i*4 + 3] === 3) { nOld++; yW += q[i*3 + 1]*QS; if (cols.length < 400) cols.push([col[i*4], col[i*4 + 1], col[i*4 + 2]]); continue; }
    for (let k = 0; k < 3; k++) { kq.push(q[(i + k)*3], q[(i + k)*3 + 1], q[(i + k)*3 + 2]); kc.push(col[(i + k)*4], col[(i + k)*4 + 1], col[(i + k)*4 + 2], col[(i + k)*4 + 3]); }
  }
  tl.keep = { q: kq, c: kc };
}
const Y = Math.round(yW/Math.max(nOld, 1)*50)/50; console.log('anciens triangles d\'eau:', nOld, '| hauteur de l\'eau:', Y);
// retriangulation : contour principal (river[0]) + îles (river[1..])
const V = p => p.map(([x, z]) => new Vector2(x, z)); const outer = V(river[0]), holes = river.slice(1).map(V);
if (ShapeUtils.isClockWise(outer)) outer.reverse(); holes.forEach(h => { if (!ShapeUtils.isClockWise(h)) h.reverse(); });
const flat = [...outer, ...holes.flat()], idx = ShapeUtils.triangulateShape(outer, holes);
let pieces = 0; const add = new Map();
for (const [a, b, c] of idx) { let st = [[flat[a], flat[b], flat[c]].map(p => [p.x, p.y])];
  while (st.length) { const T = st.pop(), e = [0, 1, 2].map(k => Math.hypot(T[(k + 1)%3][0] - T[k][0], T[(k + 1)%3][1] - T[k][1])), m = Math.max(...e);
    if (m <= MAXE) { const key = Math.floor(((T[0][0] + T[1][0] + T[2][0])/3 - TX0)/TILE) + '_' + Math.floor(((T[0][1] + T[1][1] + T[2][1])/3 - TZ0)/TILE); if (!add.has(key)) add.set(key, []); add.get(key).push(T); pieces++; continue; }
    const k = e.indexOf(m), p = T[k], q2 = T[(k + 1)%3], r = T[(k + 2)%3], mid = [(p[0] + q2[0])/2, (p[1] + q2[1])/2]; st.push([p, mid, r], [mid, q2, r]); } }
console.log('triangles du contour:', idx.length, '| morceaux:', pieces, '| tuiles concernées:', add.size);
let missing = 0; for (const k of add.keys()) if (!tiles.has(k)) missing++; console.log('tuiles sans fichier:', missing); if (missing) console.log('ATTENTION : ces morceaux seront ignorés');
if (dry) process.exit(0);
let rnd = 7; const R = () => (rnd = (rnd*16807) % 2147483647) / 2147483647; let changed = 0;
for (const t of man.tiles) {
  const key = t.ix + '_' + t.iz, tl = tiles.get(key), pcs = add.get(key) || [], ox = tl.head.ox, oz = tl.head.oz, q = tl.keep ? [...tl.keep.q] : [], c = tl.keep ? [...tl.keep.c] : [];
  for (const T of pcs) { const cc = cols[Math.floor(R()*cols.length)]; for (const [x, z] of T) { q.push(Math.round((x - ox)/QS), Math.round(Y/QS), Math.round((z - oz)/QS)); c.push(cc[0], cc[1], cc[2], 3); } }
  if (q.some(v => v > 32767 || v < -32768)) throw new Error('hors plage int16 dans ' + key);
  if (!tl.secs.pos && !q.length) continue;
  tl.secs.pos = Buffer.from(new Int16Array(q).buffer); if (tl.secs.pos.length % 4) tl.secs.pos = Buffer.concat([tl.secs.pos, Buffer.alloc(4 - tl.secs.pos.length % 4)]);
  tl.secs.col = Buffer.from(new Uint8Array(c)); if (!tl.order.includes('pos')) tl.order.unshift('pos', 'col');
  tl.head.n = q.length/3; fs.writeFileSync(D + `tiles/t_${t.ix}_${t.iz}.bin.gz`, build(tl)); t.n = tl.head.n; t.bytes = fs.statSync(D + `tiles/t_${t.ix}_${t.iz}.bin.gz`).size; changed++;
}
man.v = Math.floor(Date.now()/1000); fs.writeFileSync(D + 'manifest.json', JSON.stringify(man)); console.log('tuiles réécrites:', changed);
