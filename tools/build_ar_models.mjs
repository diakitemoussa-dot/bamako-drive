// Découpe data/landmarks.glb en un petit GLB par lieu (data/ar/*.glb) pour la réalité augmentée.
// Chaque modèle est recentré (centre en x/z, base à y=0) et réduit pour tenir sur une table (AR_SIZE m dans sa plus grande dimension).
// Écrit aussi data/ar/index.json : nom du lieu (tel qu'affiché dans le jeu) -> fichier + dimensions réelles.
// Usage : node tools/build_ar_models.mjs      (aucune dépendance, pas besoin de Blender)
import fs from 'node:fs';
import path from 'node:path';
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

const buf = fs.readFileSync(path.join(ROOT, 'data/landmarks.glb'));
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('landmarks.glb : pas un GLB');
const jl = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
const bin = buf.subarray(28 + jl, 28 + jl + buf.readUInt32LE(20 + jl));

function extract(nodes) {
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
  const ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]], s = AR_SIZE / Math.max(...ext), c = [(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2];
  out.nodes.push({ name: 'AR_' + inners[0].name, children: inners.map((_, i) => i + 1), scale: [s, s, s], translation: [-s * c[0], -s * c[1], -s * c[2]] }, ...inners);
  if (!out.samplers.length) delete out.samplers;
  out.buffers = [{ byteLength: off + (4 - off % 4) % 4 }];
  return { out, data: Buffer.concat([...chunks, Buffer.alloc((4 - off % 4) % 4)]), ext };
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
  const { out, data, ext } = extract(nodes), file = names[0].toLowerCase() + '.glb', g = glb(out, data);
  fs.writeFileSync(path.join(dir, file), g); total += g.length;
  index.push({ name: label, file, size: [+ext[0].toFixed(1), +ext[1].toFixed(1), +ext[2].toFixed(1)] });
  console.log(label.padEnd(28), file.padEnd(32), (g.length / 1e6).toFixed(2) + ' Mo', 'réel ' + ext.map(v => v.toFixed(0)).join('×') + ' m');
}
fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index, null, 1));
console.log(index.length + ' modèles AR,', (total / 1e6).toFixed(1) + ' Mo au total');
