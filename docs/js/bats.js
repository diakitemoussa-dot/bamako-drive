// Bats over Bamako at dusk and night: flocks that wander around the viewer, fairly high, with flapping wings (instanced, cheap).
import * as THREE from 'three';
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a)/(b - a))); return t*t*(3 - 2*t); };
export class Bats {
  constructor(scene, world, count) {
    this.world = world; this.max = count; this.n = 0; this.R = 300; this.t = 0; this.gT = 0;
    const body = new THREE.BufferGeometry(); body.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0.0, 0.0, 0.32, -0.09, 0.0, -0.14, 0.09, 0.0, -0.14, 0.0, 0.1, -0.1, -0.09, 0.0, -0.14, 0.0, 0.0, 0.32, 0.09, 0.0, -0.14]), 3)); body.setIndex([0, 1, 3, 0, 3, 2, 1, 2, 3, 0, 2, 1]);
    const wing = (s) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.22, s*0.95, 0, 0.05, 0, 0, -0.2, 0, 0, 0.22, s*0.55, 0, -0.22, s*0.95, 0, 0.05]), 3)); g.setIndex([0, 1, 2, 3, 5, 4]); return g; };
    const mat = new THREE.MeshBasicMaterial({ color: 0x2b2233, side: THREE.DoubleSide, fog: true });
    this.body = new THREE.InstancedMesh(body, mat, count); this.wl = new THREE.InstancedMesh(wing(-1), mat, count); this.wr = new THREE.InstancedMesh(wing(1), mat, count);
    for (const m of [this.body, this.wl, this.wr]) { m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
    this.b = []; for (let i = 0; i < count; i++) this.b.push({ x: 0, y: 0, z: 0, h: Math.random()*6.28, sp: 6 + Math.random()*5, ph: Math.random()*6.28, fr: 9 + Math.random()*5, tr: Math.random()*6.28, tf: 0.4 + Math.random()*0.9, alt: 12 + Math.random()*34, gy: 20, init: false, bank: 0 });
    this.M = new THREE.Matrix4(); this.Mw = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.E = new THREE.Euler(); this.V = new THREE.Vector3(); this.S = new THREE.Vector3(); this.Qw = new THREE.Quaternion();
  }
  rebind(scene, world) { this.world = world; for (const m of [this.body, this.wl, this.wr]) scene.add(m); }
  update(dt, focus, elev, camPos) {
    const vis = 1 - smooth(0.04, 0.32, elev), want = Math.round(this.max*vis);                // from late afternoon on
    if (want !== this.n) { this.n = want; for (const m of [this.body, this.wl, this.wr]) m.count = want; }
    if (!want) return; this.t += dt; this.gT -= dt; const doG = this.gT <= 0; if (doG) this.gT = 0.35;
    const R = this.R, sc = 2.3 + Math.max(0, (camPos ? camPos.distanceTo(focus) : 20) - 60)/230, M = this.M, Mw = this.Mw, V = this.V, S = this.S.set(sc, sc, sc), t = this.t;
    for (let i = 0; i < want; i++) {
      const b = this.b[i];
      if (!b.init || (b.x - focus.x)**2 + (b.z - focus.z)**2 > (R*1.25)**2) { const a = Math.random()*6.283, r = b.init ? R*(0.9 + Math.random()*0.1) : Math.random()*R; b.x = focus.x + Math.cos(a)*r; b.z = focus.z + Math.sin(a)*r; b.y = focus.y + b.alt; b.init = true; b.h = a + Math.PI + (Math.random() - 0.5)*1.2; const g = this.world.ground(b.x, b.z, null); b.gy = g ?? focus.y; }
      if (doG && (i + (t*3 | 0)) % 3 === 0) { const g = this.world.ground(b.x, b.z, null); if (g !== null) b.gy = g; }
      const turn = Math.sin(t*b.tf + b.tr)*1.1 + Math.sin(t*b.tf*2.7 + b.ph)*0.7; b.h += turn*dt; b.bank += (turn*0.45 - b.bank)*Math.min(1, dt*4);
      const bs = b.sp*(0.85 + 0.25*Math.sin(t*0.9 + b.ph)); b.x += Math.cos(b.h)*bs*dt; b.z += Math.sin(b.h)*bs*dt;
      const ty = Math.max(b.gy + 14, focus.y - 4) + b.alt*0.6 + Math.sin(t*0.5 + b.ph)*7; b.y += (ty - b.y)*Math.min(1, dt*0.8);
      const flap = Math.sin(t*b.fr + b.ph)*0.85;
      this.E.set(0, -b.h + Math.PI/2, -b.bank, 'YXZ'); this.Q.setFromEuler(this.E); V.set(b.x, b.y, b.z); M.compose(V, this.Q, S); this.body.setMatrixAt(i, M);
      for (const [mesh, sg] of [[this.wl, -1], [this.wr, 1]]) { this.E.set(0, 0, sg*flap); this.Qw.setFromEuler(this.E); Mw.compose(V.set(0, 0, 0), this.Qw, this.S.set(1, 1, 1)); Mw.premultiply(M); mesh.setMatrixAt(i, Mw); }
      S.set(sc, sc, sc); V.set(b.x, b.y, b.z);
    }
    this.body.instanceMatrix.needsUpdate = this.wl.instanceMatrix.needsUpdate = this.wr.instanceMatrix.needsUpdate = true;
  }
}
