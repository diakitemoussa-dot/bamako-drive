// Monuments texturés (hôtels, cathédrale, mosquée, Monument de la Paix…) : géométrie + textures cuites dans Blender
// (tools/export_g_landmarks.py → data/landmarks.glb). Chargés une fois, puis ajoutés à chaque (re)création de la scène.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { shared } from './world.js';

let cache = null;
/** les fenêtres des monuments sont dans la texture cuite (gris-bleu, peu saturé) : la nuit, on repère ces pixels et on en allume une partie au hasard */
function windowsAtNight(sh) {
  sh.uniforms.uNight = shared.uNight;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform float uNight; float lmh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
    .replace('#include <map_fragment>', `#include <map_fragment>
      float lmWin = 0.0;
      #ifdef USE_MAP
      { vec3 sc = pow(max(sampledDiffuseColor.rgb, vec3(0.0)), vec3(1.0 / 2.2)); float mx = max(sc.r, max(sc.g, sc.b)), mn = min(sc.r, min(sc.g, sc.b));
        lmWin = step(sc.r + 0.02, sc.b) * step(mx, 0.72) * step(0.25, mx) * step(mx - mn, 0.3);
      #ifdef LM_ARCH
        lmWin = step(sc.b + 0.04, sc.r) * step(0.4, mx) * step(mx, 0.66) * step(0.2, mx - mn);
      #endif
      }
      #endif`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
      #ifdef LM_UV
      vec2 cl = floor(vMapUv * 86.0); float gain = 0.75; float thr = 0.62;
      #else
      vec2 cl = vec2(floor((vWP.x + vWP.z) * 0.9), floor(vWP.y * 0.33)); float gain = 1.6; float thr = 0.45;
      #endif
       float on = step(thr, lmh(cl)); totalEmissiveRadiance += vec3(1.0, 0.78, 0.46) * lmWin * on * (0.7 + 0.8 * lmh(cl + 7.3)) * uNight * gain; }`);
}
function load() {
  if (!cache) cache = new GLTFLoader().loadAsync('data/landmarks.glb').then(g => {
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const map = o.material && o.material.map;
      if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; }
      const m = new THREE.MeshLambertMaterial({ map: map || null, color: map ? 0xffffff : 0xcccccc, side: THREE.DoubleSide });
      const uvc = /Radisson/.test(o.name); const arc = /Memorial/.test(o.name); if (uvc) m.defines = { LM_UV: '' }; if (arc) m.defines = { LM_ARCH: '' }; if (map) m.onBeforeCompile = windowsAtNight; m.customProgramCacheKey = () => (map ? 'lmwin' : 'lmplain') + (uvc ? 'uv' : '') + (arc ? 'arc' : '');
      o.material = m;
    });
    return g.scene;
  }).catch(e => { console.warn('landmarks.glb indisponible', e); return null; });
  return cache;
}
/** ajoute les monuments à la scène (ombres selon le profil de qualité) */
export async function addLandmarks(scene, prof) {
  const root = await load(); if (!root) return null;
  const inst = root.clone(true); inst.name = 'landmarks';
  inst.traverse(o => { if (o.isMesh) { o.castShadow = !!prof.shadows; o.receiveShadow = !!prof.shadows; } });
  scene.add(inst); return inst;
}
