// Découpe data/landmarks.glb en un petit GLB par lieu (data/ar/*.glb) pour la réalité augmentée.
// Chaque modèle est recentré (centre en x/z, base à y=0) et réduit pour tenir sur une table (AR_SIZE m dans sa plus grande dimension).
// Écrit aussi data/ar/index.json : nom du lieu (tel qu'affiché dans le jeu) -> fichier + dimensions réelles.
// Usage : node tools/build_ar_models.mjs      (aucune dépendance, pas besoin de Blender)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AR_SIZE = 0.35;   // mètres : taille du modèle dans la pièce
const PLACES = {        // nom affiché dans le jeu -> nœud du GLB (sans le suffixe _bk)
  'Monument de la Paix': 'LM_Monument_Paix', 'Grand Marché': 'LM_Grand_Marche', "Monument de l'Indépendance": 'Monument_Independance',
  'Ecobank (Ave de la Nation)': 'Ecobank_Siege', 'Tour BCEAO': 'Tour_BCEAO_Reel', 'Cathédrale': 'LM_Cathedrale', 'Grande Mosquée': 'LM_Grande_Mosquee',
  'Stade Modibo Keïta': 'LM_Stade_Modibo_Keita', 'Palais de la Culture': 'LM_Palais_Culture', 'Azalaï Hôtel': 'Azalai_Hotel',
  'Radisson Collection': 'Radisson_Hotel', 'Cité Administrative': 'Cite_Administrative', "Hôtel de l'Amitié": 'Amitie_Hotel', 'Hôtel Libya': 'Libya_Hotel',
  'Gare de Bamako': 'Gare_Bamako', 'CHU Gabriel Touré': 'CHU_Gabriel_Toure', 'Musée National': 'Musee_National', 'Assemblée Nationale': 'Assemblee_Nationale',
  'Mémorial Modibo Keïta': 'Memorial_Keita', 'CICB': ['CICB', 'CICB_Hall', 'CICB_Fontaine'],
};

// Certains monuments n'ont dans landmarks.glb que leurs faces texturées (toits) : leurs murs sont dans les tuiles de la ville
// (classe 1 = « X_Mur », stockée dans l'alpha des couleurs). On les récupère autour de l'emprise du monument.
const WALLS_FROM_TILES = { 'Cité Administrative': { cls: 1 }, 'CHU Gabriel Touré': { cls: 1 } };
const TILE = 250, TX0 = -2400, TZ0 = -2800, CELL = 2, MARGIN = 3, COLOR_TOL = 40;   // grille des tuiles (data/manifest.json) ; masque d'emprise à 2 m, dilaté de 3 m

const buf = fs.readFileSync(path.join(ROOT, 'data/landmarks.glb'));
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('landmarks.glb : pas un GLB');
const jl = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
const bin = buf.subarray(28 + jl, 28 + jl + buf.readUInt32LE(20 + jl));

const srgb2lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
/** triangles (sommets en coordonnées monde) d'un nœud du GLB — nœud sans transformation uniquement */
function nodeTriangles(node) {
  if (node.translation || node.rotation || node.scale) throw new Error(node.name + ' : murs depuis les tuiles non gérés avec transformation');
  const tris = [], CT = { 5126: 4, 5125: 4, 5123: 2 };
  for (const p of json.meshes[node.mesh].primitives) {
    const at = (ai, i, comp) => { const a = json.accessors[ai], v = json.bufferViews[a.bufferView], nc = { SCALAR: 1, VEC3: 3 }[a.type], sz = CT[a.componentType], o = (v.byteOffset || 0) + (a.byteOffset || 0) + i * (v.byteStride || nc * sz) + comp * sz;
      return a.componentType === 5126 ? bin.readFloatLE(o) : a.componentType === 5125 ? bin.readUInt32LE(o) : bin.readUInt16LE(o); };
    const P = i => [at(p.attributes.POSITION, i, 0), at(p.attributes.POSITION, i, 1), at(p.attributes.POSITION, i, 2)];
    const n = p.indices !== undefined ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count;
    for (let t = 0; t + 2 < n; t += 3) tris.push([0, 1, 2].map(k => P(p.indices !== undefined ? at(p.indices, t + k, 0) : t + k)));
  }
  return tris;
}
const tileCache = new Map();
function tile(ix, iz) {
  const k = ix + '_' + iz; if (tileCache.has(k)) return tileCache.get(k);
  const f = path.join(ROOT, `data/tiles/t_${ix}_${iz}.bin.gz`); let t = null;
  if (fs.existsSync(f)) { const b = zlib.gunzipSync(fs.readFileSync(f)), hl = b.readUInt32LE(4); t = { head: JSON.parse(b.subarray(8, 8 + hl).toString('utf8').replace(/\0+$/, '')), b, base: 8 + hl }; }
  tileCache.set(k, t); return t;
}
/** triangles de classe `cls` des tuiles dont le centre tombe dans le masque d'emprise des triangles `tris` */
function wallsFromTiles(tris, cls) {
  const mask = new Set(), m = Math.ceil(MARGIN / CELL), cell = v => Math.floor(v / CELL);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const T of tris) {
    const xs = T.map(v => v[0]), zs = T.map(v => v[2]);
    for (let i = cell(Math.min(...xs)) - m; i <= cell(Math.max(...xs)) + m; i++) for (let j = cell(Math.min(...zs)) - m; j <= cell(Math.max(...zs)) + m; j++) mask.add(i + ',' + j);
    x0 = Math.min(x0, ...xs); x1 = Math.max(x1, ...xs); z0 = Math.min(z0, ...zs); z1 = Math.max(z1, ...zs);
  }
  const out = [];
  for (let ix = Math.floor((x0 - MARGIN - TX0) / TILE); ix <= Math.floor((x1 + MARGIN - TX0) / TILE); ix++) for (let iz = Math.floor((z0 - MARGIN - TZ0) / TILE); iz <= Math.floor((z1 + MARGIN - TZ0) / TILE); iz++) {
    const t = tile(ix, iz); if (!t || !t.head.n) continue; const { head, b, base } = t, off = head.off, qs = head.qs;
    for (let v = 0; v + 2 < head.n; v += 3) {
      if (b[base + off.col + v * 4 + 3] !== cls) continue;
      const P = [0, 1, 2].map(k => [0, 1, 2].map(a => b.readInt16LE(base + off.pos + ((v + k) * 3 + a) * 2) * qs)); for (const q of P) { q[0] += head.ox; q[2] += head.oz; }
      if (!mask.has(cell((P[0][0] + P[1][0] + P[2][0]) / 3) + ',' + cell((P[0][2] + P[1][2] + P[2][2]) / 3))) continue;
      out.push({ P, C: [0, 1, 2].map(k => [0, 1, 2].map(a => b[base + off.col + (v + k) * 4 + a])) });
    }
  }
  // garde les murs de la teinte dominante du monument (écarte les maisons voisines de la même classe)
  if (out.length) {
    const avg = w => [0, 1, 2].map(a => (w.C[0][a] + w.C[1][a] + w.C[2][a]) / 3), med = a => { const v = out.map(w => avg(w)[a]).sort((x, y) => x - y); return v[v.length >> 1]; };
    const M = [med(0), med(1), med(2)];
    const ny = w => { const [A, B, C] = w.P, u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]], N = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; return Math.abs(N[1]) / (Math.hypot(...N) || 1); };
    // murs (verticaux) ou toits (horizontaux) seulement : les triangles inclinés sont des éclats de maisons voisines
    return out.filter(w => avg(w).every((c, a) => Math.abs(c - M[a]) <= COLOR_TOL) && (ny(w) < 0.25 || ny(w) > 0.9));
  }
  return out;
}

/** PNG 128x128 d'un motif de fenêtre (mur blanc, vitre bleu-gris) — encodeur minimal, sans dépendance */
function windowPng() {
  const W = 128, H = 128, raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      let c = [255, 255, 255];
      if (x >= 32 && x < 96 && y >= 24 && y < 92) c = y < 58 ? [86, 112, 142] : [52, 72, 98];            // vitre (reflet du ciel en haut)
      else if (x >= 30 && x < 98 && y >= 22 && y < 94) c = [170, 170, 170];                               // cadre
      else if (x >= 28 && x < 100 && y >= 94 && y < 98) c = [205, 205, 205];                              // appui de fenêtre
      if ((x === 63 || x === 64) && y >= 24 && y < 92) c = [175, 175, 175];                               // montant central
      const o = y * (W * 4 + 1) + 1 + x * 4; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = 255;
    }
  }
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); data.copy(b, 8); b.writeUInt32BE(zlib.crc32(b.subarray(4, 8 + data.length)) >>> 0, 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function extract(nodes, label) {
  const out = { asset: { version: '2.0', generator: 'bamako-drive build_ar_models' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [], meshes: [], materials: [], textures: [], images: [], samplers: [], accessors: [], bufferViews: [] };
  const chunks = []; let off = 0;
  const maps = { acc: new Map(), bv: new Map(), mat: new Map(), tex: new Map(), img: new Map(), smp: new Map() };
  const bv = i => {
    if (maps.bv.has(i)) return maps.bv.get(i);
    const v = json.bufferViews[i], pad = (4 - off % 4) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
    const n = { buffer: 0, byteOffset: off, byteLength: v.byteLength }; if (v.byteStride) n.byteStride = v.byteStride; if (v.target) n.target = v.target;
    chunks.push(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength)); off += v.byteLength;
    out.bufferViews.push(n); maps.bv.set(i, out.bufferViews.length - 1); return out.bufferViews.length - 1;
  };
  const acc = i => {
    if (maps.acc.has(i)) return maps.acc.get(i);
    const a = { ...json.accessors[i] }; if (a.sparse) throw new Error('accessor sparse non géré'); if (a.bufferView !== undefined) a.bufferView = bv(a.bufferView);
    out.accessors.push(a); maps.acc.set(i, out.accessors.length - 1); return out.accessors.length - 1;
  };
  const img = i => { if (!maps.img.has(i)) { const im = { ...json.images[i] }; if (im.bufferView !== undefined) im.bufferView = bv(im.bufferView); out.images.push(im); maps.img.set(i, out.images.length - 1); } return maps.img.get(i); };
  const smp = i => { if (!maps.smp.has(i)) { out.samplers.push({ ...json.samplers[i] }); maps.smp.set(i, out.samplers.length - 1); } return maps.smp.get(i); };
  const tex = i => { if (!maps.tex.has(i)) { const t = { ...json.textures[i] }; if (t.source !== undefined) t.source = img(t.source); if (t.sampler !== undefined) t.sampler = smp(t.sampler); out.textures.push(t); maps.tex.set(i, out.textures.length - 1); } return maps.tex.get(i); };
  const remapTex = o => { if (o && o.index !== undefined) o.index = tex(o.index); };
  const mat = i => {
    if (!maps.mat.has(i)) {
      const m = structuredClone(json.materials[i]); remapTex(m.pbrMetallicRoughness?.baseColorTexture); remapTex(m.pbrMetallicRoughness?.metallicRoughnessTexture); remapTex(m.normalTexture); remapTex(m.emissiveTexture); remapTex(m.occlusionTexture);
      delete m.extensions; out.materials.push(m); maps.mat.set(i, out.materials.length - 1);
    }
    return maps.mat.get(i);
  };
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; const inners = [];
  for (const node of nodes) {
    const T = node.translation || [0, 0, 0], Sc = node.scale || [1, 1, 1], [qx, qy, qz, qw] = node.rotation || [0, 0, 0, 1];
    const R = [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw), 2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw), 2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)];
    if (node.matrix) throw new Error(node.name + ' : matrix non gérée');
    const mesh = structuredClone(json.meshes[node.mesh]);
    for (const p of mesh.primitives) {
      for (const k of Object.keys(p.attributes)) p.attributes[k] = acc(p.attributes[k]);
      if (p.indices !== undefined) p.indices = acc(p.indices); if (p.material !== undefined) p.material = mat(p.material);
      // boîte englobante exacte dans le monde : on lit les sommets (float32 VEC3) et on leur applique la transformation du nœud
      const pa = out.accessors[p.attributes.POSITION], v = out.bufferViews[pa.bufferView], stride = v.byteStride || 12, base = v.byteOffset + (pa.byteOffset || 0);
      if (pa.componentType !== 5126 || pa.normalized) throw new Error(node.name + ' : POSITION non float32');
      const raw = Buffer.concat(chunks);   // les chunks sont alignés comme dans out.bufferViews
      for (let i = 0; i < pa.count; i++) {
        const o = base + i * stride, x = raw.readFloatLE(o) * Sc[0], y = raw.readFloatLE(o + 4) * Sc[1], z = raw.readFloatLE(o + 8) * Sc[2];
        const w = [R[0] * x + R[1] * y + R[2] * z + T[0], R[3] * x + R[4] * y + R[5] * z + T[1], R[6] * x + R[7] * y + R[8] * z + T[2]];
        for (let k = 0; k < 3; k++) { if (w[k] < mn[k]) mn[k] = w[k]; if (w[k] > mx[k]) mx[k] = w[k]; }
      }
    }
    const k = out.meshes.push(mesh) - 1;
    const inner = { name: node.name.replace(/_bk$/, ''), mesh: k }; if (node.translation) inner.translation = node.translation; if (node.rotation) inner.rotation = node.rotation; if (node.scale) inner.scale = node.scale; inners.push(inner);
  }
  let nWalls = 0;
  if (WALLS_FROM_TILES[label]) {
    const walls = wallsFromTiles(nodes.flatMap(nodeTriangles), WALLS_FROM_TILES[label].cls); nWalls = walls.length;
    if (walls.length) {
      const addView = data => { const pad = (4 - off % 4) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; } out.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: data.length, ...(data.target ? {} : {}) }); chunks.push(data); off += data.length; return out.bufferViews.length - 1; };
      const addAcc = (view, type, ct, count, more) => { out.accessors.push({ bufferView: view, componentType: ct, count, type, ...more }); return out.accessors.length - 1; };
      const normal = w => { const [A, B, C] = w.P, u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]], N = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], L = Math.hypot(...N) || 1; return N.map(x => x / L); };
      // texture de fenêtres (un motif = WIN_W x WIN_H mètres, répété) : le mur reste blanc, la couleur vient des sommets
      const WIN_W = 4.2, WIN_H = 3.4;
      const png = windowPng();
      out.images.push({ bufferView: addView(png), mimeType: 'image/png' }); out.samplers = out.samplers || []; out.samplers.push({ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 });
      out.textures.push({ source: out.images.length - 1, sampler: out.samplers.length - 1 });
      const matWall = out.materials.push({ name: 'Murs', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], baseColorTexture: { index: out.textures.length - 1 }, metallicFactor: 0, roughnessFactor: 0.9 }, doubleSided: true }) - 1;
      const matRoof = out.materials.push({ name: 'Toits', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.92 }, doubleSided: true }) - 1;
      const mk = (list, textured) => {
        if (!list.length) return;
        const n = list.length * 3, pos = Buffer.alloc(n * 12), nor = Buffer.alloc(n * 12), col = Buffer.alloc(n * 4), uv = textured ? Buffer.alloc(n * 8) : null; let k = 0;
        const mnP = [1e9, 1e9, 1e9], mxP = [-1e9, -1e9, -1e9];
        for (const w of list) {
          const N = normal(w), th = Math.hypot(N[0], N[2]) || 1, T = [N[2] / th, 0, -N[0] / th];   // T : horizontale le long du mur
          for (let i = 0; i < 3; i++, k++) {
            const P = w.P[i];
            for (let a = 0; a < 3; a++) { pos.writeFloatLE(P[a], k * 12 + a * 4); nor.writeFloatLE(N[a], k * 12 + a * 4); mn[a] = Math.min(mn[a], P[a]); mx[a] = Math.max(mx[a], P[a]); mnP[a] = Math.min(mnP[a], P[a]); mxP[a] = Math.max(mxP[a], P[a]); }
            for (let a = 0; a < 3; a++) col[k * 4 + a] = Math.round(srgb2lin(w.C[i][a]) * 255); col[k * 4 + 3] = 255;
            if (uv) { uv.writeFloatLE((P[0] * T[0] + P[2] * T[2]) / WIN_W, k * 8); uv.writeFloatLE(-P[1] / WIN_H, k * 8 + 4); }
          }
        }
        const attributes = { POSITION: addAcc(addView(pos), 'VEC3', 5126, n, { min: mnP, max: mxP }), NORMAL: addAcc(addView(nor), 'VEC3', 5126, n), COLOR_0: addAcc(addView(col), 'VEC4', 5121, n, { normalized: true }) };
        if (uv) attributes.TEXCOORD_0 = addAcc(addView(uv), 'VEC2', 5126, n);
        out.meshes[0].primitives.push({ attributes, material: textured ? matWall : matRoof, mode: 4 });
      };
      mk(walls.filter(w => Math.abs(normal(w)[1]) < 0.5), true);    // murs : avec fenêtres
      mk(walls.filter(w => Math.abs(normal(w)[1]) >= 0.5), false);  // toits / dalles : unis
    }
  }
  const ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]], s = AR_SIZE / Math.max(...ext), c = [(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2];
  out.nodes.push({ name: 'AR_' + inners[0].name, children: inners.map((_, i) => i + 1), scale: [s, s, s], translation: [-s * c[0], -s * c[1], -s * c[2]] }, ...inners);
  if (!out.samplers.length) delete out.samplers;
  out.buffers = [{ byteLength: off + (4 - off % 4) % 4 }];
  return { out, data: Buffer.concat([...chunks, Buffer.alloc((4 - off % 4) % 4)]), ext, nWalls };
}
function glb(out, data) {
  let j = Buffer.from(JSON.stringify(out), 'utf8'); j = Buffer.concat([j, Buffer.alloc((4 - j.length % 4) % 4, 0x20)]);
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + j.length + 8 + data.length, 8);
  const a = Buffer.alloc(8); a.writeUInt32LE(j.length, 0); a.writeUInt32LE(0x4e4f534a, 4); const b = Buffer.alloc(8); b.writeUInt32LE(data.length, 0); b.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([h, a, j, b, data]);
}

const dir = path.join(ROOT, 'data/ar'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const byName = new Map(json.nodes.map(n => [n.name.replace(/_bk$/, ''), n])), index = []; let total = 0;
for (const [label, nodeName] of Object.entries(PLACES)) {
  const names = [].concat(nodeName), nodes = names.map(n => { const x = byName.get(n); if (!x) throw new Error('nœud introuvable : ' + n); return x; });
  const { out, data, ext, nWalls } = extract(nodes, label), file = names[0].toLowerCase() + '.glb', g = glb(out, data);
  fs.writeFileSync(path.join(dir, file), g); total += g.length;
  index.push({ name: label, file, size: [+ext[0].toFixed(1), +ext[1].toFixed(1), +ext[2].toFixed(1)] });
  console.log(label.padEnd(28), file.padEnd(32), (g.length / 1e6).toFixed(2) + ' Mo', 'réel ' + ext.map(v => v.toFixed(0)).join('×') + ' m', nWalls ? '+ ' + nWalls + ' triangles de murs' : '');
}
fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index, null, 1));
console.log(index.length + ' modèles AR,', (total / 1e6).toFixed(1) + ' Mo au total');
