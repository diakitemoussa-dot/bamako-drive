// Inputs: keyboard, gamepad, touch (steering drag-zone + pedals + buttons) and optional tilt steering. Output: { steer -1..1 (right = +), throttle, brake, reverse, hand }.
export class Input {
  constructor(root) {
    this.s = { steer: 0, throttle: 0, brake: 0, reverse: 0, hand: false }; this.keys = new Set(); this.edge = { cam: false, horn: false, lights: false, reset: false, pause: false, time: false, map: false };
    this.touch = { steer: 0, gas: 0, brake: 0, hand: false, active: false }; this.tilt = { on: false, v: 0 }; this.isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window || new URLSearchParams(location.search).has('touch'); this.ptr = new Map();
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
  async enableTilt() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') return false; }
      addEventListener('deviceorientation', e => { const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0; let v = ang === 90 ? -e.beta : ang === -90 || ang === 270 ? e.beta : e.gamma; if (v == null) return; this.tilt.v = Math.max(-1, Math.min(1, v/32)); });
      this.tilt.on = true; return true;
    } catch (e) { return false; }
  }
  poll(dt) {
    const k = this.keys, s = this.s; let steer = 0, th = 0, br = 0, rev = 0, hand = false;
    if (k.has('ArrowLeft') || k.has('KeyA') || k.has('KeyQ')) steer -= 1; if (k.has('ArrowRight') || k.has('KeyD')) steer += 1;
    if (k.has('ArrowUp') || k.has('KeyW') || k.has('KeyZ')) th = 1; if (k.has('ArrowDown') || k.has('KeyS')) br = 1; if (k.has('Space')) hand = true;
    const gp = (navigator.getGamepads && [...navigator.getGamepads()].find(g => g && g.connected));
    if (gp) { const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.08) steer += ax; const rt = gp.buttons[7] ? gp.buttons[7].value : 0, lt = gp.buttons[6] ? gp.buttons[6].value : 0; th = Math.max(th, rt); br = Math.max(br, lt); if (gp.buttons[0] && gp.buttons[0].pressed) hand = true;
      if (gp.buttons[3] && gp.buttons[3].pressed && !this._g3) this.edge.cam = true; this._g3 = gp.buttons[3] && gp.buttons[3].pressed; if (gp.buttons[2] && gp.buttons[2].pressed && !this._g2) this.edge.horn = true; this._g2 = gp.buttons[2] && gp.buttons[2].pressed; }
    const T = this.touch; if (T.active) steer += T.steer; th = Math.max(th, T.gas); br = Math.max(br, T.brake); hand = hand || T.hand; if (this.tilt.on) steer += this.tilt.v*1.2;
    // smooth steering so keyboard feels progressive and returns to centre
    const target = Math.max(-1, Math.min(1, steer)), rate = (Math.abs(target) > Math.abs(this.steerSmooth) || Math.sign(target) !== Math.sign(this.steerSmooth) ? 4.2 : 6.0)*dt; this.steerSmooth += Math.max(-rate, Math.min(rate, target - this.steerSmooth)); if (T.active || gp) this.steerSmooth = target;
    s.steer = this.steerSmooth; s.throttle = th; s.brake = br; s.hand = hand; s.reverse = 0; return s;
  }
  takeEdges() { const e = { ...this.edge }; for (const k in this.edge) this.edge[k] = false; return e; }
}
