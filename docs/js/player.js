// Player car: arcade-simulation physics (bicycle model, grip limits, drift with handbrake), surface following, collisions with buildings / traffic.
import * as THREE from 'three';
import { CarMesh } from './vehicles.js';
const G = 9.81;
export class Player {
  constructor(models, world, kind, color, pos, yaw) {
    this.models = models; this.world = world; this.kind = kind; this.car = new CarMesh(models, kind, color); this.P = models.kinds[kind].phys; this.K = models.kinds[kind];
    this.x = pos.x; this.z = pos.z; this.y = pos.y; this.yaw = yaw; this.vx = 0; this.vz = 0; this.steer = 0; this.pitch = 0; this.roll = 0; this.dist = 0; this.rpm = 0.15; this.gear = 1;
    this.len = this.K.len; this.wid = kind === 'moto' ? 0.8 : kind === 'truck' ? 2.3 : kind === 'tricycle' ? 1.3 : 1.9; this.speed = 0; this.vf = 0; this.braking = false; this.hit = 0; this.onRoad = true; this.drift = 0; this.lean = 0; this.hornT = 0;
    this.lastSafe = { x: pos.x, z: pos.z }; this.carsHit = 0; this.stuckT = 0;
  }
  headingVec() { return [Math.cos(this.yaw), Math.sin(this.yaw)]; }
  update(dt, inp, traffic) {
    const P = this.P, K = this.K, n = Math.max(1, Math.ceil(dt/(1/90))), h = dt/n;
    for (let i = 0; i < n; i++) this._step(h, inp, traffic);
    this._pose(dt); this.car.setPose(this.x, this.y, this.z, this.yaw, this.pitch, this.roll); this.car.setWheels(this.dist, this.steer*(this.kind === 'moto' ? 0 : 1));
    this.car.parts.rotation.x = this.lean;    // moto leans into the corner
    this.car.setBrake(this.braking, this.world.night || 0);
  }
  _surfaceMu() { return this.onRoad ? 1.0 : 0.72; }
  _step(dt, inp, traffic) {
    const P = this.P, fx = Math.cos(this.yaw), fz = Math.sin(this.yaw), rx = -Math.sin(this.yaw), rz = Math.cos(this.yaw);
    let vf = this.vx*fx + this.vz*fz, vr = this.vx*rx + this.vz*rz; const mu = this._surfaceMu()*P.grip;
    // ---- engine / brakes
    const th = inp.throttle, br = inp.brake; let a = 0; this.braking = false;
    const frac = Math.min(Math.abs(vf)/P.vmax, 1.2);
    if (inp.reverse || (br > 0.05 && vf < 0.8 && th < 0.05)) {                  // reverse
      if (br > 0.05 && vf > 0.8) { a = -P.brake*br; this.braking = true; } else { a = -(P.a0*0.5)*(1 - Math.min(-vf/9, 1))*Math.max(br, inp.reverse ? 1 : 0); }
    } else {
      if (th > 0.01) a += P.a0*(1 - frac*frac*0.97)*th*(this.onRoad ? 1 : 0.8);
      if (br > 0.01) { a -= Math.sign(vf)*P.brake*br*Math.min(1, Math.abs(vf)*1.2 + 0.15); this.braking = vf > 0.8; }
    }
    a -= Math.sign(vf)*(0.35 + (this.onRoad ? 0 : 0.8)) + vf*Math.abs(vf)*0.0012*(this.kind === 'moto' ? 1.4 : 1);   // rolling + drag
    if (inp.hand) { a -= Math.sign(vf)*Math.min(Math.abs(vf)/dt*0.5, 5.5); this.braking = Math.abs(vf) > 1; }
    vf += a*dt; if (Math.abs(vf) < 0.04 && th < 0.01 && br < 0.01 && !inp.hand) vf = 0;
    // ---- steering (speed sensitive) and yaw
    const sMax = P.steer/(1 + (Math.abs(vf)/16)**2); const target = inp.steer*sMax; const rate = 3.4*dt; this.steer += Math.max(-rate, Math.min(rate, target - this.steer));
    let yawRate = Math.abs(vf) < 0.1 ? 0 : vf*Math.tan(this.steer)/Math.max(this.K.wb, 1.2);
    const latNeeded = Math.abs(vf*yawRate), latMax = mu*G; let slide = 0;
    if (latNeeded > latMax) { yawRate *= latMax/latNeeded; slide = 1; }
    if (inp.hand && Math.abs(vf) > 6) { yawRate *= 1.35; slide = 1; vr += (yawRate > 0 ? -1 : 1)*Math.abs(vf)*0.03*dt*60*0.02; }
    this.yaw += yawRate*dt;
    // ---- lateral grip: the sideways velocity bleeds off (faster with grip, slower when sliding / handbrake)
    const k = inp.hand ? 1.6 : (slide ? 2.6 : 9.0)*mu; vr -= vr*Math.min(1, k*dt); this.drift = Math.min(1, Math.abs(vr)/4);
    // back to world frame (with the new heading, velocity keeps its direction by construction: rotate velocity partly with the car)
    const nfx = Math.cos(this.yaw), nfz = Math.sin(this.yaw), nrx = -Math.sin(this.yaw), nrz = Math.cos(this.yaw);
    this.vx = nfx*vf + nrx*vr; this.vz = nfz*vf + nrz*vr; this.vf = vf; this.speed = Math.hypot(this.vx, this.vz);
    // ---- integrate with collisions
    const ox = this.x, oz = this.z; this.x += this.vx*dt; this.z += this.vz*dt; this.dist += vf*dt;
    if (this._collides()) {
      const nx = this.x, nz = this.z; this.x = nx; this.z = oz; const cx = this._collides(); this.x = ox; this.z = nz; const cz = this._collides();
      if (!cx) { this.x = nx; this.z = oz; this.vz *= -0.2; } else if (!cz) { this.x = ox; this.z = nz; this.vx *= -0.2; } else { this.x = ox; this.z = oz; this.vx *= -0.25; this.vz *= -0.25; }
      const imp = Math.abs(vf); if (imp > 2.5 && this.hit <= 0) { this.hit = 0.6; this.onCrash && this.onCrash(imp); }
      this.speed *= 0.4; this.yaw += (Math.random() - 0.5)*0.04*Math.min(imp/6, 1);
      this.vx *= 0.55; this.vz *= 0.55;
    } else this.lastSafe = { x: this.x, z: this.z };
    if (this.hit > 0) this.hit -= dt;
    if (traffic) traffic.collidePlayer(this, dt);
    this.rpm = this._rpm(Math.abs(vf), th);
  }
  _collides() {
    const w = this.world, f = [Math.cos(this.yaw), Math.sin(this.yaw)], r = [-f[1], f[0]], hl = this.len*0.5 - 0.15, hw = this.wid*0.5 - 0.1;
    // buildings / water / fences: a solid cell blocks the car unless a deck at the car's height carries it over (bridge, flyover)
    if (!this.onDeck) for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const px = this.x + f[0]*hl*a + r[0]*hw*b, pz = this.z + f[1]*hl*a + r[1]*hw*b; if (w.solid(px, pz) && w.deckAt(px, pz, this.y, this.onDeck ? 2.6 : 1.6) === null) return true; }
    // poles, lamp posts, trunks, signs
    let hit = false; const y = this.y;
    w.forColliders(this.x, this.z, this.len*0.5 + 2.5, (cx, cz, cr, y0, y1) => { if (hit || y1 < y + 0.2 || y0 > y + 1.6) return; const dx = cx - this.x, dz = cz - this.z, lx = dx*f[0] + dz*f[1], lz = dx*r[0] + dz*r[1]; if (Math.abs(lx) < hl + cr && Math.abs(lz) < hw + cr) hit = true; });
    return hit;
  }
  _rpm(v, th) { const gears = [0, 9, 17, 26, 36, 48, 70], i = gears.findIndex((g, k) => v < gears[k + 1]); this.gear = Math.max(1, i + 1 > 6 ? 6 : i + 1); const lo = gears[this.gear - 1], hi = gears[this.gear]; return 0.18 + 0.72*Math.min(1, (v - lo)/(hi - lo)) + 0.06*th; }
  _pose(dt) {
    const w = this.world, f = [Math.cos(this.yaw), Math.sin(this.yaw)], r = [-f[1], f[0]], L = this.K.wb ? this.K.wb/2 : 0.9, T = this.wid*0.42;
    const tol = this.onDeck ? 2.4 : 0.9, gh = (a, b) => w.ground(this.x + f[0]*L*a + r[0]*T*b, this.z + f[1]*L*a + r[1]*T*b, this.y, tol);
    const fl = gh(1, -1), fr = gh(1, 1), rl = gh(-1, -1), rr = gh(-1, 1);
    if (fl === null || fr === null || rl === null || rr === null) { this.pitch *= 0.9; return; }
    const front = (fl + fr)/2, rear = (rl + rr)/2, left = (fl + rl)/2, right = (fr + rr)/2, gy = (front + rear)/2; { const lo = w.ground(this.x, this.z, -1e3), dk = w.deckAt(this.x, this.z, this.y, 1.0); this.onDeck = dk !== null && lo !== null && dk > lo + 1.2; }
    const kk = Math.min(1, 14*dt), dy = gy - this.y;
    if (dy < -0.45) { this.fallV = Math.min((this.fallV || 0) + 22*dt, 22); this.y -= Math.min(-dy, this.fallV*dt); }       // drop off an edge: real fall, not a teleport
    else { this.fallV = 0; this.y += dy*Math.min(1, 20*dt) + (dy > 1.2 ? dy : 0); }
    this.pitch += (Math.atan2(front - rear, 2*L) - this.pitch)*kk; this.roll += (Math.atan2(left - right, 2*T)*0.8 - this.roll)*kk;
    const leanT = this.kind === 'moto' ? Math.max(-0.6, Math.min(0.6, Math.atan(this.vf*this.vf*Math.tan(this.steer)/Math.max(this.K.wb, 1.2)/G)*0.9)) : 0; this.lean += (leanT - this.lean)*Math.min(1, 6*dt);
  }
  groundNow() { return this.world.ground(this.x, this.z, this.y); }
  reset(x, z, yaw, yHint = null) { this.x = x; this.z = z; this.yaw = yaw; this.vx = this.vz = 0; this.vf = 0; this.steer = 0; this.roll = this.pitch = 0; this.onDeck = false; const g = this.world.ground(x, z, yHint); if (g !== null) this.y = g; }
}
