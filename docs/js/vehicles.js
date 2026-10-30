// Vehicle models (exported from the Blender library): body (tintable), details, lights, separate wheels. Used by the player car and by the instanced AI fleet.
import * as THREE from 'three';
export const KINDS = ['taxi', 'sedan', 'suv', 'pickup', 'sotrama', 'truck', 'moto', 'tricycle'];
export const NAMES = { taxi: 'Taxi', sedan: 'Berline', suv: '4x4', pickup: 'Pick-up', sotrama: 'Sotrama', truck: 'Camion', moto: 'Moto Jakarta', tricycle: 'Tricycle' };
export const PHYS = {   // vmax m/s, a0 m/s2 (0-30 km/h), grip, steer max (rad), brake m/s2
  taxi: { vmax: 44, a0: 5.6, grip: 1.05, steer: 0.62, brake: 9.5, mass: 1300 }, sedan: { vmax: 50, a0: 6.2, grip: 1.1, steer: 0.62, brake: 10, mass: 1250 },
  suv: { vmax: 47, a0: 5.4, grip: 1.0, steer: 0.58, brake: 9.5, mass: 1900 }, pickup: { vmax: 42, a0: 4.8, grip: 0.95, steer: 0.58, brake: 9, mass: 1900 },
  sotrama: { vmax: 31, a0: 3.2, grip: 0.85, steer: 0.55, brake: 8, mass: 2400 }, truck: { vmax: 27, a0: 2.4, grip: 0.8, steer: 0.5, brake: 7.5, mass: 7500 },
  moto: { vmax: 52, a0: 8.0, grip: 1.15, steer: 0.5, brake: 10, mass: 190 }, tricycle: { vmax: 19, a0: 2.2, grip: 0.8, steer: 0.62, brake: 6, mass: 600 } };
export const BODY_COLORS = { taxi: [[0.74, 0.86, 0.1], [0.96, 0.8, 0.08]], sedan: [[0.92, 0.92, 0.9], [0.72, 0.74, 0.77], [0.08, 0.08, 0.09], [0.7, 0.1, 0.1], [0.12, 0.26, 0.55], [0.34, 0.36, 0.4]],
  suv: [[0.08, 0.08, 0.09], [0.92, 0.92, 0.9], [0.34, 0.36, 0.4], [0.12, 0.3, 0.18]], pickup: [[0.92, 0.92, 0.9], [0.72, 0.64, 0.5], [0.12, 0.26, 0.55]], sotrama: [[0.05, 0.38, 0.17], [0.07, 0.44, 0.22], [0.04, 0.3, 0.18], [0.1, 0.5, 0.4]],
  truck: [[0.92, 0.92, 0.9], [0.12, 0.26, 0.55], [0.85, 0.4, 0.1]], moto: [[0.75, 0.12, 0.1], [0.12, 0.25, 0.6], [0.08, 0.08, 0.09], [0.1, 0.45, 0.2], [0.95, 0.78, 0.1]], tricycle: [[0.96, 0.78, 0.08], [0.15, 0.3, 0.65]] };

const geo = (g, withColor) => { if (!g) return null; const b = new THREE.BufferGeometry(); b.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3)); if (withColor) b.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3)); return b; };
export class Models {
  constructor() { this.kinds = {}; this.mats = {}; }
  async load() {
    const data = await (await fetch('data/vehicles.json')).json();
    this.mats.body = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    this.mats.detail = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.mats.front = new THREE.MeshBasicMaterial({ color: 0xfff0cf }); this.mats.rear = new THREE.MeshBasicMaterial({ color: 0xffffff }); this.mats.sign = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
    this.mats.wheel = new THREE.MeshLambertMaterial({ color: 0x151517, flatShading: true });
    for (const k of KINDS) {
      const m = data[k], w0 = m.wheels[0];
      const wg = new THREE.CylinderGeometry(w0.r, w0.r, w0.w, 9); wg.rotateX(Math.PI/2);          // axle along local z
      this.kinds[k] = { name: k, len: m.len, wb: m.wb, wheels: m.wheels, body: geo(m.body, false), detail: geo(m.detail, true), front: geo(m.lf, false), rear: geo(m.lr, false), sign: geo(m.sg, false), wheelGeo: wg, phys: PHYS[k], colors: BODY_COLORS[k] };
    }
    return this;
  }
}
/** single (non-instanced) vehicle for the player */
export class CarMesh {
  constructor(models, kind, color) {
    const K = models.kinds[kind], M = models.mats; this.kind = kind; this.K = K; this.root = new THREE.Group(); this.root.rotation.order = 'YXZ'; this.parts = new THREE.Group(); this.root.add(this.parts);
    const mk = (g, mat, name) => { if (!g) return null; const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; this.parts.add(m); this[name] = m; return m; };
    const bm = new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(...(color || K.colors[0])), flatShading: true });
    mk(K.body, bm, 'body'); mk(K.detail, M.detail, 'detail'); mk(K.front, M.front, 'front'); this.rearMat = new THREE.MeshBasicMaterial({ color: 0x5a0a08 }); mk(K.rear, this.rearMat, 'rear'); mk(K.sign, M.sign, 'sign');
    this.wheels = K.wheels.map(w => { const g = new THREE.Group(); g.position.set(w.x, w.y, w.z); const m = new THREE.Mesh(K.wheelGeo, M.wheel); m.castShadow = true; g.add(m); this.parts.add(g); return { g, m, front: w.front && kind !== 'moto', r: w.r }; });
    this.bodyMat = bm; this.spin = 0;
  }
  setPose(x, y, z, yaw, pitch, roll) { this.root.position.set(x, y, z); this.root.rotation.set(roll, -yaw, pitch); }
  setWheels(dist, steer) { for (const w of this.wheels) { w.g.rotation.set(0, w.front ? -steer : 0, 0); w.m.rotation.z = -dist/w.r; } }
  setBrake(on, night) { this.rearMat.color.setRGB(on ? 1.0 : (0.28 + 0.45*night), on ? 0.05 : 0.02, 0.02); }
}
