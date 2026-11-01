// Ambiance sonore de la ville : brouhaha de circulation (qui grossit avec le trafic autour), moteurs des voitures voisines (une voix par véhicule proche,
// avec effet Doppler et position gauche/droite), klaxons spontanés des autres conducteurs, et sirènes d'ambulance qui passent de temps en temps.
// Tout est synthétisé (pas de fichier audio), via le contexte audio de js/audio.js.
const C_SON = 343, N_VOICES = 5, RANGE = 80;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// [fréquence d'allumage au ralenti, à plein régime, brillance du filtre, vitesse « plein régime » en m/s]
const ENG = { taxi: [30, 150, 900, 22], sedan: [32, 155, 950, 25], suv: [27, 140, 800, 23], pickup: [24, 125, 700, 21], sotrama: [22, 112, 650, 15], truck: [16, 90, 520, 13], moto: [46, 250, 1500, 26], tricycle: [34, 140, 800, 10] };
// klaxons : [ton 1, ton 2, durée d'un coup (s), coups possibles, volume]
const HORN = { taxi: [420, 525, 0.22, [1, 2, 2, 3], 1], sedan: [405, 505, 0.3, [1, 1, 2], 1], suv: [365, 458, 0.35, [1, 2], 1.05], pickup: [345, 432, 0.35, [1, 2], 1.05], sotrama: [320, 400, 0.8, [1, 1, 2], 1.1], truck: [196, 247, 1.1, [1], 1.4], moto: [640, 800, 0.14, [1, 2, 3], 0.8], tricycle: [780, 0, 0.18, [1, 2], 0.8] };

export class CityAmbience {
  constructor(sound) {
    this.s = sound; const c = this.c = sound.ctx; this.out = c.createGain(); this.out.gain.value = 1; this.out.connect(sound.master); this.hushed = false;
    // ---- brouhaha : grondement grave + bruit moyen
    const src = (buf) => { const n = c.createBufferSource(); n.buffer = buf; n.loop = true; n.start(); return n; };
    const mk = (buf, type, f, q) => { const n = src(buf), fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; n.connect(fl); fl.connect(g); g.connect(this.out); return { fl, g }; };
    this.rumble = mk(sound.brownBuf, 'lowpass', 220, 0.6); this.murmur = mk(sound.noiseBuf, 'bandpass', 520, 0.5);
    // ---- voix moteur (une par véhicule proche)
    const N = 14, re = new Float32Array(N + 1), im = new Float32Array(N + 1); for (let n = 1; n <= N; n++) im[n] = 1/Math.pow(n, 1.25)*(n === 2 ? 1.3 : 1); this.engWave = c.createPeriodicWave(re, im);
    this.voices = [];
    for (let i = 0; i < N_VOICES; i++) {
      const o = c.createOscillator(); o.setPeriodicWave(this.engWave); const o2 = c.createOscillator(); o2.type = 'sine'; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
      const g = c.createGain(); g.gain.value = 0; const pan = c.createStereoPanner(), g2 = c.createGain(); g2.gain.value = 0.6;
      o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(pan); pan.connect(this.out); o.start(); o2.start(); this.voices.push({ o, o2, lp, g, pan, ag: null });
    }
    // ---- klaxons spontanés
    this.hornWave = sound.hornWave || (() => { const Nn = 12, r = new Float32Array(Nn + 1), m = new Float32Array(Nn + 1); for (let n = 1; n <= Nn; n++) m[n] = (n % 2 ? 1 : 0.55)/Math.pow(n, 0.95); return c.createPeriodicWave(r, m); })();
    this.nextHorn = 2 + Math.random()*3; this.pickT = 0; this.t = 0; this.near = []; this.n120 = 0; this.avgV = 0;
    // ---- ambulance
    this.amb = null; this.nextAmb = 25 + Math.random()*25;
  }
  hush(on) { this.hushed = on; this.out.gain.setTargetAtTime(on ? 0 : 1, this.c.currentTime, 0.08); }
  /** joueur -> source : d (m), pan -1 (gauche) .. 1 (droite), rv = vitesse radiale (m/s, positive si la source s'éloigne) */
  _rel(P, x, z, vx, vz) {
    const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz) || 1, ux = dx/d, uz = dz/d, rx = -Math.sin(P.yaw), rz = Math.cos(P.yaw);
    return { d, pan: clamp(ux*rx + uz*rz, -1, 1), rv: (vx - (P.vx || 0))*ux + (vz - (P.vz || 0))*uz };
  }
  update(dt, P, agents) {
    if (this.hushed || !this.s.on) return; const c = this.c, t = c.currentTime; this.t += dt;
    // 1) véhicules proches (recalculés 3 fois par seconde)
    this.pickT -= dt;
    if (this.pickT <= 0) {
      this.pickT = 0.33; const list = []; let n120 = 0, sumv = 0;
      for (const a of agents) { if (!a.piece) continue; const dx = a.x - P.x, dz = a.z - P.z, d2 = dx*dx + dz*dz; if (d2 < 120*120) { n120++; sumv += a.v; } if (d2 < RANGE*RANGE) list.push([d2, a]); }
      list.sort((a, b) => a[0] - b[0]); this.near = list.map(x => x[1]); this.n120 = n120; this.avgV = n120 ? sumv/n120 : 0;
      const want = new Set(this.near.slice(0, N_VOICES)); for (const v of this.voices) if (v.ag && !want.has(v.ag)) v.ag = null;
      for (const a of want) if (!this.voices.some(v => v.ag === a)) { const v = this.voices.find(x => !x.ag); if (v) { v.ag = a; v.fresh = true; } }
    }
    // 2) brouhaha : plus de monde = plus fort
    const dens = clamp(this.n120/55, 0, 1), mv = clamp(this.avgV/14, 0, 1);
    this.rumble.g.gain.setTargetAtTime(0.012 + 0.05*dens + 0.01*mv, t, 0.6); this.rumble.fl.frequency.setTargetAtTime(160 + 120*mv, t, 0.8); this.murmur.g.gain.setTargetAtTime(0.004 + 0.018*dens, t, 0.6);
    // 3) moteurs des voisins
    for (const v of this.voices) {
      const a = v.ag; if (!a || !a.piece) { v.g.gain.setTargetAtTime(0, t, 0.08); v.ag = null; continue; }
      const [lo, hi, br, vm] = ENG[a.kind] || ENG.sedan, R = this._rel(P, a.x, a.z, a.v*Math.cos(a.ang), a.v*Math.sin(a.ang));
      if (R.d > RANGE + 10) { v.g.gain.setTargetAtTime(0, t, 0.08); v.ag = null; continue; }
      const rpm = 0.17 + 0.62*clamp(a.v/vm, 0, 1) + 0.06*Math.sin(this.t*3 + (a.id || 0)), dop = C_SON/(C_SON + clamp(R.rv, -45, 45)), f = (lo + (hi - lo)*rpm)*dop, tc = v.fresh ? 0.001 : 0.06;
      v.o.frequency.setTargetAtTime(f, t, tc); v.o2.frequency.setTargetAtTime(f*0.5, t, tc); v.lp.frequency.setTargetAtTime(Math.max(260, br*(0.4 + 0.6*rpm)/(1 + R.d/45)), t, 0.1);
      const vol = 0.17*Math.pow(1/(1 + R.d/9), 1.4)*(0.5 + 0.5*clamp(a.v/6, 0, 1))*(a.kind === 'truck' ? 1.4 : a.kind === 'moto' ? 0.8 : 1);
      v.g.gain.setTargetAtTime(vol, t, v.fresh ? 0.02 : 0.1); v.pan.pan.setTargetAtTime(R.pan, t, 0.1); v.fresh = false;
    }
    // 4) klaxons des autres conducteurs : plus fréquents quand il y a du monde et que ça roule mal
    this.nextHorn -= dt;
    if (this.nextHorn <= 0) {
      const pool = this.near.filter(a => Math.hypot(a.x - P.x, a.z - P.z) > 12), a = pool.length ? pool[(Math.random()*pool.length) | 0] : null;
      if (a) { this._honk(a, P); const jam = clamp(1 - this.avgV/10, 0, 1); this.nextHorn = (2.2 + Math.random()*5.5)*(1.2 - 0.6*dens)*(1 - 0.4*jam); } else this.nextHorn = 3;
    }
    // 5) ambulance
    this._ambulance(dt, P, t);
  }
  _honk(a, P) {
    const c = this.c, t0 = c.currentTime + 0.02, [f1, f2, dur, counts, vol0] = HORN[a.kind] || HORN.sedan, n = counts[(Math.random()*counts.length) | 0];
    const R = this._rel(P, a.x, a.z, a.v*Math.cos(a.ang), a.v*Math.sin(a.ang)), vol = 0.2*vol0*Math.pow(1/(1 + R.d/14), 1.2); if (vol < 0.004) return;
    const pan = c.createStereoPanner(); pan.pan.value = R.pan; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(900, 3600/(1 + R.d/70)); const g = c.createGain(); g.gain.value = 0.0001; pan.connect(lp); lp.connect(g); g.connect(this.out);
    const dop = C_SON/(C_SON + clamp(R.rv, -40, 40)); let t = t0;
    for (let k = 0; k < n; k++) { const len = dur*(0.85 + Math.random()*0.3); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.setValueAtTime(vol*0.85, t + len); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.06); t += len + 0.06 + dur*0.45; }
    const total = t - t0 + 0.1;
    for (const f of [f1, f2]) { if (!f) continue; const o = c.createOscillator(); o.setPeriodicWave(this.hornWave); o.frequency.value = f*dop*(1 + (Math.random() - 0.5)*0.02); const og = c.createGain(); og.gain.value = 0.3; o.connect(og); og.connect(pan); o.start(t0); o.stop(t0 + total); }
    setTimeout(() => { try { g.disconnect(); } catch (e) {} }, (total + 0.5)*1000);
  }
  _ambulance(dt, P, t) {
    if (!this.amb) { this.nextAmb -= dt; if (this.nextAmb <= 0) this._startAmb(P); return; }
    const A = this.amb; A.t += dt;
    if (A.t*A.v > A.span) { A.g.gain.setTargetAtTime(0, t, 0.3); const old = A; setTimeout(() => { try { old.oscs.forEach(o => o.stop()); old.g.disconnect(); } catch (e) {} }, 1500); this.amb = null; this.nextAmb = 40 + Math.random()*70; return; }
    const u = A.u, along = -A.span/2 + A.v*A.t, x = A.cx + u[0]*along - u[1]*A.off, z = A.cz + u[1]*along + u[0]*A.off;
    const R = this._rel(P, x, z, u[0]*A.v, u[1]*A.v), dop = C_SON/(C_SON + clamp(R.rv, -45, 45)), hi = (A.t*1.7) % 1 < 0.5;   // « pin-pon » : deux tons qui alternent
    A.o1.frequency.setTargetAtTime(435*dop, t, 0.03); A.o1b.frequency.setTargetAtTime(870*dop, t, 0.03); A.o2.frequency.setTargetAtTime(580*dop, t, 0.03);
    A.g1.gain.setTargetAtTime(hi ? 1 : 0.0001, t, 0.012); A.g2.gain.setTargetAtTime(hi ? 0.0001 : 1, t, 0.012);
    A.g.gain.setTargetAtTime(0.5*Math.pow(1/(1 + R.d/26), 1.15), t, 0.1); A.pan.pan.setTargetAtTime(R.pan, t, 0.12); A.lp.frequency.setTargetAtTime(Math.max(1200, 5200/(1 + R.d/160)), t, 0.2);
  }
  _startAmb(P) {
    const c = this.c, th = Math.random()*Math.PI*2, u = [Math.cos(th), Math.sin(th)], off = (Math.random() < 0.5 ? -1 : 1)*(12 + Math.random()*35);
    const o1 = c.createOscillator(), o1b = c.createOscillator(), o2 = c.createOscillator(); o1.type = 'sawtooth'; o1b.type = 'square'; o2.type = 'sawtooth'; o1.frequency.value = 435; o1b.frequency.value = 870; o2.frequency.value = 580;
    const g1 = c.createGain(), g2 = c.createGain(), g = c.createGain(), lp = c.createBiquadFilter(), bp = c.createBiquadFilter(), pan = c.createStereoPanner(), gb = c.createGain();
    g1.gain.value = 1; g2.gain.value = 0.0001; g.gain.value = 0; gb.gain.value = 0.35; lp.type = 'lowpass'; lp.frequency.value = 3000; bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.55;
    o1.connect(g1); o1b.connect(gb); gb.connect(g1); o2.connect(g2); g1.connect(bp); g2.connect(bp); bp.connect(lp); lp.connect(g); g.connect(pan); pan.connect(this.out); o1.start(); o1b.start(); o2.start();
    this.amb = { t: 0, v: 26, span: 700, u, off, cx: P.x, cz: P.z, o1, o1b, o2, g1, g2, g, lp, pan, oscs: [o1, o1b, o2] };
  }
}
