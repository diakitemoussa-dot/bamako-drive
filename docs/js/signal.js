// Clignotants du véhicule du joueur : 4 feux orange aux coins, témoins ◀ ▶ au compteur, « tic-tac », annulation automatique après le virage.
// Commandes : manette L1 (gauche) / R1 (droite) · clavier J (gauche) / K (droite) · boutons tactiles ◀ ▶. Même touche = éteindre ; l'autre = changer de côté.
import * as THREE from 'three';

const LAMP_Y = { taxi: 0.78, sedan: 0.78, suv: 0.92, pickup: 0.92, sotrama: 0.95, truck: 1.0, moto: 0.98, tricycle: 0.85 };
const ON = 0xffa31a, OFF = 0x5a3606, RATE = 1.6;   // couleur allumée / éteinte ; clignotements par seconde

export class Signal {
  constructor(sound) {
    this.sound = sound; this.dir = 0; this.t = 0; this.age = 0; this.turned = false; this.straightT = 0; this.lamps = []; this.on = false; this.matOn = new THREE.MeshBasicMaterial({ color: ON }); this.matOff = new THREE.MeshLambertMaterial({ color: OFF });
    const hud = document.getElementById('speedo'); this.hL = this.hR = null;
    if (hud && !document.getElementById('sig')) { const d = document.createElement('div'); d.id = 'sig'; d.innerHTML = '<span id="sigL">◀</span><span id="sigR">▶</span>'; hud.appendChild(d); }
    this.hL = document.getElementById('sigL'); this.hR = document.getElementById('sigR'); this.bL = document.getElementById('btnSigL'); this.bR = document.getElementById('btnSigR');
  }
  /** pose les feux sur la carrosserie : 2 devant, 2 derrière (côté gauche = z négatif) */
  attach(car, kind) {
    this.detach(); this.car = car; this.dir = 0; this.on = false; const g = car.K.detail; g.computeBoundingBox(); const bb = g.boundingBox, y = LAMP_Y[kind] ?? 0.8, hw = Math.max(0.28, bb.max.z - 0.07), w = kind === 'moto' ? 0.07 : 0.2;
    for (const [x, side, rear] of [[bb.max.x - 0.06, -1, 0], [bb.max.x - 0.06, 1, 0], [bb.min.x + 0.06, -1, 1], [bb.min.x + 0.06, 1, 1]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, w), this.matOff); m.position.set(x, y + (rear ? 0.05 : 0), side*hw); car.parts.add(m); this.lamps.push({ m, side });
    }
    this._paint();
  }
  detach() { for (const l of this.lamps) { l.m.removeFromParent(); l.m.geometry.dispose(); } this.lamps = []; this.dir = 0; this._hud(false); }
  toggle(dir) { this.dir = this.dir === dir ? 0 : dir; this.age = 0; this.turned = false; this.straightT = 0; this.t = 0; this.on = false; if (this.dir) this._tick(); this._paint(); }
  cancel() { if (this.dir) this.toggle(this.dir); }
  _tick() { if (this.sound && this.sound.ctx) this.sound.beep(this.on ? 1500 : 1100); }
  /** steer : -1 gauche … +1 droite (de l'entrée du joueur) */
  update(dt, steer, speed) {
    if (!this.dir) return; this.t += dt; this.age += dt;
    const s = steer*this.dir;   // > 0 : on tourne du côté du clignotant
    if (s > 0.3) { this.turned = true; this.straightT = 0; } else if (this.turned && Math.abs(steer) < 0.1) { this.straightT += dt; if (this.straightT > 0.7) { this.cancel(); return; } }
    if (this.age > 45) { this.cancel(); return; }
    const on = (this.t*RATE) % 1 < 0.5; if (on !== this.on) { this.on = on; this._tick(); this._paint(); }
  }
  _paint() {
    for (const l of this.lamps) { const lit = this.dir && l.side === this.dir && this.on; l.m.material = lit ? this.matOn : this.matOff; l.m.scale.setScalar(lit ? 1.35 : 1); }
    this._hud(this.dir && this.on);
  }
  _hud(blinkOn) {
    if (this.hL) this.hL.classList.toggle('on', !!blinkOn && this.dir === -1); if (this.hR) this.hR.classList.toggle('on', !!blinkOn && this.dir === 1);
    if (this.bL) this.bL.classList.toggle('on', this.dir === -1); if (this.bR) this.bR.classList.toggle('on', this.dir === 1);
  }
}
