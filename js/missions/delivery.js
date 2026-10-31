// Livraison / transport de marchandises (moto Jakarta, tricycle, pick-up, camion) : charger → conduire sans abîmer ni traîner → décharger → être payé.
import { planTrip, follow, distTxt } from './route.js';
import { fmt } from './fare.js';
import { DELIVERY } from './scenarios.js';
import { RING_R, STOP_V } from './taxi.js';

export class Delivery {
  /** pk : { client, job, items } — l'expéditeur attend déjà au point jaune */
  constructor(E, pk) {
    this.E = E; this.p = E.player; this.pk = pk; this.job = pk.job; this.cfg = DELIVERY[E.kind]; this.integrity = 100; this.phase = 'loading'; this.timer = 1.9; this.failed = false; this.driveT = 0; this.late = 0;
    const t = planTrip(E, this.p, this.cfg.minD, this.cfg.maxD, 400); if (!t) { this.failed = true; return; }
    this.dest = t.dest; this.route = t.route; this.routeI = 0; this.receiver = pk.receiver;
    const km = t.route.len/1000; this.pay = Math.round((this.job.base + this.job.perKm*km)/50)*50; this.deadline = 45 + t.route.len/this.cfg.speed;
    E.ui.hideGuide(); E.ui.say(pk.client.name, this.job.give); pk.figure.face(Math.atan2(this.p.z - pk.figure.root.position.z, this.p.x - pk.figure.root.position.x));
  }
  hurt(n, why) {
    if (this.phase !== 'drive') return; const before = this.integrity; this.integrity = Math.max(0, this.integrity - n*this.job.fragile);
    if (why && this.integrity < before) this.E.toast(this.integrity > 0 ? '⚠ ' + this.job.item + ' secoué(es) ! ' + Math.round(this.integrity) + ' %' : '', 'bad', 1.6);
  }
  /** vrai tant que le véhicule doit rester immobile */
  update(dt, inp, ex) {
    const E = this.E, p = this.p; let lock = this.phase === 'loading' || this.phase === 'unloading';
    for (const it of this.pk.items) if (it.animate) it.animate(dt, false, this.phase === 'loading');
    switch (this.phase) {
      case 'loading': if ((this.timer -= dt) <= 0) {
        this.E.setCargo(true); this._disposeItems(); E.ui.hide(); this.phase = 'drive'; E.toast(this.job.icon + ' ' + this.job.item + ' chargé(es) → ' + this.dest.name, 'good', 3); } break;
      case 'drive': lock = this._drive(dt, ex); break;
      case 'unloading': if ((this.timer -= dt) <= 0) this._finish(); break;
    }
    if (lock) { inp.throttle = 0; inp.brake = 0; inp.hand = true; inp.steer = 0; }
    return lock;
  }
  _potential() {
    const over = Math.max(0, this.driveT - this.deadline), lateF = Math.max(0.5, 1 - over/150), early = this.driveT < this.deadline*0.6 && this.job.hot ? 1.25 : 1;
    return Math.round(this.pay*(this.integrity/100)*lateF*early/50)*50;
  }
  _drive(dt, ex) {
    const E = this.E, p = this.p; this.driveT += dt;
    if (ex.limit != null && ex.kmh > ex.limit + 14) this.hurt(1.6*dt);
    const f = follow(E, this, p, dt), left = this.deadline - this.driveT, mm = Math.max(0, Math.ceil(left)), clock = Math.floor(mm/60) + ':' + String(mm % 60).padStart(2, '0');
    E.ui.setGuide(this.dest.name, distTxt(f.dd), f.rel, 'dest');
    E.ui.setPatience(this.integrity, (left >= 0 ? '⏱ ' + clock : '⏱ en retard') + ' · ' + fmt(this._potential()), this.job.icon);
    if (this.integrity <= 0) { E.toast(this.job.icon + ' ' + this.job.item + ' : tout est abîmé, le client refuse la livraison', 'bad', 3.5); this._end(false); return false; }
    if (this.job.hot && left < -70) { E.toast('Le client a annulé : tu es arrivé trop tard', 'bad', 3.5); this._end(false); return false; }
    if (f.dd < RING_R && Math.abs(p.speed) < STOP_V) { this.phase = 'unloading'; this.timer = 1.9; E.ui.hidePatience(); E.ui.hideGuide(); E.ui.say(this.receiver, this.job.get); E.setCargo(false); return true; }
    return false;
  }
  _finish() {
    const E = this.E, pay = this._potential(), early = this.driveT < this.deadline*0.6 && this.job.hot;
    E.ui.hide(); E.ui.setCash(E.ui.cash + pay); E.toast('+ ' + fmt(pay) + (early ? ' · bonus rapidité' : this.integrity < 90 ? ' · marchandise abîmée' : ''), 'good', 3.4); this._end(true);
  }
  _end(ok) { this.E.setCargo(false); this.E.ui.hide(); this.E.ui.hidePatience(); this.E.ui.hideGuide(); this.phase = 'done'; this.E.rideDone(ok); }
  _disposeItems() { for (const it of this.pk.items) it.dispose(); this.pk.items = []; }
  dispose() { this._disposeItems(); this.E.setCargo(false); }
  get finished() { return this.phase === 'done'; }
  get showRoute() { return this.phase === 'drive'; }
  get target() { return this.phase === 'drive' || this.phase === 'unloading' ? this.dest : null; }
  get targets() { return this.showRoute ? [this.dest] : []; }
}
