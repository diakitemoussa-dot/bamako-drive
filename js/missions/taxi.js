// Une course de taxi : machine à états  aller vers la portière → monter → marchander → conduire → descendre → payer.
import { planTrip, follow, distTxt } from './route.js';
import { fairPrice, choices, react, tipFor, fmt } from './fare.js';

const WALK = 1.5, SEAT = [-0.55, 0.35], DOOR_X = -0.62;   // SEAT : [avant/arrière, droite] dans le repère de la voiture
export const RING_R = 4, STOP_V = 1.5;                  // rayon du cercle jaune (m) ; vitesse max pour s'arrêter dedans (m/s)

export class TaxiRide {
  /** pickup : { client, figure } — le client attend déjà au bord de la route */
  constructor(E, pickup) {
    this.E = E; this.p = E.player; this.client = pickup.client; this.fig = pickup.figure; this.price = 0; this.phase = 'toDoor'; this.t = 0; this.paid = false; this.failed = false;
    if (!this._plan()) { this.failed = true; return; }
    this.wp = this._approachPath(); E.ui.hideGuide(); E.toast(this.client.name + ' arrive…', '', 1.8);
  }

  // ---------- géométrie liée à la voiture ----------
  _frame() { const p = this.p, c = Math.cos(p.yaw), s = Math.sin(p.yaw); return { x: p.x, z: p.z, fx: c, fz: s, rx: -s, rz: c }; }
  _at(a, r) { const f = this._frame(); return [f.x + f.fx*a + f.rx*r, f.z + f.fz*a + f.rz*r]; }
  _side() { const f = this._frame(), q = this.fig.root.position; return (q.x - f.x)*f.rx + (q.z - f.z)*f.rz; }   // > 0 : côté droit (côté portière)
  _seatXZ() { return this._at(SEAT[0], SEAT[1]); }
  _approachPath() { const curb = this._at(DOOR_X, 2.1); return this._side() > 0.6 ? [curb] : [this._at(-3.6, -2.4), this._at(-3.6, 2.4), curb]; }

  // ---------- itinéraire et destination ----------
  _plan() {
    const t = planTrip(this.E, this.p, 700, 3600, 500); if (!t) return false;
    this.dest = t.dest; this.route = t.route; this.routeI = 0; this.fair = fairPrice(t.route.len*(this.E.vip ? 1.4 : 1)); return true;
  }
  hurt(n, why) { if (this.phase !== 'drive') return; this.client.patience = Math.max(0, this.client.patience - n); if (why) this.E.toast(why, 'bad', 1.6); }

  // ---------- déplacement du client ----------
  _walk(dt, tx, tz, speed = WALK) {
    const f = this.fig, pos = f.root.position, dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz);
    if (d < 0.08) { f.animate(dt, false, false); return 0; }
    const st = Math.min(d, speed*dt); pos.x += dx/d*st; pos.z += dz/d*st; f.face(Math.atan2(dz, dx)); f.animate(dt, true, false);
    const g = this.E.world.ground(pos.x, pos.z, this.p.y); if (g !== null) pos.y += (g - pos.y)*Math.min(1, dt*8);
    return d - st;
  }
  _followPath(dt) { while (this.wp.length) { const [x, z] = this.wp[0]; if (this._walk(dt, x, z) > 0.05) return false; this.wp.shift(); } return true; }

  // ---------- boucle : renvoie true tant que la voiture doit rester immobile ----------
  update(dt, inp, ex) {
    const E = this.E, door = E.door, p = this.p; this.t += dt; let lock = this.phase !== 'drive' && this.phase !== 'done';
    switch (this.phase) {
      case 'toDoor':
        if (this._followPath(dt)) { const f = this._frame(); this.fig.face(Math.atan2(-f.rz, -f.rx)); door.target = 1; this.phase = 'opening'; } break;
      case 'opening':
        this.fig.animate(dt, false, false); if (door.open) { this.wp = [this._at(DOOR_X, 0.9), this._seatXZ()]; this.phase = 'stepIn'; } break;
      case 'stepIn': {
        const last = this.wp.length === 1; if (this._followPath(dt)) { this.fig.root.visible = false; door.target = 0; this.phase = 'closingIn'; }
        else if (last) this.fig.root.position.y += (p.y + 0.35 - this.fig.root.position.y)*Math.min(1, dt*6); break; }
      case 'closingIn': if (door.closed) this._offer(); break;
      case 'offer': case 'counter': break;
      case 'talk': if ((this.timer -= dt) <= 0) this._after(this.afterTalk); break;
      case 'drive': lock = this._drive(dt, ex); break;
      case 'angry': inp.brake = 1; inp.throttle = 0; inp.hand = Math.abs(p.speed) < 3; lock = false; if (Math.abs(p.speed) < 0.8) this._after('leave'); break;
      case 'exitOpen':
        door.target = 1; if (door.open) { const s = this._seatXZ(); this.fig.place(s[0], p.y + 0.35, s[1]); this.fig.root.visible = true; this.wp = [this._at(DOOR_X, 0.9), this._at(DOOR_X, 2.7)]; this.phase = 'exitWalk'; } break;
      case 'exitWalk':
        if (this._followPath(dt)) { this._pay(); this.wp = [this._at(-9, 4.4)]; this.phase = 'exitAway'; this.t = 0; }
        else if (this._side() > 2.0) door.target = 0; break;
      case 'exitAway':
        this._followPath(dt); door.target = 0; lock = !door.closed;
        if (!this.wp.length || this.t > 6) { this.fig.dispose(); this.phase = 'done'; } break;
    }
    if (lock) { inp.throttle = 0; inp.brake = 0; inp.hand = true; inp.steer = 0; }
    return lock;
  }
  get finished() { return this.phase === 'done'; }
  get showRoute() { return this.phase === 'drive' || this.phase === 'angry'; }
  get target() { return ['drive', 'angry', 'exitOpen'].includes(this.phase) ? this.dest : null; }
  get targets() { return this.showRoute ? [this.dest] : []; }
  dispose() { if (this.fig) this.fig.dispose(); }

  // ---------- marchandage ----------
  _offer() {
    const E = this.E, c = this.client, ch = choices(this.fair), km = (this.route.len/1000).toFixed(1).replace('.', ',');
    E.ui.hideGuide(); E.ui.hidePatience(); this.phase = 'offer';
    E.ui.ask(c.name, (E.vip ? `Bonjour chauffeur, je suis pressé. C'est combien pour ${this.dest.name} ? (${km} km)` : `I ni ce ! C'est combien pour aller à ${this.dest.name} ? (${km} km)`), ch.map((v, i) => ({ label: fmt(v), cls: i === 1 ? 'mid' : '' })), i => this._pick(ch[i]));
  }
  _talk(text, secs, after) { this.E.ui.say(this.client.name, text); this.phase = 'talk'; this.timer = secs; this.afterTalk = after; }
  _pick(price) {
    const E = this.E, r = react(this.client, this.fair, price); this.price = price;
    if (r.kind === 'accept') this._talk(r.text, 1.1, 'drive');
    else if (r.kind === 'leave') this._talk(r.text, 1.6, 'leave');
    else {
      this.phase = 'counter';
      E.ui.ask(this.client.name, r.text, [{ label: 'Accepter ' + fmt(r.price), cls: 'mid' }, { label: 'Refuser (le client descend)', cls: 'no' }],
        i => { if (i === 0) { this.price = r.price; this._talk('Merci ! On y va.', 1.0, 'drive'); } else this._talk('Alors je descends, au revoir.', 1.4, 'leave'); });
    }
  }
  _after(what) {
    const E = this.E;
    if (what === 'drive') { this.phase = 'drive'; this.driveT = 0; E.ui.hide(); E.ui.setPatience(100, fmt(this.price)); E.toast('En route vers ' + this.dest.name, 'good', 2.4); return; }
    E.ui.hide(); E.ui.hidePatience(); E.ui.hideGuide(); this.paid = false; this.phase = 'exitOpen';
  }

  // ---------- trajet ----------
  _drive(dt, ex) {
    const E = this.E, p = this.p, c = this.client; this.driveT += dt;
    if (ex.limit != null && ex.kmh > ex.limit + 14) { this.hurt(2.2*dt); this.speedT = (this.speedT || 0) - dt; if (this.speedT <= 0) { this.speedT = 6; E.toast('Ralentis, s\'il te plaît !', 'bad', 1.6); } }
    if (this.driveT > 45 + this.route.len/8) this.hurt(1*dt);        // course trop longue : le client s'impatiente
    const f = follow(E, this, p, dt), dd = f.dd;
    E.ui.setGuide(this.dest.name, distTxt(dd), f.rel, 'dest'); E.ui.setPatience(c.patience, fmt(this.price));
    if (c.patience <= 0) { this.phase = 'angry'; this.angry = true; E.ui.say(c.name, 'J\'en ai marre ! Arrête-toi, je descends !'); return false; }
    if (dd < RING_R && Math.abs(p.speed) < STOP_V) { this.phase = 'exitOpen'; this.paid = true; E.ui.hidePatience(); E.ui.hideGuide(); E.ui.say(c.name, 'On est arrivés, merci !'); return true; }
    return false;
  }
  _pay() {
    const E = this.E; E.ui.hide();
    if (!this.paid) { E.toast(this.client.name + (this.angry ? ' est parti sans payer' : ' a quitté le taxi'), 'bad', 2.8); E.rideDone(false); return; }
    const tip = tipFor(this.price, this.client.patience); E.ui.setCash(E.ui.cash + this.price + tip);
    E.toast('+ ' + fmt(this.price) + (tip ? ' · pourboire ' + fmt(tip) : ''), 'good', 3.2); E.rideDone(true);
  }
}
