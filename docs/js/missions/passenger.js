// Personnage à pied (client) : modèle simple en boîtes, animation de marche et de « taxi ! » (bras levé), + portière du taxi.
import * as THREE from 'three';

const CLOTHES = [0xc0392b, 0x1f7a4d, 0x2c5fa8, 0xd98e04, 0x7a3b8f, 0xe8e2d0, 0x1e8a8a, 0xb8527a];
const SKIN = [0x3b2418, 0x4d3020, 0x5e3b27, 0x6e4730];
const box = (w, h, d, y) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, y, 0); return g; };
const G = { torso: box(0.42, 0.6, 0.26, 1.15), head: box(0.2, 0.24, 0.2, 1.6), scarf: box(0.24, 0.12, 0.24, 1.72), dress: box(0.5, 0.55, 0.32, 0.62), leg: box(0.14, 0.86, 0.14, -0.43), arm: box(0.1, 0.58, 0.1, -0.29) };
const mat = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });

export class Figure {
  constructor(female) {
    const cl = CLOTHES[(Math.random()*CLOTHES.length) | 0], cl2 = CLOTHES[(Math.random()*CLOTHES.length) | 0], skin = SKIN[(Math.random()*SKIN.length) | 0];
    this.root = new THREE.Group(); this.walkT = 0; this.wave = 0;
    const m = (g, c) => { const o = new THREE.Mesh(g, mat(c)); o.castShadow = true; return o; };
    const body = m(G.torso, cl); const head = m(G.head, skin); this.root.add(body, head);
    if (female) { this.root.add(m(G.dress, cl2), m(G.scarf, cl2)); } else { head.scale.set(1, 1, 1); }
    const limb = (g, c, x, y) => { const p = new THREE.Group(); p.position.set(0, y, x); p.add(m(g, c)); this.root.add(p); return p; };   // axe d'avant = +x ; gauche/droite = z
    this.legL = limb(G.leg, female ? skin : 0x2b2f3a, -0.1, 0.86); this.legR = limb(G.leg, female ? skin : 0x2b2f3a, 0.1, 0.86);
    this.armL = limb(G.arm, cl, -0.26, 1.42); this.armR = limb(G.arm, cl, 0.26, 1.42);
    this.root.rotation.order = 'YXZ'; this.heading = 0;
  }
  face(h) { this.heading = h; this.root.rotation.y = -h; }
  place(x, y, z) { this.root.position.set(x, y, z); }
  /** pose de marche (moving) ou d'attente ; waving = bras droit levé qui salue */
  animate(dt, moving, waving) {
    this.walkT += dt*(moving ? 9 : 0); const s = moving ? Math.sin(this.walkT)*0.7 : 0;
    this.legL.rotation.z = s; this.legR.rotation.z = -s; this.armL.rotation.z = -s*0.8;
    if (waving) { this.wave += dt*7; this.armR.rotation.z = -2.5 + Math.sin(this.wave)*0.35; } else this.armR.rotation.z = s*0.8;
  }
  dispose() { this.root.removeFromParent(); this.root.traverse(o => { if (o.material) o.material.dispose(); }); }
}

/** portière arrière droite ajoutée par le code, même couleur que la carrosserie ; pivote sur sa charnière avant */
export class Door {
  /** o : { hx, hz, len, py, ph, gy, gh } charnière avant en (hx,hz), panneau de longueur len vers l'arrière */
  constructor(car, o = {}) {
    const { hx = -0.12, hz = 0.9, len = 1.02, py = 0.8, ph = 0.6, gy = 1.2, gh = 0.36 } = o;
    this.t = 0; this.target = 0; this.group = new THREE.Group(); this.group.position.set(hx, 0, hz);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(len, ph, 0.05), car.bodyMat); panel.position.set(-len/2 - 0.04, py, 0); panel.castShadow = true;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(len - 0.07, gh, 0.045), new THREE.MeshLambertMaterial({ color: 0x1b2a33, flatShading: true })); glass.position.set(-len/2 - 0.01, gy, 0);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.03), new THREE.MeshLambertMaterial({ color: 0x222222 })); handle.position.set(-len + 0.07, py + 0.18, 0.04);
    this.group.add(panel, glass, handle); this.group.visible = false; car.parts.add(this.group); this.car = car;
  }
  update(dt) { const d = this.target - this.t; this.t += Math.sign(d)*Math.min(Math.abs(d), dt*2.2); this.group.rotation.y = this.t*1.15; this.group.visible = this.t > 0.02; }   // invisible tant qu'elle est fermée : elle n'apparaît qu'à l'ouverture
  get open() { return this.t > 0.95; } get closed() { return this.t < 0.02; }
  remove() { this.group.removeFromParent(); }
}

/** caisse posée au sol (chargement à prendre) ou sur le véhicule */
export class Crate {
  constructor(size = [0.7, 0.6, 0.7], color = 0xb07a43) {
    this.root = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshLambertMaterial({ color, flatShading: true })); b.castShadow = true; b.position.y = size[1]/2;
    const band = new THREE.Mesh(new THREE.BoxGeometry(size[0] + 0.02, size[1]*0.18, size[2] + 0.02), new THREE.MeshLambertMaterial({ color: 0x6b4a28, flatShading: true })); band.position.y = size[1]*0.55; this.root.add(b, band);
  }
  dispose() { this.root.removeFromParent(); this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
}
