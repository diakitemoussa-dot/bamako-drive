// Procedural audio (no files to download): engine, tyres, horn, crash, soft city ambience. Starts on the first tap/key (browser rule, mandatory on iOS).
export class Sound {
  constructor() { this.ctx = null; this.on = true; }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return; const c = this.ctx = new A(); this.master = c.createGain(); this.master.gain.value = 0.5;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.2; this.master.connect(comp); comp.connect(c.destination);
    // bruits : blanc (frottements, sifflements) et brun (grondement grave de la route)
    const nb = c.createBuffer(1, c.sampleRate*2, c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random()*2 - 1;
    const bb = c.createBuffer(1, c.sampleRate*3, c.sampleRate), e = bb.getChannelData(0); let acc = 0; for (let i = 0; i < e.length; i++) { acc = (acc + 0.02*(Math.random()*2 - 1))/1.02; e[i] = acc*3.5; }
    this.noiseBuf = nb; this.brownBuf = bb; this.noise = { buffer: nb };   // (crash() réutilise ce tampon)
    const src = (buf) => { const n = c.createBufferSource(); n.buffer = buf; n.loop = true; n.start(); return n; };
    const chain = (n, type, f, q, gain) => { const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = gain; n.connect(fl); fl.connect(g); g.connect(this.master); return { fl, g }; };
    // ---- moteur : 4 oscillateurs riches en harmoniques (fondamentale d'allumage + sous-octave + octave) -> légère saturation -> filtre passe-bas -> modulation de rugosité
    const N = 16, re = new Float32Array(N + 1), im = new Float32Array(N + 1); for (let n = 1; n <= N; n++) { im[n] = (1/Math.pow(n, 1.18))*(n === 2 ? 1.35 : n === 3 ? 0.9 : 1)*(n % 2 === 0 ? 1 : 0.85); }
    const wave = c.createPeriodicWave(re, im), mkOsc = (type, w) => { const o = c.createOscillator(); if (w) o.setPeriodicWave(w); else o.type = type; o.start(); return o; };
    this.o1 = mkOsc(null, wave); this.o2 = mkOsc(null, wave); this.oSub = mkOsc('sine'); this.oMech = mkOsc('triangle');
    const g1 = c.createGain(), g2 = c.createGain(), gS = c.createGain(), gM = c.createGain(); g1.gain.value = 0.5; g2.gain.value = 0.34; gS.gain.value = 0.5; gM.gain.value = 0.05; this.gSub = gS;
    const sum = c.createGain(); this.o1.connect(g1); this.o2.connect(g2); this.oSub.connect(gS); this.oMech.connect(gM); g1.connect(sum); g2.connect(sum); gS.connect(sum); gM.connect(sum);
    const sh = c.createWaveShaper(), curve = new Float32Array(257); for (let i = 0; i < 257; i++) { const x = i/128 - 1; curve[i] = Math.tanh(x*1.8)/Math.tanh(1.8); } sh.curve = curve; sh.oversample = '2x';
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 600; this.lp.Q.value = 0.8;
    this.amG = c.createGain(); this.amG.gain.value = 1; this.engG = c.createGain(); this.engG.gain.value = 0;
    sum.connect(sh); sh.connect(this.lp); this.lp.connect(this.amG); this.amG.connect(this.engG); this.engG.connect(this.master);
    this.lfoAm = c.createOscillator(); this.lfoAm.type = 'sine'; this.lfoAm.frequency.value = 20; this.amD = c.createGain(); this.amD.gain.value = 0.05; this.lfoAm.connect(this.amD); this.amD.connect(this.amG.gain); this.lfoAm.start();   // rugosité (chaque cylindre n'est pas identique)
    this.lfoPitch = c.createOscillator(); this.lfoPitch.frequency.value = 6.3; const pd = c.createGain(); pd.gain.value = 7; this.lfoPitch.connect(pd); pd.connect(this.o1.detune); pd.connect(this.o2.detune); this.lfoPitch.start();   // très léger tremblement de régime
    const boom = c.createBiquadFilter(); boom.type = 'bandpass'; boom.frequency.value = 170; boom.Q.value = 2.2; this.boomG = c.createGain(); this.boomG.gain.value = 0.18; sum.connect(boom); boom.connect(this.boomG); this.boomG.connect(this.engG);   // résonance de l'échappement
    this.intake = chain(src(nb), 'bandpass', 700, 0.7, 0);
    // ---- roulement : grondement de la route (brun), sifflement des pneus (blanc), dérapage (aigu), vent
    this.road = chain(src(bb), 'lowpass', 160, 0.6, 0); this.hiss = chain(src(nb), 'bandpass', 1300, 0.55, 0); this.squeal = chain(src(nb), 'bandpass', 2300, 9, 0); this.wind = chain(src(nb), 'highpass', 500, 0.4, 0);
    this.amb = c.createGain(); this.amb.gain.value = 0.0; const af = c.createBiquadFilter(); af.type = 'lowpass'; af.frequency.value = 500; const ns = src(nb); ns.connect(af); af.connect(this.amb); this.amb.connect(this.master);
    this.setVehicle(this.kind || 'sedan');
  }
  /** caractère du moteur selon le véhicule : lo / hi = fréquence d'allumage au ralenti / à plein régime (Hz), lp = brillance, rough = rugosité */
  setVehicle(kind) {
    this.kind = kind; const T = { taxi: [30, 160, 360, 1500, 0.05], sedan: [32, 168, 380, 1600, 0.05], suv: [27, 150, 330, 1300, 0.06], pickup: [24, 138, 300, 1150, 0.10], sotrama: [22, 124, 280, 1000, 0.12], truck: [16, 98, 230, 800, 0.16], moto: [46, 270, 520, 2600, 0.20], tricycle: [34, 150, 400, 1100, 0.24] };
    this.cfg = T[kind] || T.sedan;
  }
  update(speed, rpm, throttle, slip, night) {
    if (!this.ctx || !this.on) return; const c = this.ctx, t = c.currentTime, [lo, hi, lp0, lp1, rough] = this.cfg || [32, 168, 380, 1600, 0.05], r = Math.max(0, Math.min(1.1, rpm)), f = lo + (hi - lo)*r, th = Math.max(0, Math.min(1, throttle));
    this.o1.frequency.setTargetAtTime(f, t, 0.045); this.o2.frequency.setTargetAtTime(f*1.004, t, 0.045); this.oSub.frequency.setTargetAtTime(f*0.5, t, 0.05); this.oMech.frequency.setTargetAtTime(f*3.01, t, 0.05);
    this.lp.frequency.setTargetAtTime(lp0 + r*lp1 + th*650, t, 0.07); this.gSub.gain.setTargetAtTime(0.28 + 0.4*(1 - r) + 0.25*th, t, 0.1);
    this.engG.gain.setTargetAtTime(0.075 + 0.11*th + 0.05*r, t, 0.09); this.lfoAm.frequency.setTargetAtTime(Math.max(7, f*(rough > 0.15 ? 0.5 : 0.25)), t, 0.1); this.amD.gain.setTargetAtTime(rough*(0.7 + 0.5*th), t, 0.1);
    this.intake.fl.frequency.setTargetAtTime(500 + r*900, t, 0.1); this.intake.g.gain.setTargetAtTime(0.045*th*(0.3 + r), t, 0.08);
    const sp = Math.max(0, speed); this.road.fl.frequency.setTargetAtTime(90 + sp*5, t, 0.2); this.road.g.gain.setTargetAtTime(Math.min(0.2, sp*0.0036), t, 0.15);
    this.hiss.fl.frequency.setTargetAtTime(900 + sp*18, t, 0.2); this.hiss.g.gain.setTargetAtTime(Math.min(0.05, sp*0.00085), t, 0.15);
    const sq = Math.max(0, slip - 0.35); this.squeal.fl.frequency.setTargetAtTime(2000 + slip*700, t, 0.1); this.squeal.g.gain.setTargetAtTime(Math.min(0.1, sq*0.2)*Math.min(1, sp/8), t, 0.06);
    this.wind.g.gain.setTargetAtTime(Math.min(0.07, (sp/45)**2*0.07), t, 0.3); this.amb.gain.setTargetAtTime(0.05, t, 0.5);
  }
  /** klaxon : deux tons (comme un vrai klaxon de voiture), attaque et relâchement doux, timbre de membrane ; la hauteur dépend du véhicule */
  horn(on) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    if (on && !this.hn) {
      const H = { taxi: [420, 525, 1], sedan: [405, 505, 1], suv: [365, 458, 1.05], pickup: [345, 432, 1.05], sotrama: [320, 400, 1.1], truck: [196, 247, 1.35], moto: [640, 800, 0.8], tricycle: [780, 0, 0.8] }[this.kind] || [405, 505, 1];
      if (!this.hornWave) { const N = 12, re = new Float32Array(N + 1), im = new Float32Array(N + 1); for (let n = 1; n <= N; n++) im[n] = (n % 2 ? 1 : 0.55)/Math.pow(n, 0.95); this.hornWave = c.createPeriodicWave(re, im); }
      const g = c.createGain(), pk = c.createBiquadFilter(), lp = c.createBiquadFilter(), shp = c.createWaveShaper(), cv = new Float32Array(129); for (let i = 0; i < 129; i++) { const x = i/64 - 1; cv[i] = Math.tanh(x*1.6)/Math.tanh(1.6); } shp.curve = cv;
      pk.type = 'peaking'; pk.frequency.value = 1250; pk.Q.value = 1.1; pk.gain.value = 5; lp.type = 'lowpass'; lp.frequency.value = 3600; lp.Q.value = 0.5;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2*H[2], t + 0.03); g.gain.setTargetAtTime(0.17*H[2], t + 0.04, 0.25);   // attaque rapide puis léger tassement
      const oscs = []; for (const [f, d] of [[H[0], 0], [H[0], 4], [H[1], 0], [H[1], -3]]) { if (!f) continue; const o = c.createOscillator(); o.setPeriodicWave(this.hornWave); o.detune.value = d; o.frequency.setValueAtTime(f*0.955, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05); const og = c.createGain(); og.gain.value = 0.25; o.connect(og); og.connect(shp); o.start(); oscs.push(o); }
      shp.connect(pk); pk.connect(lp); lp.connect(g); g.connect(this.master); this.hn = { oscs, g }; this.hornWaveUsed = true;
    } else if (!on && this.hn) {
      const h = this.hn; this.hn = null; h.g.gain.cancelScheduledValues(t); h.g.gain.setValueAtTime(Math.max(h.g.gain.value, 0.0001), t); h.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);   // relâchement sans claquement
      h.oscs.forEach(o => o.stop(t + 0.12)); setTimeout(() => { try { h.g.disconnect(); } catch (e) {} }, 400);
    }
  }
  crash(v) { if (!this.ctx) return; const c = this.ctx, g = c.createGain(); g.gain.value = Math.min(0.5, 0.1 + v*0.02); g.gain.setTargetAtTime(0, c.currentTime + 0.02, 0.12); const o = c.createBufferSource(); o.buffer = this.noise.buffer; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; o.connect(f); f.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + 0.5); }
  /** sirène de police (deux tons qui montent et descendent) : vol 0..1 ; fast = plus nerveuse quand la voiture est tout près */
  siren(vol, fast = false) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    if (!this.sr) {
      const o1 = c.createOscillator(), o2 = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain(), bp = c.createBiquadFilter(), mix = c.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = o2.frequency.value = 950; o2.detune.value = 1200; lfo.type = 'triangle'; lfo.frequency.value = 0.55; lg.gain.value = 380;
      lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency); mix.gain.value = 1; const g2 = c.createGain(); g2.gain.value = 0.28; o1.connect(mix); o2.connect(g2); g2.connect(mix);
      bp.type = 'bandpass'; bp.frequency.value = 1250; bp.Q.value = 0.7; mix.connect(bp); bp.connect(g); g.gain.value = 0; g.connect(this.master); o1.start(); o2.start(); lfo.start(); this.sr = { g, lfo };
    }
    this.sr.g.gain.setTargetAtTime(this.on ? vol*0.24 : 0, t, 0.12); this.sr.lfo.frequency.setTargetAtTime(fast ? 1.5 : 0.55, t, 0.4);
  }
  beep(freq = 880) { if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.value = freq; g.gain.value = 0.06; g.gain.setTargetAtTime(0, c.currentTime + 0.05, 0.05); o.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + 0.3); }
}
