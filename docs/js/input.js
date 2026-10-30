// Inputs: keyboard, gamepad, touch (steering drag-zone + pedals + buttons) and optional tilt steering. Output: { steer -1..1 (right = +), throttle, brake, reverse, hand }.

/** Première manette connectée, normalisée au format « standard » (boutons 0-3 faces, 6/7 gâchettes, 9 Start, 12-15 croix, axes 0-3 sticks).
 *  Les manettes génériques (mapping vide : DirectInput, Switch, anciennes manettes…) envoient souvent la croix sur un axe « hat » : on la convertit en boutons 12-15. */
export function readPad() {
  const list = navigator.getGamepads ? [...navigator.getGamepads()] : [], pads = list.filter(g => g && g.connected); if (!pads.length) return null;
  // plusieurs « manettes » peuvent être vues (souris/clavier gamer, volant virtuel…) : on suit celle qui bouge ou dont un bouton est enfoncé
  readPad.axPrev = readPad.axPrev || {}; for (const g of pads) { const pa = readPad.axPrev[g.index], moved = pa && g.axes.some((v, i) => Math.abs(v - (pa[i] ?? v)) > 0.25); readPad.axPrev[g.index] = [...g.axes]; if (moved || g.buttons.some(b => b.pressed)) readPad.last = g.index; }
  const gp = pads.find(g => g.index === readPad.last) || pads[0];
  if (gp.mapping === 'standard') return gp;
  const b = Array.from({ length: 17 }, (_, i) => gp.buttons[i] || { pressed: false, value: 0 }), ax = [...gp.axes], on = i => { b[i] = { pressed: true, value: 1 }; };
  const hat = ax.length > 9 ? ax[9] : null;
  if (hat !== null && hat < 1.1) { const i = Math.round((hat + 1)/0.2857);          // 8 positions : haut, haut-droite, droite, bas-droite, bas, bas-gauche, gauche, haut-gauche
    if ([0, 1, 7].includes(i)) on(12); if ([3, 4, 5].includes(i)) on(13); if ([5, 6, 7].includes(i)) on(14); if ([1, 2, 3].includes(i)) on(15); }
  else if (ax.length >= 8 && !b[12].pressed) { if (ax[7] < -0.5) on(12); if (ax[7] > 0.5) on(13); if (ax[6] < -0.5) on(14); if (ax[6] > 0.5) on(15); }
  return { id: gp.id, mapping: gp.mapping, connected: true, count: pads.length, buttons: b, axes: [ax[0] || 0, ax[1] || 0, ax[2] || 0, (ax.length > 5 ? ax[5] : ax[3]) || 0], raw: gp };
}
export class Input {
  constructor(root) {
    this.look = { x: 0, y: 0, zoom: 0, on: false };   // vue : sticks de la manette
    this.s = { steer: 0, throttle: 0, brake: 0, reverse: 0, hand: false }; this.keys = new Set(); this.edge = { cam: false, horn: false, lights: false, reset: false, pause: false, time: false, map: false };
    this.touch = { steer: 0, gas: 0, brake: 0, hand: false, active: false }; this.tilt = { on: false, v: 0, raw: 0, zero: null, got: false }; this.isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window || new URLSearchParams(location.search).has('touch'); this.ptr = new Map();
    addEventListener('keydown', e => { if (e.repeat) return; this.keys.add(e.code); const m = { KeyC: 'cam', KeyH: 'horn', KeyL: 'lights', KeyR: 'reset', KeyT: 'time', KeyM: 'map' }[e.code]; if (m) this.edge[m] = true; if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); });
    addEventListener('keyup', e => this.keys.delete(e.code)); addEventListener('blur', () => this.keys.clear());
    this._bindTouch(root); this.steerSmooth = 0;
  }
  _bindTouch(root) {
    const $ = id => document.getElementById(id); const zone = $('steerZone'), wheel = $('wheel'), gas = $('btnGas'), brk = $('btnBrake');
    if (!zone) return; const T = this.touch;
    const down = (e) => { this.ptr.set(e.pointerId, { kind: 'steer', x0: e.clientX }); T.active = true; zone.setPointerCapture(e.pointerId); e.preventDefault(); };
    zone.addEventListener('pointerdown', down);
    zone.addEventListener('pointermove', e => { const p = this.ptr.get(e.pointerId); if (!p) return; const dx = (e.clientX - p.x0)/Math.max(70, innerWidth*0.09); T.steer = Math.max(-1, Math.min(1, dx)); wheel.style.transform = `rotate(${T.steer*120}deg)`; e.preventDefault(); });
    const up = (e) => { if (this.ptr.delete(e.pointerId)) { T.steer = 0; wheel.style.transform = 'rotate(0deg)'; } };
    zone.addEventListener('pointerup', up); zone.addEventListener('pointercancel', up); zone.addEventListener('lostpointercapture', up);
    const pedal = (el, key) => { el.addEventListener('pointerdown', e => { T[key] = 1; el.classList.add('on'); el.setPointerCapture(e.pointerId); e.preventDefault(); }); const off = () => { T[key] = 0; el.classList.remove('on'); }; el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off); };
    pedal(gas, 'gas'); pedal(brk, 'brake'); pedal($('btnHand'), 'hand');
    const tap = (id, name) => { const el = $(id); if (el) el.addEventListener('pointerdown', e => { this.edge[name] = true; e.preventDefault(); }); };
    tap('btnCam', 'cam'); tap('btnHorn', 'horn'); tap('btnLights', 'lights'); tap('btnReset', 'reset'); tap('btnTime', 'time');
    document.addEventListener('gesturestart', e => e.preventDefault()); document.addEventListener('contextmenu', e => e.preventDefault());
    root.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  }
  // Phone-as-steering-wheel: hold the phone like a wheel (landscape) and turn it. The straight-ahead position is the one held when you switch it on.
  async enableTilt() {
    try {
      if (typeof DeviceOrientationEvent === 'undefined') return false;
      if (DeviceOrientationEvent.requestPermission) { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') return false; }
      if (!this._tiltBound) {
        this._tiltBound = true;
        addEventListener('deviceorientation', e => {
          const ang = (screen.orientation && screen.orientation.angle != null ? screen.orientation.angle : window.orientation) || 0, a = ((ang % 360) + 360) % 360;
          let v = a === 90 ? -e.beta : a === 270 ? e.beta : a === 180 ? -e.gamma : e.gamma; if (v == null || isNaN(v)) return; this.tilt.raw = v; this.tilt.got = true;
        });
      }
      this.tilt.on = true; this.tilt.got = false; this.tilt.zero = null; this.tilt.v = 0; return true;
    } catch (e) { return false; }
  }
  disableTilt() { this.tilt.on = false; this.tilt.v = 0; }
  calibrateTilt() { this.tilt.zero = null; }
  _tiltSteer(dt) {
    const T = this.tilt; if (!T.on || !T.got) return 0; if (T.zero === null) T.zero = T.raw;
    let d = T.raw - T.zero; d = ((d + 540) % 360) - 180;                       // wrap-around safe
    const FULL = 38, DEAD = 3; d = Math.abs(d) < DEAD ? 0 : d - Math.sign(d)*DEAD; let v = Math.max(-1, Math.min(1, d/(FULL - DEAD)));
    v = Math.sign(v)*Math.pow(Math.abs(v), 1.15); T.v += (v - T.v)*Math.min(1, dt*14); return T.v;
  }
  poll(dt) {
    const k = this.keys, s = this.s; let steer = 0, th = 0, br = 0, rev = 0, hand = false;
    if (k.has('ArrowLeft') || k.has('KeyA') || k.has('KeyQ')) steer -= 1; if (k.has('ArrowRight') || k.has('KeyD')) steer += 1;
    if (k.has('ArrowUp') || k.has('KeyW') || k.has('KeyZ')) th = 1; if (k.has('ArrowDown') || k.has('KeyS')) br = 1; if (k.has('Space')) hand = true;
    const gp = readPad();
    this.look.x = this.look.y = 0; this.look.zoom = 0; this.look.on = false;
    if (gp) { const B = i => !!(gp.buttons[i] && gp.buttons[i].pressed);   // manette standard : 12 haut, 13 bas, 14 gauche, 15 droite
      if (B(14)) steer -= 1; if (B(15)) steer += 1; if (B(12)) th = 1; if (B(13)) br = 1; this.look.zoom = (B(12) ? 1 : 0) - (B(13) ? 1 : 0);
      const dz = v => Math.abs(v) < 0.16 ? 0 : Math.sign(v)*(Math.abs(v) - 0.16)/0.84, lx = dz(gp.axes[0] || 0) + dz(gp.axes[2] || 0), ly = dz(gp.axes[1] || 0) + dz(gp.axes[3] || 0);   // les deux sticks tournent la vue
      this.look.x = Math.max(-1, Math.min(1, lx)); this.look.y = Math.max(-1, Math.min(1, ly)); this.look.on = !!(this.look.x || this.look.y);
      const rt = gp.buttons[7] ? gp.buttons[7].value : 0, lt = gp.buttons[6] ? gp.buttons[6].value : 0; th = Math.max(th, rt); br = Math.max(br, lt); if (gp.buttons[0] && gp.buttons[0].pressed) hand = true;
      if (gp.buttons[3] && gp.buttons[3].pressed && !this._g3) this.edge.cam = true; this._g3 = gp.buttons[3] && gp.buttons[3].pressed; if (gp.buttons[2] && gp.buttons[2].pressed && !this._g2) this.edge.horn = true; this._g2 = gp.buttons[2] && gp.buttons[2].pressed; }
    const T = this.touch; if (T.active) steer += T.steer; th = Math.max(th, T.gas); br = Math.max(br, T.brake); hand = hand || T.hand; if (this.tilt.on) { const tv = this._tiltSteer(dt); steer += tv*1.15; const w = document.getElementById('wheel'); if (w && !T.active) w.style.transform = `rotate(${(tv*120).toFixed(1)}deg)`; }
    // smooth steering so keyboard feels progressive and returns to centre
    const target = Math.max(-1, Math.min(1, steer)), rate = (Math.abs(target) > Math.abs(this.steerSmooth) || Math.sign(target) !== Math.sign(this.steerSmooth) ? 4.2 : 6.0)*dt; this.steerSmooth += Math.max(-rate, Math.min(rate, target - this.steerSmooth)); if (T.active || gp) this.steerSmooth = target;
    s.steer = this.steerSmooth; s.throttle = th; s.brake = br; s.hand = hand; s.reverse = 0; return s;
  }
  takeEdges() { const e = { ...this.edge }; for (const k in this.edge) this.edge[k] = false; return e; }
}
