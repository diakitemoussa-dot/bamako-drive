// Monuments texturés (hôtels, cathédrale, mosquée, Monument de la Paix…) : géométrie + textures cuites dans Blender
// (tools/export_g_landmarks.py → data/landmarks.glb). Chargés une fois, puis ajoutés à chaque (re)création de la scène.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let cache = null;
function load() {
  if (!cache) cache = new GLTFLoader().loadAsync('data/landmarks.glb').then(g => {
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const map = o.material && o.material.map;
      if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; }
      o.material = new THREE.MeshLambertMaterial({ map: map || null, color: map ? 0xffffff : 0xcccccc, side: THREE.DoubleSide });
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
