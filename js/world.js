// City streaming: 250 m tiles (compact binary), shaders for walls/windows/water/lamps, ground height + collision queries.
import * as THREE from 'three';
import { gunzipSync } from 'fflate';

const HASH = 'float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }';
export const shared = { uWin: { value: 1 }, uNight: { value: 0 }, uDusk: { value: 0 }, uSky: { value: new THREE.Color(0.6, 0.7, 0.85) }, uTime: { value: 0 } };

export function makeCityMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; attribute vec3 aN; varying vec3 vFN; varying vec3 vUVW;').replace('#include <begin_vertex>', `#include <begin_vertex>
      vWPos = (modelMatrix * vec4(position, 1.0)).xyz; vFN = aN;
      { vec3 tn = normalize(vec3(-aN.z, 0.0, aN.x) + vec3(1e-5, 0.0, 0.0)); vec3 q = vWPos; vUVW = vec3(dot(q, tn) / 3.3, (q.y + 0.35) / 3.1, dot(vec3(floor(q.x / 9.0), 0.0, floor(q.z / 9.0)), vec3(0.37, 0.0, 0.61))); }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vFN; varying vec3 vUVW; uniform float uNight; uniform float uDusk; uniform float uWin; uniform vec3 uSky; uniform float uTime;\n' + HASH)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 emitC = vec3(0.0);
        diffuseColor.rgb = pow(diffuseColor.rgb, vec3(2.2));
        float cls = floor(vColor.a * 255.0 + 0.5);
        vec3 wn = normalize(vFN);
        if (cls == 1.0 && uWin > 0.5 && abs(wn.y) < 0.35) {
          vec2 uv = vUVW.xy;
          vec2 cell = floor(uv); vec2 f = fract(uv);
          float wall = 0.0;
          float hh = h21(cell + wall * 17.0);
          float win = step(0.25, f.x) * step(f.x, 0.75) * step(0.30, f.y) * step(f.y, 0.80);
          if (win > 0.5) {
            diffuseColor.rgb = mix(diffuseColor.rgb * 0.22, uSky * 0.35, 0.35);
            emitC = vec3(1.0, 0.78, 0.46) * step(0.5, hh) * (0.55 + 0.9 * h21(cell * 3.1)) * uNight * 1.5;
          }
        } else if (cls == 3.0) {
          vec3 V = normalize(cameraPosition - vWPos); float fr = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.5);
          float rip = sin(vWPos.x * 0.31 + uTime * 0.6) * sin(vWPos.z * 0.27 - uTime * 0.45);
          diffuseColor.rgb = mix(diffuseColor.rgb * (0.9 + 0.2 * rip), uSky * 0.85, fr * 0.7);
        } else if (cls == 4.0) {
          emitC = vec3(1.0, 0.9, 0.7) * uNight * 2.2; diffuseColor.rgb += emitC * 0.0;
        } else if (cls == 7.0) {
          diffuseColor.rgb = vec3(0.6, 0.01, 0.005); emitC = vec3(1.0, 0.06, 0.03) * uDusk * (0.8 + 0.5 * sin(uTime * 2.4)) * 3.2;
        } else if (cls == 5.0) {
          diffuseColor.rgb = mix(diffuseColor.rgb * 0.7, uSky * 0.55, 0.28);
          emitC = vec3(0.9, 0.75, 0.45) * 0.45 * uNight * step(0.5, h21(floor(vWPos.xz * 0.7) + floor(vWPos.y * 0.45)));
        } else if (cls == 2.0) {
          diffuseColor.rgb *= 0.92 + 0.16 * h21(floor(vWPos.xz * 1.3));
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += emitC;');
  };
  return m;
}
export function makeKerbMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aV; varying float vV;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvV = aV;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vV;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(vec3(0.62, 0.035, 0.03), vec3(0.8, 0.78, 0.74), step(0.5, fract(vV / 3.0)));');
  };
  return m;
}

const HEAD = 8;
function flatNormals(p) {   // per-triangle normal, Int8 normalised (3 bytes per vertex)
  const n = p.length/9, o = new Int8Array(n*9);
  for (let t = 0; t < n; t++) { const i = t*9, ax = p[i+3]-p[i], ay = p[i+4]-p[i+1], az = p[i+5]-p[i+2], bx = p[i+6]-p[i], by = p[i+7]-p[i+1], bz = p[i+8]-p[i+2];
    let x = ay*bz - az*by, y = az*bx - ax*bz, z = ax*by - ay*bx; const l = Math.hypot(x, y, z) || 1; x = Math.round(x/l*127); y = Math.round(y/l*127); z = Math.round(z/l*127);
    for (let k = 0; k < 3; k++) { o[i+k*3] = x; o[i+k*3+1] = y; o[i+k*3+2] = z; } }
  return o;
}
export class World {
  constructor(scene, quality) {
    this.scene = scene; this.q = quality; this.tiles = new Map(); this.loading = new Set(); this.man = null; this.mat = makeCityMaterial(); this.kmat = makeKerbMaterial();
    this.group = new THREE.Group(); scene.add(this.group); this.version = 0; this.treeMesh = null; this.lastCenter = [1e9, 1e9]; this.failed = new Set();
    this.treeGeoTrunk = this._trunkGeo(); this.treeGeoCrown = this._crownGeo();
    this.trunks = new THREE.InstancedMesh(this.treeGeoTrunk, new THREE.MeshLambertMaterial({ color: 0x5a3e24, flatShading: true }), 1); this.crowns = new THREE.InstancedMesh(this.treeGeoCrown, new THREE.MeshLambertMaterial({ flatShading: true }), 1);
    for (const m of [this.trunks, this.crowns]) { m.frustumCulled = false; m.count = 0; m.castShadow = m.receiveShadow = !!this.q.shadows; scene.add(m); }
    this.onTilesChanged = null; this.onTileLoaded = null;
  }
  _trunkGeo() { const g = new THREE.CylinderGeometry(0.14, 0.2, 1, 5); g.translate(0, 0.5, 0); return g; }
  _crownGeo() {   // pentagon bipyramid-like crown (8 faces), unit radius, ring at 42 % of the height
    const g = new THREE.BufferGeometry(); const R = 1, ring = []; for (let i = 0; i < 4; i++) { const a = i*Math.PI/2 + 0.4; ring.push([Math.cos(a)*R, 0.42, Math.sin(a)*R]); }
    const top = [0, 1, 0], bot = [0, 0, 0], v = [];
    for (let i = 0; i < 4; i++) { const a = ring[i], b = ring[(i+1)%4]; v.push(...a, ...top, ...b); v.push(...b, ...bot, ...a); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g;
  }
  async init() {
    this.man = await (await fetch('data/manifest.json', { cache: 'no-cache' })).json(); this.index = new Map(this.man.tiles.map(t => [t.ix + ',' + t.iz, t]));
    return this;
  }
  tileKey(x, z) { return Math.floor((x - this.man.tx0)/this.man.tile) + ',' + Math.floor((z - this.man.tz0)/this.man.tile); }
  update(px, pz, force) {
    const T = this.man.tile, R = this.q.tileRadius; const cx = Math.floor((px - this.man.tx0)/T), cz = Math.floor((pz - this.man.tz0)/T);
    const now = performance.now(); if (!force && cx === this.lastCenter[0] && cz === this.lastCenter[1] && now - (this._full || 0) < 1500) return; this._full = now; this.lastCenter = [cx, cz];
    const need = [], r = Math.ceil(R/T) + 1;
    for (let i = cx - r; i <= cx + r; i++) for (let j = cz - r; j <= cz + r; j++) {
      const k = i + ',' + j; if (!this.index.has(k)) continue;
      const dx = Math.max(Math.abs(this.man.tx0 + (i + 0.5)*T - px) - T/2, 0), dz = Math.max(Math.abs(this.man.tz0 + (j + 0.5)*T - pz) - T/2, 0);
      if (dx*dx + dz*dz <= R*R) need.push([k, dx*dx + dz*dz, i, j]);
    }
    need.sort((a, b) => a[1] - b[1]); const keep = new Set(need.map(n => n[0]));
    let changed = false;
    for (const [k, t] of this.tiles) if (!keep.has(k)) { // keep a margin before unloading
      const dx = Math.max(Math.abs(t.ox + T/2 - px) - T/2, 0), dz = Math.max(Math.abs(t.oz + T/2 - pz) - T/2, 0);
      if (dx*dx + dz*dz > (R + T*0.6)**2) { this._dispose(t); this.tiles.delete(k); changed = true; }
    }
    for (const [k, , i, j] of need) if (!this.tiles.has(k) && !this.loading.has(k) && !this.failed.has(k)) this._load(k, i, j);
    if (changed) this._rebuildInstances();
  }
  async _load(k, i, j) {
    this.loading.add(k); let ok = false;
    for (let attempt = 0; attempt < 4 && !ok; attempt++) {
      try {
        const resp = await fetch(`data/tiles/t_${i}_${j}.bin.gz?v=${this.man.v || 0}`); if (!resp.ok) throw new Error(resp.status);
        const gz = new Uint8Array(await resp.arrayBuffer()); const raw = gunzipSync(gz); const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
        this.tiles.set(k, this._build(buf)); this._rebuildInstances(); if (this.onTileLoaded) this.onTileLoaded(k); ok = true;
      } catch (e) { console.warn('tile', k, 'attempt', attempt + 1, e); await new Promise(r => setTimeout(r, 400*(2**attempt))); }
    }
    if (!ok) { this.failed.add(k); setTimeout(() => { this.failed.delete(k); this.lastCenter = [1e9, 1e9]; }, 6000); }   // never give up for good: try again later
    this.loading.delete(k);
  }
  _build(buf) {
    const dv = new DataView(buf); const hl = dv.getUint32(4, true); const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, HEAD, hl)).replace(/\0+$/, ''));
    const base = HEAD + hl, off = head.off, qs = head.qs; const t = { ix: head.ix, iz: head.iz, ox: head.ox, oz: head.oz, meshes: [] };
    const toF = (i16, n) => { const f = new Float32Array(n*3); for (let i = 0; i < n*3; i++) f[i] = i16[i]*qs; return f; };
    if (head.n) {
      const n = head.n, pos = toF(new Int16Array(buf, base + off.pos, n*3), n), col = new Uint8Array(buf.slice(base + off.col, base + off.col + n*4));
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 4, true)); const nA = new THREE.BufferAttribute(flatNormals(pos), 3, true); g.setAttribute('aN', nA); g.setAttribute('normal', nA); g.computeBoundingSphere();   // 'normal' est nécessaire pour que les ombres soient reçues
      const m = new THREE.Mesh(g, this.mat); m.position.set(head.ox, 0, head.oz); m.matrixAutoUpdate = false; m.updateMatrix(); m.castShadow = this.q.shadows; m.receiveShadow = this.q.shadows; this.group.add(m); t.meshes.push(m);
    }
    if (head.nk) {
      const n = head.nk, pos = toF(new Int16Array(buf, base + off.kpos, n*3), n), col = new Uint8Array(buf.slice(base + off.kcol, base + off.kcol + n*3)), v = new Float32Array(buf.slice(base + off.kv, base + off.kv + n*4));
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3, true)); g.setAttribute('aV', new THREE.BufferAttribute(v, 1)); g.setAttribute('normal', new THREE.BufferAttribute(flatNormals(pos), 3, true)); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.kmat); m.position.set(head.ox, 0, head.oz); m.matrixAutoUpdate = false; m.updateMatrix(); m.receiveShadow = this.q.shadows; this.group.add(m); t.meshes.push(m);
    }
    t.trees = head.nt ? new Float32Array(buf.slice(base + off.trees, base + off.trees + head.nt*24)) : null; t.nt = head.nt;
    t.cols = head.nc ? new Float32Array(buf.slice(base + off.cols, base + off.cols + head.nc*20)) : null; t.nc = head.nc || 0;
    t.lamps = head.nl ? new Float32Array(buf.slice(base + off.lamps, base + off.lamps + head.nl*12)) : null; t.nl = head.nl;
    t.h0 = new Int16Array(buf.slice(base + off.h0, base + off.h0 + 101*101*2)); t.h1 = head.h1 ? new Int16Array(buf.slice(base + off.h1, base + off.h1 + 101*101*2)) : null;
    t.solid = new Uint8Array(buf.slice(base + off.solid, base + off.solid + 125*16));
    return t;
  }
  _dispose(t) { for (const m of t.meshes) { this.group.remove(m); m.geometry.dispose(); } }
  _rebuildInstances() {
    let n = 0; for (const t of this.tiles.values()) n += t.nt || 0;
    const cap = Math.min(n, this.q.maxTrees); if (cap > this.trunks.instanceMatrix.count) {
      for (const k of ['trunks', 'crowns']) { const old = this[k]; this.scene.remove(old); const m = new THREE.InstancedMesh(old.geometry, old.material, Math.ceil(cap*1.3) + 200); m.frustumCulled = false; m.castShadow = m.receiveShadow = !!this.q.shadows; this.scene.add(m); this[k] = m; }
    }
    const M = new THREE.Matrix4(), C = new THREE.Color(), pc = this.pcenter || [0, 0]; let i = 0;
    for (const t of this.tiles.values()) { if (!t.trees) continue; const a = t.trees;
      for (let k = 0; k < t.nt && i < this.trunks.instanceMatrix.count; k++) {
        const x = a[k*6] + t.ox, y = a[k*6 + 1], z = a[k*6 + 2] + t.oz, th = a[k*6 + 3], ch = a[k*6 + 4], cr = a[k*6 + 5];
        M.makeScale(1, th, 1); M.setPosition(x, y, z); this.trunks.setMatrixAt(i, M);
        M.makeScale(cr*0.92, ch, cr*0.92); M.setPosition(x, y + th - 0.5, z); this.crowns.setMatrixAt(i, M);
        const h = Math.abs(Math.sin(x*12.9898 + z*78.233)*43758.5453) % 1; C.setRGB(0.05 + 0.1*h, 0.17 + 0.15*h, 0.04 + 0.05*h); this.crowns.setColorAt(i, C); i++;
      } }
    this.trunks.count = this.crowns.count = i; this.trunks.instanceMatrix.needsUpdate = this.crowns.instanceMatrix.needsUpdate = true; if (this.crowns.instanceColor) this.crowns.instanceColor.needsUpdate = true;
    this.version++; if (this.onTilesChanged) this.onTilesChanged();
  }
  tileAt(x, z) { return this.tiles.get(this.tileKey(x, z)); }
  /** weighted bilinear sample; corners without data (-32768) are ignored, so the deck edge and the ramp start never drop to the ground below */
  _samp(a, gx, gz, need) {
    let i = Math.floor(gx), j = Math.floor(gz); if (i < 0) i = 0; if (j < 0) j = 0; if (i > 99) i = 99; if (j > 99) j = 99; const fx = Math.min(Math.max(gx - i, 0), 1), fz = Math.min(Math.max(gz - j, 0), 1), W = 101;
    const v = [a[j*W + i], a[j*W + i + 1], a[(j+1)*W + i], a[(j+1)*W + i + 1]], w = [(1-fx)*(1-fz), fx*(1-fz), (1-fx)*fz, fx*fz]; let sw = 0, sv = 0;
    for (let k = 0; k < 4; k++) if (v[k] !== -32768) { sw += w[k]; sv += w[k]*v[k]; } return sw >= need ? sv/sw/50 : null;
  }
  /** elevated deck height under (x,z) if the vehicle at height yRef is on it, else null */
  deckAt(x, z, yRef, tol = 2.6) { const t = this.tileAt(x, z); if (!t || !t.h1) return null; const hi = this._samp(t.h1, (x - t.ox)/2.5, (z - t.oz)/2.5, 0.3); if (hi === null || Math.abs(hi - yRef) > tol) return null; const lo = this._samp(t.h0, (x - t.ox)/2.5, (z - t.oz)/2.5, 0.99); return (lo === null || hi >= lo - 0.5) ? hi : null; }
  /** terrain / road surface height; yRef selects the elevated deck when the vehicle is on it */
  ground(x, z, yRef = null, tol = 1.5) {
    const t = this.tileAt(x, z); if (!t) return null; const gx = (x - t.ox)/2.5, gz = (z - t.oz)/2.5, lo = this._samp(t.h0, gx, gz, 0.99);
    if (t.h1 && yRef !== null) { const hi = this._samp(t.h1, gx, gz, 0.3); if (hi !== null && Math.abs(hi - yRef) < tol && hi >= (lo ?? -1e9) - 0.5) return hi; }
    return lo;
  }
  hasDeck(x, z) { const t = this.tileAt(x, z); return !!(t && t.h1); }
  solid(x, z) {
    const t = this.tileAt(x, z); if (!t) return false; const i = Math.floor((x - t.ox)/2), j = Math.floor((z - t.oz)/2); if (i < 0 || j < 0 || i > 124 || j > 124) return false;
    return (t.solid[j*16 + (i >> 3)] >> (7 - (i & 7))) & 1;
  }
  /** thin vertical obstacles (lamp posts, tree trunks, signal / sign poles) near (x,z): calls fn(cx, cz, r, y0, y1) */
  forColliders(x, z, rad, fn) {
    const seen = new Set();
    for (const [dx, dz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad]]) { const t = this.tileAt(x + dx, z + dz); if (!t || seen.has(t)) continue; seen.add(t);
      if (t.cols) for (let k = 0; k < t.nc; k++) { const cx = t.cols[k*5] + t.ox, cz = t.cols[k*5 + 1] + t.oz; if (Math.abs(cx - x) < rad && Math.abs(cz - z) < rad) { const cr = t.cols[k*5 + 2]; fn(cx, cz, cr === 0.5 ? 0.85 : cr, t.cols[k*5 + 3], t.cols[k*5 + 4]); } }
      if (t.trees) for (let k = 0; k < t.nt; k++) { const cx = t.trees[k*6] + t.ox, cz = t.trees[k*6 + 2] + t.oz; if (Math.abs(cx - x) < rad && Math.abs(cz - z) < rad) fn(cx, cz, 0.28, t.trees[k*6 + 1], t.trees[k*6 + 1] + t.trees[k*6 + 3]); } }
    if (this.extraCols) for (const c of this.extraCols) if (Math.abs(c[0] - x) < rad && Math.abs(c[1] - z) < rad) fn(c[0], c[1], c[2], c[3], c[4]);
  }
  allLamps(out) { out.length = 0; for (const t of this.tiles.values()) if (t.lamps) for (let k = 0; k < t.nl; k++) out.push(t.lamps[k*3] + t.ox, t.lamps[k*3 + 1], t.lamps[k*3 + 2] + t.oz); return out; }
}
