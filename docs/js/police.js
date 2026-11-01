// Police : au-delà de 7 collisions, des pick-up noirs avec gyrophare et sirène poursuivent le joueur et cherchent à lui rentrer dedans.
// Chaque voiture de police est un vrai véhicule (même physique que le joueur, collisions avec les bâtiments et la circulation) piloté par une IA de poursuite.
// La poursuite s'arrête quand le joueur les sème (plus de 380 m pendant 20 s) ou quand il les met toutes hors service (chaque voiture a des points de vie :
// ses chocs avec le joueur, les murs et la circulation les usent ; une voiture à 0 s'arrête, fume et n'attaque plus).
// Si le joueur enchaîne les collisions pendant la poursuite, une voiture de plus arrive toutes les 3 collisions. Compteur remis à zéro à la fin.
import * as THREE from 'three';
import { Player } from './player.js';

const LIMIT = 7, UNITS = 3, MAXU = 8, EXTRA_EVERY = 3, HP = 100, FLEE_D = 380, FLEE_T = 20, SPAWN_D = [150, 210], BLACK = [0.035, 0.035, 0.04];
const wrap = a => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let glowTex = null;
function glow() {
  if (glowTex) return glowTex; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c); return glowTex;
}

export class Police {
  constructor({ scene, world, graph, models, sound, toast }) {
    this.scene = scene; this.world = world; this.graph = graph; this.models = models; this.sound = sound; this.toast = toast;
    this.units = []; this.crashes = 0; this.active = false; this.total = 0; this.downed = 0; this.ending = 0; this.ramming = false; this.smokes = []; this.t = 0; this.far = 0; this.ramCool = 0; this.hushed = false;
    const K = models.kinds.pickup; let roof = 0, sx = 0, n = 0, pos = [];
    for (const g of [K.body, K.detail]) if (g) { const a = g.attributes.position.array; for (let i = 0; i < a.length; i += 3) { pos.push(a[i], a[i + 1]); roof = Math.max(roof, a[i + 1]); } }
    for (let i = 0; i < pos.length; i += 2) if (pos[i + 1] > roof - 0.12) { sx += pos[i]; n++; }
    this.roof = roof; this.cabX = n ? sx/n : 0.3;   // la cabine du pick-up : le toit est la partie la plus haute
    const el = this.badge = document.createElement('div'); el.id = 'polBadge'; el.className = 'hidden'; document.body.appendChild(el);
  }
  reset() { this.clear(); this.crashes = 0; this.active = false; this.total = 0; this.downed = 0; this.ending = 0; this.far = 0; this._badge(); }
  clear() { for (const u of this.units) { this.scene.remove(u.car.root); (u.smoke || []).forEach(m => this.scene.remove(m)); } this.units = []; this.sound && this.sound.siren(0); }
  /** pause / menu : sirène coupée et voitures cachées ; reprise : tout revient */
  hush(on) { this.hushed = on; for (const u of this.units) u.car.root.visible = !on; if (on && this.sound) this.sound.siren(0); this.badge.classList.toggle('hidden', on || (!this.active && this.crashes < 3)); }
  noteCrash() {
    if (this.ramming || this.ending > 0) return; this.crashes++;
    if (this.active) {   // poursuite en cours : une voiture de plus toutes les 3 collisions
      const want = Math.min(MAXU, UNITS + Math.floor((this.crashes - (LIMIT + 1))/EXTRA_EVERY));
      if (want > this.total) { this.total = want; this.toast('🚨 Renfort de police !', 'bad', 2.5); }
      this._badge(); return;
    }
    this._badge();
    if (this.crashes > LIMIT) this.start();
    else if (this.crashes === LIMIT) this.toast('⚠ Encore une collision et la police arrive !', 'bad', 3.2);
  }
  start() { this.active = true; this.far = 0; this.total = UNITS; this.downed = 0; this.toast('🚨 La police te poursuit !', 'bad', 3.5); this._badge(); }
  alive() { return this.units.filter(u => !u.down).length; }
  _dmg(u, v) {
    if (u.down || v <= 0) return; u.hp -= v; if (u.hp > 0) return;
    u.down = true; u.hp = 0; this.downed++; u.red.color.setRGB(0.05, 0, 0); u.blue.color.setRGB(0, 0, 0.05); u.sr.material.opacity = u.sb.material.opacity = 0; u.smoke = this._mkSmoke();
    this.toast(`💥 Voiture de police hors service (${Math.min(this.downed, this.total)}/${this.total})`, 'good', 2.4);
  }
  _mkSmoke() { const out = []; for (let i = 0; i < 5; i++) { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0x55555a, depthWrite: false, transparent: true, opacity: 0 })); m.userData.ph = i/5; this.scene.add(m); out.push(m); } return out; }
  _badge() {
    const b = this.badge; b.classList.toggle('hidden', !this.active && this.crashes < 3);
    b.classList.toggle('chase', this.active); b.textContent = this.active ? `🚨 POLICE ${Math.max(0, this.total - this.downed)} en poursuite · 💥 ${this.crashes}` : `💥 Collisions ${this.crashes}/${LIMIT + 1}`;
  }
  _mkBar(u) {
    const grp = new THREE.Group(), base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 1.1), new THREE.MeshLambertMaterial({ color: 0x15151a }));
    u.red = new THREE.MeshBasicMaterial({ color: 0x300000 }); u.blue = new THREE.MeshBasicMaterial({ color: 0x000030 });
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.5), u.red), b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.5), u.blue); r.position.set(0, 0.11, -0.28); b.position.set(0, 0.11, 0.28);
    const sp = (m) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: m, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })); s.position.y = 0.2; return s; };
    u.sr = sp(0xff2a1a); u.sb = sp(0x2a4aff); u.sr.position.z = -0.28; u.sb.position.z = 0.28;
    grp.add(base, r, b, u.sr, u.sb); grp.position.set(this.cabX, this.roof + 0.04, 0); u.car.parts.add(grp);
  }
  _spawn(player) {
    const g = this.graph; for (let tries = 0; tries < 14; tries++) {
      const a = Math.random()*Math.PI*2, d = SPAWN_D[0] + Math.random()*(SPAWN_D[1] - SPAWN_D[0]), sx = player.x + Math.cos(a)*d, sz = player.z + Math.sin(a)*d;
      if (this.units.some(u => Math.hypot(u.x - sx, u.z - sz) < 40)) continue;
      const n = g.nearest(sx, sz, 50, e => e.rank >= 1 && e.level === 0 && !e.bridge); if (!n) continue; const e = n.edge, x = g.px(e, n.i), z = g.pz(e, n.i);
      const gy = this.world.ground(x, z, null); if (gy === null) continue;
      const u = new Player(this.models, this.world, 'pickup', BLACK, { x, y: gy, z }, Math.atan2(player.z - z, player.x - x));
      u.P = { ...u.P, vmax: 46, a0: 6.4, grip: 1.05 }; u.hp = HP; u.down = false; u.onCrash = v => this._dmg(u, v*2.2); u.isPolice = true; u.stuck = 0; u.rev = 0; u.revSide = 1; u.lastRam = 0;
      this._mkBar(u); this.scene.add(u.car.root); u.car.root.visible = !this.hushed; this.units.push(u); return u;
    }
    return null;
  }
  _free(u, ang) { const w = this.world; for (const d of [5, 10, 17]) { const x = u.x + Math.cos(ang)*d, z = u.z + Math.sin(ang)*d; if (w.solid(x, z) && w.deckAt(x, z, u.y, 1.8) === null) return false; } return true; }
  _drive(u, P, dt) {
    if (u.down) { u.update(dt, { steer: 0, throttle: 0, brake: 1, reverse: 0, hand: true }, this.traffic); return; }
    const dx = P.x - u.x, dz = P.z - u.z, d = Math.hypot(dx, dz), lead = Math.min(1.6, d/25), tx = P.x + P.vx*lead, tz = P.z + P.vz*lead;
    let want = Math.atan2(tz - u.z, tx - u.x), blocked = false;
    if (!this._free(u, want)) { blocked = true; for (const off of [0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6]) if (this._free(u, want + off)) { want += off; blocked = false; break; } }
    u.P.vmax = d > 140 ? 58 : 46; u.P.a0 = d > 140 ? 8.2 : 6.4;
    const diff = wrap(want - u.yaw), inp = { steer: clamp(diff*1.7, -1, 1), throttle: 1, brake: 0, reverse: 0, hand: false };
    if (Math.abs(diff) > 0.9 && u.speed > 14) inp.throttle = 0.25; if (Math.abs(diff) > 1.5 && u.speed > 8) { inp.throttle = 0; inp.brake = 0.6; }
    if (u.rev > 0) { u.rev -= dt; inp.reverse = 1; inp.throttle = 0; inp.brake = 0; inp.steer = -u.revSide; }   // marche arrière pour se dégager
    else { u.stuck = u.speed < 1.4 && d > 6 ? u.stuck + dt : Math.max(0, u.stuck - dt); if (u.stuck > 1.3 || blocked && u.speed < 3 && u.stuck > 0.6) { u.rev = 1.3; u.stuck = 0; u.revSide = diff >= 0 ? 1 : -1; } }
    u.update(dt, inp, this.traffic); u.idle = u.speed < 1.4 && d > 9 ? (u.idle || 0) + dt : 0;   // bloquée trop longtemps (embouteillage...) : réapparaît ailleurs
  }
  _ram(u, P, dt) {
    const dx = P.x - u.x, dz = P.z - u.z; if (dx*dx + dz*dz > 36) return; if (Math.abs(P.y - u.y) > 2) return;
    const cu = [-0.3, 0, 0.3].map(f => [u.x + Math.cos(u.yaw)*u.len*f, u.z + Math.sin(u.yaw)*u.len*f]), cp = [-0.3, 0, 0.3].map(f => [P.x + Math.cos(P.yaw)*P.len*f, P.z + Math.sin(P.yaw)*P.len*f]), r = u.wid*0.52 + P.wid*0.52;
    let hit = null; for (const a of cu) for (const b of cp) { const ddx = b[0] - a[0], ddz = b[1] - a[1], dd = Math.hypot(ddx, ddz); if (dd < r) { hit = [ddx/(dd || 1), ddz/(dd || 1), r - dd]; break; } } if (!hit) return;
    const rvx = P.vx - u.vx, rvz = P.vz - u.vz, rel = Math.hypot(rvx, rvz), mp = P.P.mass, mu = u.P.mass, w = mu/(mp + mu);
    P.x += hit[0]*hit[2]*w; P.z += hit[1]*hit[2]*w; u.x -= hit[0]*hit[2]*(1 - w); u.z -= hit[1]*hit[2]*(1 - w);
    const along = rvx*hit[0] + rvz*hit[1];
    if (along < 0) { const j = -along*1.35; P.vx += hit[0]*j*w; P.vz += hit[1]*j*w; u.vx -= hit[0]*j*(1 - w); u.vz -= hit[1]*j*(1 - w); }
    if (rel > 2.5 && this.ramCool <= 0) {
      this.ramCool = 0.9; this._dmg(u, Math.min(rel, 22)*(P.speed > u.speed ? 4.2 : 2.6)*(mp/(mp + mu))*1.6);   // le joueur use la voiture de police ; plus vite et plus lourd = plus de dégâts
      this.ramming = true; try { P.onCrash && P.onCrash(Math.min(rel, 22)); } finally { this.ramming = false; }   // choc subi, mais ne compte pas comme « enchaîner les collisions »
    }
  }
  update(dt, P, traffic) {
    this.traffic = traffic; this.t += dt; this.ramCool -= dt; if (this.hushed) return;
    if (this.ending > 0) { this.ending -= dt; for (const u of this.units) this._drive(u, P, dt); this._smoke(dt); if (this.ending <= 0) this.clear(); return; }
    if (!this.active) { this.sound && this.sound.siren(0); return; }
    // renforts : on garde (voitures prévues - voitures hors service) voitures en état de rouler
    while (this.far < 0.01 && this.alive() < this.total - this.downed) { if (!this._spawn(P)) break; }
    let near = 1e9, fast = false;
    for (const u of this.units) {
      this._drive(u, P, dt); this._ram(u, P, dt); if (u.down) continue; const d = Math.hypot(P.x - u.x, P.z - u.z); near = Math.min(near, d); if (d < 55) fast = true;
      const ph = Math.floor(this.t*7.5) % 4, rOn = ph === 0 || ph === 1 ? 1 : 0, bOn = ph === 2 || ph === 3 ? 1 : 0, k = this.world.night ? 1 : 0.55;
      u.red.color.setRGB(rOn ? 2.2 : 0.18, rOn ? 0.1 : 0, 0); u.blue.color.setRGB(0, bOn ? 0.5 : 0, bOn ? 2.4 : 0.18);
      u.sr.material.opacity = rOn*(0.5 + 0.5*k); u.sb.material.opacity = bOn*(0.5 + 0.5*k); const sz = 2.2 + 2.2*k; u.sr.scale.setScalar(sz); u.sb.scale.setScalar(sz);
    }
    this._smoke(dt);
    const live = this.units.filter(u => !u.down);
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) { const a = live[i], b = live[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz); if (d < 3.2 && d > 0.01) { const p = (3.2 - d)/2; a.x -= dx/d*p; a.z -= dz/d*p; b.x += dx/d*p; b.z += dz/d*p; } }
    if (this.sound) this.sound.siren(clamp(1 - near/260, 0, 1)**1.4, fast);
    if (this._bn !== this.alive() + '/' + this.crashes + '/' + this.total + '/' + this.downed) { this._bn = this.alive() + '/' + this.crashes + '/' + this.total + '/' + this.downed; this._badge(); }
    // toutes les voitures du dispositif sont hors service : poursuite terminée (les épaves restent quelques secondes)
    if (this.downed >= this.total && this.total > 0) {
      this.active = false; this.crashes = 0; this.ending = 7; this.sound && this.sound.siren(0); this.toast('🏁 Police neutralisée : poursuite terminée !', 'good', 3.5); this._badge(); return;
    }
    // semer la police : loin de toutes les voitures encore actives assez longtemps
    this.far = near > FLEE_D ? this.far + dt : Math.max(0, this.far - dt*2);
    if (this.far > FLEE_T) { this.active = false; this.crashes = 0; this.clear(); this._badge(); this.toast('👍 Tu as semé la police', 'good', 3); return; }
    for (const u of this.units) if (!u.down && (u.idle > 5 || Math.hypot(P.x - u.x, P.z - u.z) > 520)) { this.scene.remove(u.car.root); this.units = this.units.filter(x => x !== u); }   // coincée ou trop loin : revient plus près
  }
  /** fumée des épaves */
  _smoke(dt) {
    for (const u of this.units) if (u.smoke) for (const m of u.smoke) { const ph = (m.userData.ph = (m.userData.ph + dt*0.35) % 1);
      m.position.set(u.x + Math.cos(u.yaw)*u.len*0.3, u.y + 1.0 + ph*3.2, u.z + Math.sin(u.yaw)*u.len*0.3); m.scale.setScalar(0.9 + ph*2.6); m.material.opacity = (1 - ph)*0.5*Math.min(1, ph*6); }
  }
}
