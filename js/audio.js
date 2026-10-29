// Procedural audio (no files to download): engine, tyres, horn, crash, soft city ambience. Starts on the first tap/key (browser rule, mandatory on iOS).
export class Sound {
  constructor() { this.ctx = null; this.on = true; }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return; const c = this.ctx = new A(); this.master = c.createGain(); this.master.gain.value = 0.5; this.master.connect(c.destination);
    this.eng = c.createOscillator(); this.eng.type = 'sawtooth'; this.eng2 = c.createOscillator(); this.eng2.type = 'square'; this.engG = c.createGain(); this.engG.gain.value = 0; this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 600;
    this.eng.connect(this.lp); this.eng2.connect(this.lp); this.lp.connect(this.engG); this.engG.connect(this.master); this.eng.start(); this.eng2.start();
    const nb = c.createBuffer(1, c.sampleRate*2, c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random()*2 - 1;
    this.noise = c.createBufferSource(); this.noise.buffer = nb; this.noise.loop = true; this.nf = c.createBiquadFilter(); this.nf.type = 'bandpass'; this.nf.frequency.value = 1800; this.nf.Q.value = 1.2; this.ng = c.createGain(); this.ng.gain.value = 0;
    this.noise.connect(this.nf); this.nf.connect(this.ng); this.ng.connect(this.master); this.noise.start();
    this.amb = c.createGain(); this.amb.gain.value = 0.0; const af = c.createBiquadFilter(); af.type = 'lowpass'; af.frequency.value = 500; const ns = c.createBufferSource(); ns.buffer = nb; ns.loop = true; ns.connect(af); af.connect(this.amb); this.amb.connect(this.master); ns.start();
  }
  update(speed, rpm, throttle, slip, night) {
    if (!this.ctx || !this.on) return; const t = this.ctx.currentTime, f = 38 + rpm*140;
    this.eng.frequency.setTargetAtTime(f, t, 0.05); this.eng2.frequency.setTargetAtTime(f*0.5, t, 0.05); this.lp.frequency.setTargetAtTime(350 + rpm*1500 + throttle*500, t, 0.08); this.engG.gain.setTargetAtTime(0.06 + 0.1*throttle + 0.05*rpm, t, 0.08);
    this.ng.gain.setTargetAtTime(Math.min(0.12, speed*0.0016) + slip*0.18, t, 0.1); this.nf.frequency.setTargetAtTime(900 + speed*30 + slip*1500, t, 0.1); this.amb.gain.setTargetAtTime(0.05, t, 0.5);
  }
  horn(on) {
    if (!this.ctx) return; if (on && !this.hn) { const c = this.ctx; this.hn = [c.createOscillator(), c.createOscillator()]; this.hg = c.createGain(); this.hg.gain.value = 0.16; this.hn[0].frequency.value = 415; this.hn[1].frequency.value = 520; this.hn.forEach(o => { o.type = 'square'; o.connect(this.hg); o.start(); }); this.hg.connect(this.master); }
    else if (!on && this.hn) { this.hn.forEach(o => o.stop()); this.hn = null; }
  }
  crash(v) { if (!this.ctx) return; const c = this.ctx, g = c.createGain(); g.gain.value = Math.min(0.5, 0.1 + v*0.02); g.gain.setTargetAtTime(0, c.currentTime + 0.02, 0.12); const o = c.createBufferSource(); o.buffer = this.noise.buffer; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; o.connect(f); f.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + 0.5); }
  beep(freq = 880) { if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.value = freq; g.gain.value = 0.06; g.gain.setTargetAtTime(0, c.currentTime + 0.05, 0.05); o.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + 0.3); }
}
