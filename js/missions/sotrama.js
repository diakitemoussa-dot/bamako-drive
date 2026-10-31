// Ligne de sotrama : plusieurs arrêts (cercles), des passagers qui montent et descendent à 250 FCFA par personne, satisfaction à préserver.
import { Figure } from './passenger.js';
import { findRoute, laneNear, randomStop, nearestLandmark, follow, distTxt } from './route.js';
import { fmt } from './fare.js';
import { RING_R, STOP_V } from './taxi.js';
import { SOTRAMA_CALLS } from './scenarios.js';

const CAP = 14, FARE = 250, N_STOPS = 4, WALK = 1.6;
export const DOOR_CFG = { hx: 0.55, hz: 0.97, len: 1.3, py: 0.95, ph: 0.9, gy: 1.6, gh: 0.5 };
const DOOR_X = DOOR_CFG.hx - DOOR_CFG.len/2;

export class SotramaLine {
  /** pk : { x, z, e, i, items:[Figure…] } — le premier arrêt, avec son groupe de passagers qui attend */
  constructor(E, pk) {
    this.E = E; this.p = E.player; this.pk = pk; this.pax = []; this.idx = 0; this.satisf = 100; this.earned = 0; this.walkers = []; this.phase = 'service'; this.angry = false; this.failed = false; this.t = 0;
    const lm = nearestLandmark(E, pk.x, pk.z), g = E.graph; this.stops = [{ name: lm ? lm.name : 'Arrêt', x: pk.x, z: pk.z, e: pk.e, i: pk.i }];
    while (this.stops.length < N_STOPS) { const s = randomStop(E, this.stops.at(-1), 350, 800, this.stops); if (!s) break; this.stops.push(s); }
    if (this.stops.length < 2) { this.failed = true; return; }
    this.route = null; this.routeI = 0; this._arrive(true);
    const last = this.stops.at(-1).name; E.ui.say('L’apprenti', SOTRAMA_CALLS[1].replace('{last}', last)); setTimeout(() => { if (this.E.ride === this) this.E.ui.hide(); }, 2600);
  }
  get door() { return this.E.door; }
  _doorXZ(r = 1.3) { const p = this.p, c = Math.cos(p.yaw), s = Math.sin(p.yaw); return [p.x + c*DOOR_X - s*r, p.z + s*DOOR_X + c*r]; }
  _ground(f) { const g = this.E.world.ground(f.root.position.x, f.root.position.z, this.p.y); if (g !== null) f.root.position.y += (g - f.root.position.y)*0.5; }

  // ---------- arrêt : descente puis montée ----------
  _arrive(first) {
    const E = this.E, k = this.idx, last = k === this.stops.length - 1; this.phase = 'service'; this.t = 0;
    const out = this.pax.filter(d => d === k || last || this.angry).length; this.pax = this.pax.filter(d => !(d === k || last || this.angry));
    let board = 0; if (!last && !this.angry) { board = first ? this.pk.items.filter(f => f instanceof Figure).length : 2 + ((Math.random()*4) | 0); board = Math.min(board, CAP - this.pax.length); }
    this.sIn = board; this.sOut = out; this.spawnT = 0; this.outLeft = out; this.boarders = [];
    if (first) { this.boarders = this.pk.items.filter(f => f instanceof Figure).slice(0, board); for (const f of this.pk.items) if (!this.boarders.includes(f)) f.dispose(); this.pk.items = []; }
    else for (let i = 0; i < board; i++) { const f = new Figure(Math.random() < 0.5); const s = this.stops[k], h = E.graph.heading(s.e, s.i), r = [-Math.sin(h), Math.cos(h)]; f.place(s.x + r[0]*2.2 + Math.cos(h)*(i - board/2)*1.1, this.p.y, s.z + r[1]*2.2 + Math.sin(h)*(i - board/2)*1.1); E.scene.add(f.root); this.boarders.push(f); }
    this.boarders.forEach(f => { f.root.position.y = this.p.y; });
    this.door.target = 1; this.waitOpen = true;
    if (!first) E.toast(this.stops[k].name + ' : ' + out + ' descendent' + (board ? ', ' + board + ' montent' : ''), 'good', 2.4);
  }
  _service(dt) {
    const door = this.door;
    if (this.waitOpen) { if (!door.open) return; this.waitOpen = false; this.boarders.forEach(f => this.walkers.push({ f, wp: [this._doorXZ(1.0)], kind: 'in' })); }
    this.spawnT -= dt;
    if (this.outLeft > 0 && this.spawnT <= 0) { this.spawnT = 0.45; this.outLeft--; const f = new Figure(Math.random() < 0.5), d = this._doorXZ(0.9); f.place(d[0], this.p.y, d[1]); this.E.scene.add(f.root); const p = this.p, c = Math.cos(p.yaw), s = Math.sin(p.yaw), a = (Math.random() - 0.5)*5;
      this.walkers.push({ f, wp: [this._doorXZ(2.8), [p.x + c*(-2 + a) - s*5.5, p.z + s*(-2 + a) + c*5.5]], kind: 'out' }); }
    for (let k = this.walkers.length - 1; k >= 0; k--) {
      const w = this.walkers[k], pos = w.f.root.position, [tx, tz] = w.wp[0], dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz);
      if (d < 0.15) { w.wp.shift(); if (!w.wp.length) { if (w.kind === 'in') { this.pax.push(this.idx + 1 + ((Math.random()*(this.stops.length - 1 - this.idx)) | 0)); this.earned += FARE; this.E.ui.setCash(this.E.ui.cash + FARE); } w.f.dispose(); this.walkers.splice(k, 1); } continue; }
      const st = Math.min(d, WALK*dt); pos.x += dx/d*st; pos.z += dz/d*st; w.f.face(Math.atan2(dz, dx)); w.f.animate(dt, true, false); this._ground(w.f);
    }
    if (!this.walkers.length && this.outLeft <= 0 && door.open) door.target = 0;
    if (door.closed && !this.walkers.length && this.outLeft <= 0 && !this.waitOpen && door.target === 0 && this.t > 0.8) this._leave();
  }
  _leave() {
    const E = this.E;
    if (this.idx >= this.stops.length - 1 || this.angry) { this._finish(); return; }
    this.idx++;
    for (;;) { const s = this.stops[this.idx], n0 = laneNear(E.graph, this.p.x, this.p.z, 60), r = n0 && findRoute(E.graph, n0.edge, n0.i, s.e, s.i);
      if (r && r.len > 120) { this.route = r; this.routeI = 0; this.dest = s; break; } this.stops.splice(this.idx, 1); if (this.idx >= this.stops.length) { this._finish(); return; } }
    this.phase = 'drive'; E.toast('Prochain arrêt : ' + this.dest.name, '', 2.2);
  }
  _finish() {
    const E = this.E, bonus = this.angry ? 0 : Math.round(this.earned*0.3*this.satisf/100/50)*50;
    if (bonus) E.ui.setCash(E.ui.cash + bonus);
    E.toast(this.angry ? 'Ligne interrompue : les passagers sont descendus ' + (this.earned ? '(' + fmt(this.earned) + ' encaissés)' : '') : 'Fin de ligne ! ' + fmt(this.earned) + (bonus ? ' + ' + fmt(bonus) + ' de bonus' : ''), this.angry ? 'bad' : 'good', 3.8);
    this.phase = 'done'; E.ui.hideAll(); E.rideDone(!this.angry);
  }

  hurt(n, why) { if (this.phase !== 'drive') return; this.satisf = Math.max(0, this.satisf - n*0.8); if (why) this.E.toast('Les passagers râlent !', 'bad', 1.6); }

  // ---------- boucle ----------
  update(dt, inp, ex) {
    const E = this.E, p = this.p; this.t += dt; let lock = this.phase === 'service';
    if (this.phase === 'service') this._service(dt);
    else if (this.phase === 'drive') {
      if (ex.limit != null && ex.kmh > ex.limit + 14) this.hurt(1.8*dt);
      const f = follow(E, this, p, dt); E.ui.setGuide('Arrêt ' + (this.idx + 1) + '/' + this.stops.length + ' · ' + this.dest.name, distTxt(f.dd), f.rel, 'dest');
      E.ui.setPatience(this.satisf, this.pax.length + '/' + CAP + ' · ' + fmt(this.earned), '🚌');
      if (this.satisf <= 0) { this.phase = 'angry'; this.angry = true; E.ui.say('Passagers', 'Arrête-toi ! On descend, tu conduis trop mal !'); }
      else if (f.dd < RING_R && Math.abs(p.speed) < STOP_V) { this._arrive(false); lock = true; }
    } else if (this.phase === 'angry') { inp.brake = 1; inp.throttle = 0; inp.hand = Math.abs(p.speed) < 3; if (Math.abs(p.speed) < 0.8) { E.ui.hide(); this._arrive(false); } }
    if (lock) { inp.throttle = 0; inp.brake = 0; inp.hand = true; inp.steer = 0; }
    return lock;
  }
  dispose() { for (const w of this.walkers) w.f.dispose(); this.walkers = []; for (const f of this.boarders || []) f.dispose(); for (const f of this.pk.items) f.dispose(); this.pk.items = []; }
  get finished() { return this.phase === 'done'; }
  get showRoute() { return this.phase === 'drive' || this.phase === 'angry'; }
  get target() { return this.phase === 'service' || this.phase === 'drive' || this.phase === 'angry' ? (this.dest || this.stops[0]) : null; }
  get targets() { return this.showRoute && this.dest ? [this.dest] : []; }
}
