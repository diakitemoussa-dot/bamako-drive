// Garage : vitrine 3D du véhicule (second petit rendu, actif seulement pendant l'étape « Véhicule »)
import * as THREE from 'three';
import { CarMesh, BODY_COLORS } from './vehicles.js';

export class Garage {
  constructor(canvas, models) { this.cv = canvas; this.models = models; this.on = false; this.yaw = Math.PI + 0.65; this.idle = 0; this.car = null; this.kind = null; this.drag = null; this.r = null; }
  init() {
    const r = this.r = new THREE.WebGLRenderer({ canvas: this.cv, antialias: true, alpha: true }); r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); r.setClearColor(0x000000, 0);
    const s = this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    s.add(new THREE.HemisphereLight(0xf8f3ea, 0x55415d, 1.25)); const d = new THREE.DirectionalLight(0xfff0cf, 2.4); d.position.set(5, 8, 4); s.add(d); const d2 = new THREE.DirectionalLight(0xc3a5c7, 0.9); d2.position.set(-6, 3, -5); s.add(d2);
    this.stage = new THREE.Group(); s.add(this.stage);
    this.disc = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.04, 0.14, 56), new THREE.MeshLambertMaterial({ color: 0x6a5174 })); this.disc.position.y = -0.07; this.stage.add(this.disc);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.93, 0.018, 8, 80), new THREE.MeshBasicMaterial({ color: 0xf9d58b })); this.ring.rotation.x = Math.PI/2; this.ring.position.y = 0.004; this.stage.add(this.ring);
    const cv = this.cv; cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', e => { this.drag = { x: e.clientX, y: e.clientY }; this.idle = 3; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (!this.drag) return; this.yaw += (e.clientX - this.drag.x)*0.012; this.drag.x = e.clientX; this.idle = 3; });
    const up = () => { this.drag = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }
  /** affiche le véhicule `kind` dans la couleur d'indice `ci` */
  show(kind, ci = 0) {
    if (!this.r) this.init();
    if (this.car) { this.stage.remove(this.car.root); this.car.bodyMat.dispose(); }
    const K = this.models.kinds[kind], cols = BODY_COLORS[kind]; this.car = new CarMesh(this.models, kind, cols[ci % cols.length]); this.car.root.rotation.set(0, 0, 0); this.stage.add(this.car.root); this.kind = kind;
    const len = Math.max(K.len, 2.2), sc = len*0.62; this.disc.scale.set(sc, 1, sc); this.ring.scale.set(sc, sc, 1); this.len = len; this.fit();
  }
  fit() {
    if (!this.r) return; const w = this.cv.clientWidth || 1, h = this.cv.clientHeight || 1; this.r.setSize(w, h, false); this.cam.aspect = w/h; this.cam.updateProjectionMatrix();
    const t = Math.tan(this.cam.fov*Math.PI/360), len = this.len || 4, need = Math.max((len*0.78)/(t*this.cam.aspect), (len*0.32)/t); const dist = need + len*0.35;
    this.cam.position.set(0, len*0.34 + 0.4, dist); this.cam.lookAt(0, len*0.12, 0); this._w = w; this._h = h;
  }
  start() { this.on = true; this.idle = 0; requestAnimationFrame(() => this.fit()); }
  stop() { this.on = false; }
  frame(dt) {
    if (!this.on || !this.car) return; if (this.cv.clientWidth !== this._w || this.cv.clientHeight !== this._h) this.fit();
    if (this.idle > 0) this.idle -= dt; else this.yaw += dt*0.5;
    this.car.root.rotation.y = this.yaw; for (const w of this.car.wheels) w.g.rotation.y = 0; this.r.render(this.scene, this.cam);
  }
}
