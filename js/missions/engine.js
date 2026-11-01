// Moteur de missions : points jaunes (clients / chargements / arrêts qui attendent), mission active, argent, dessin sur les cartes.
// Une mission = classe avec update(dt, inp, ex) → true si le véhicule doit rester immobile, hurt(n, why), dispose(), finished,
// showRoute (dessiner l'itinéraire), route/routeI, target ({x,z} du cercle blanc ou null), targets (points à marquer sur les cartes).
//   taxi, berline, 4x4 → course (TaxiRide)   sotrama → ligne à arrêts (SotramaLine)   moto, tricycle, pick-up, camion → livraison (Delivery)
import * as THREE from 'three';
import { MissionUI } from './ui.js';
import { reaction } from './voice.js';
import { Door, Figure, Crate } from './passenger.js';
import { TaxiRide, RING_R, STOP_V } from './taxi.js';
import { SotramaLine, DOOR_CFG } from './sotrama.js';
import { Delivery } from './delivery.js';
import { DELIVERY, pickJob } from './scenarios.js';
import { newClient } from './fare.js';

const MAX_WAITING = 3, GOLD = 0xF9D58B, CREAM = 0xF8F3EA;
/** mode par véhicule ; door = portière à animer (réglages) ; vip = clientèle exigeante */
const KIND = {
  taxi: { mode: 'taxi', door: {} }, sedan: { mode: 'taxi', door: {}, vip: true }, suv: { mode: 'taxi', door: { hz: 0.95, len: 1.1, py: 0.9, gy: 1.35, gh: 0.38 }, vip: true },
  sotrama: { mode: 'sotrama', door: DOOR_CFG }, moto: { mode: 'delivery' }, tricycle: { mode: 'delivery' }, pickup: { mode: 'delivery' }, truck: { mode: 'delivery' },
};
const PICK_LABEL = { taxi: 'Client', sotrama: 'Arrêt', delivery: 'Chargement' };

export class Missions {
  /** deps : { scene, world, graph, landmarks, toast } */
  constructor(deps) {
    Object.assign(this, deps); this.ui = new MissionUI(); this.enabled = false; this.player = null; this.kind = null; this.pickups = []; this.ride = null; this.door = null; this.cargo = null; this.spawnT = 0; this.time = 0; this.locked = false;
    this.ringGeo = new THREE.RingGeometry(RING_R - 0.9, RING_R, 56).rotateX(-Math.PI/2); this.discGeo = new THREE.CircleGeometry(RING_R - 0.9, 40).rotateX(-Math.PI/2); this.beamGeo = new THREE.CylinderGeometry(RING_R, RING_R, 26, 32, 1, true).translate(0, 13, 0);
    const m = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.mats = { ring: m(GOLD, 0.95), disc: m(GOLD, 0.28), beam: m(GOLD, 0.12), ringW: m(CREAM, 0.95), discW: m(CREAM, 0.28), beamW: m(CREAM, 0.12) };
    this.destRing = null; this.firstHint = true;
  }
  get vip() { return !!(KIND[this.kind] && KIND[this.kind].vip); }
  get mode() { return KIND[this.kind] && KIND[this.kind].mode; }

  /** à appeler quand le joueur (re)démarre : réinitialise tout ; actif pour les véhicules de travail */
  attach(player, kind) {
    this.clear(); this.player = player; this.kind = kind; const K = KIND[kind]; this.enabled = !!K; this.ui.hideAll(); if (!K) { this.ui.cashEl.classList.remove('on'); return; }
    this.ui.setCash(this.ui.cash); this.spawnT = 2.5; this.firstHint = true;
    if (K.door) this.door = new Door(player.car, K.door);
    const cr = DELIVERY[kind] && DELIVERY[kind].crate; if (cr) { this.cargo = new Crate(cr.size); this.cargo.root.position.set(cr.pos[0], cr.pos[1] - cr.size[1]/2, cr.pos[2]); this.cargo.root.visible = false; player.car.parts.add(this.cargo.root); }
  }
  setCargo(on) { if (this.cargo) this.cargo.root.visible = on; }
  clear() {
    for (const p of this.pickups) this._dropPickup(p); this.pickups.length = 0;
    if (this.ride) { this.ride.dispose(); this.ride = null; } if (this.door) { this.door.remove(); this.door = null; }
    if (this.cargo) { this.cargo.dispose(); this.cargo = null; } this._removeDest(); this.locked = false; this.ui.hideAll();
  }

  // ---------- cercles jaunes ----------
  _makeRing(x, z, white) {
    const g = new THREE.Group(), s = white ? 'W' : '';
    g.add(new THREE.Mesh(this.ringGeo, this.mats['ring' + s]), new THREE.Mesh(this.discGeo, this.mats['disc' + s]), new THREE.Mesh(this.beamGeo, this.mats['beam' + s])); g.position.set(x, 0, z); g.children.forEach(o => { o.renderOrder = 6; }); this.scene.add(g); return g;
  }
  _spawnPickup() {
    const g = this.graph, p = this.player; if (!g || !p) return false;
    for (let k = 0; k < 60; k++) {
      const e = g.edges[(Math.random()*g.edges.length) | 0]; if (e.rank < 1 || e.level !== 0 || e.bridge || e.len < 40) continue;
      const i = Math.min(e.n - 3, Math.max(2, (e.n*(0.3 + Math.random()*0.4)) | 0)), x = g.px(e, i), z = g.pz(e, i), d = Math.hypot(x - p.x, z - p.z); if (d < 120 || d > 480) continue;
      if (this.pickups.some(q => Math.hypot(q.x - x, q.z - z) < 150)) continue;
      const y = this.world.ground(x, z, null); if (y === null) continue;
      const h = g.heading(e, i), fx = Math.cos(h), fz = Math.sin(h), rx = -fz, rz = fx, client = newClient(), mode = this.mode, items = [];
      const add = (it, ax, az) => { it.root.position.set(ax, y, az); this.scene.add(it.root); items.push(it); return it; };
      const cx = x + rx*3.4, cz = z + rz*3.4, main = add(new Figure(client.female), cx, cz); main.face(Math.atan2(-rz, -rx));
      const pk = { x: x + rx*1.6, z: z + rz*1.6, y, e, i, client, figure: main, cx, cz, items, mode, label: PICK_LABEL[mode] };
      if (mode === 'sotrama') for (let n = 1; n < 2 + ((Math.random()*3) | 0); n++) { const f = add(new Figure(Math.random() < 0.5), cx + fx*n*1.1, cz + fz*n*1.1); f.face(Math.atan2(-rz, -rx)); }
      if (mode === 'delivery') { pk.job = pickJob(this.kind); pk.receiver = newClient().name; pk.label = pk.job.icon + ' ' + pk.job.item; add(new Crate([0.8, 0.6, 0.8]), cx + fx*1.0, cz + fz*1.0); }
      pk.ring = this._makeRing(pk.x, pk.z); pk.ring.position.y = y + 0.08; this.pickups.push(pk); return true;
    }
    return false;
  }
  _dropPickup(p) { this.scene.remove(p.ring); for (const it of p.items) it.dispose(); p.items = []; }
  _removeDest() { if (this.destRing) { this.scene.remove(this.destRing); this.destRing = null; } }

  // ---------- événements du jeu ----------
  onCrash(v) { if (this.ride) this.ride.hurt(Math.min(25, v*2.2)*(this.vip ? 1.5 : 1), reaction('crash')); }
  onPedHit() { if (this.ride) this.ride.hurt(40, reaction('ped')); }
  rideDone(ok) { this.spawnT = 6; if (this.onRideDone) this.onRideDone(ok); }

  // ---------- boucle ----------
  /** inp : entrées du joueur (modifiées si le véhicule doit être immobilisé) ; ex : { kmh, limit } */
  update(dt, inp, ex) {
    if (!this.enabled || !this.player) return; this.time += dt; const p = this.player;
    if (this.door) this.door.update(dt);
    const pulse = 0.75 + 0.25*Math.sin(this.time*3.2), M = this.mats;
    M.ring.opacity = M.ringW.opacity = 0.6 + 0.35*pulse; M.disc.opacity = M.discW.opacity = 0.14 + 0.16*pulse; M.beam.opacity = M.beamW.opacity = 0.07 + 0.07*pulse;
    if (this.ride) {
      this.locked = this.ride.update(dt, inp, ex); const t = this.ride.target;
      if (t) { if (!this.destRing) this.destRing = this._makeRing(t.x, t.z, true); const y = this.world.ground(t.x, t.z, p.y); if (y !== null) this.destRing.position.y = y + 0.08; this.destRing.position.x = t.x; this.destRing.position.z = t.z; } else this._removeDest();
      if (this.ride.finished) { this.ride = null; this.locked = false; this._removeDest(); }
      return;
    }
    this.locked = false;
    this.spawnT -= dt; if (this.spawnT <= 0 && this.pickups.length < MAX_WAITING) { this.spawnT = 3.5; this._spawnPickup(); }
    let near = null, nd = 1e9;
    for (const q of [...this.pickups]) {
      const d = Math.hypot(q.x - p.x, q.z - p.z); if (d > 620) { this._dropPickup(q); this.pickups.splice(this.pickups.indexOf(q), 1); continue; }
      const y = this.world.ground(q.x, q.z, null); if (y !== null) { q.ring.position.y = y + 0.08; for (const it of q.items) it.root.position.y = y; }
      for (const it of q.items) if (it.animate) it.animate(dt, false, true); if (d < nd) { nd = d; near = q; }
      if (d < RING_R && Math.abs(p.speed) < STOP_V && p.onRoad !== false) { this._startRide(q); return; }
    }
    if (near) { let rel = Math.atan2(near.z - p.z, near.x - p.x) - p.yaw; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      this.ui.setGuide(near.mode === 'delivery' ? near.label : near.label + ' · ' + near.client.name, nd > 1000 ? (nd/1000).toFixed(1).replace('.', ',') + ' km' : Math.round(nd/10)*10 + ' m', rel, 'pick');
      if (this.firstHint && nd < 150) { this.firstHint = false; this.toast('Arrête-toi dans le cercle jaune', 'good', 3.5); } } else this.ui.hideGuide();
  }
  _startRide(pk) {
    const ride = this.mode === 'sotrama' ? new SotramaLine(this, pk) : this.mode === 'delivery' ? new Delivery(this, pk) : new TaxiRide(this, pk);
    if (ride.failed) { this.toast(this.mode === 'taxi' ? 'Le client a changé d\'avis' : 'Mission annulée', 'bad', 2); this._dropPickup(pk); this.pickups.splice(this.pickups.indexOf(pk), 1); return; }
    this.pickups.splice(this.pickups.indexOf(pk), 1); this.scene.remove(pk.ring);        // la mission garde le client / les passagers / la charge de ce point
    for (const q of this.pickups) this._dropPickup(q); this.pickups.length = 0; this.ride = ride; this.locked = true; this.ui.hideGuide();
  }

  // ---------- cartes ----------
  /** mini-carte : le contexte est déjà centré sur le joueur, 1 unité = sc mètres */
  drawMini(g, sc) { if (!this.enabled || !this.player) return; const p = this.player, X = x => (x - p.x)/sc, Z = z => (z - p.z)/sc; this._route(g, X, Z, 3.2/1.4); this._dots(g, X, Z, 1); }
  /** grande carte : S(x,z) → [px,py] écran, d = densité de pixels */
  drawBig(g, S, d) { if (!this.enabled) return; const X = x => S(x, 0)[0], Z = z => S(0, z)[1]; this._route(g, X, Z, 5*d); this._dots(g, X, Z, 2.2*d); }
  _route(g, X, Z, w) {
    const r = this.ride; if (!r || !r.showRoute || !r.route) return; const P = r.route.pts, n = r.route.cum.length, i0 = r.routeI || 0;
    g.save(); g.lineCap = g.lineJoin = 'round';
    for (const [col, lw] of [['#ffffff', w + 3.2], ['#0a7cff', w + 0.6]]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); for (let i = i0; i < n; i += 2) { const x = X(P[i*2]), y = Z(P[i*2 + 1]); i === i0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); }
    g.restore();
  }
  _dots(g, X, Z, s) {
    g.save(); const pulse = 1 + 0.18*Math.sin(this.time*4);
    const dot = (x, z, col, big) => { g.fillStyle = col; g.strokeStyle = '#55415D'; g.lineWidth = s*1.4; g.beginPath(); g.arc(X(x), Z(z), (big ? 6 : 5)*s*pulse, 0, 7); g.fill(); g.stroke(); };
    for (const q of this.pickups) dot(q.x, q.z, '#ff4d2e', false);
    if (this.ride) for (const t of this.ride.targets) dot(t.x, t.z, '#22c55e', true);
    g.restore();
  }
}
