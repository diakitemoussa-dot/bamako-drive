// Quality profiles. Auto = guess from the device (phone / tablet / laptop), then adapt the render resolution live to hold the frame rate.
export const PROFILES = {
  low:  { name: 'Économe', pixelRatio: 1.0, tileRadius: 480, fogFar: 520, shadows: false, shadowSize: 1024, traffic: 150, peds: 40, maxTrees: 3500, lights: 18, antialias: false, trafficLights: 40, bats: 90 },
  med:  { name: 'Moyenne', pixelRatio: 1.25, tileRadius: 700, fogFar: 760, shadows: false, shadowSize: 1024, traffic: 300, peds: 110, maxTrees: 8000, lights: 40, antialias: false, trafficLights: 70, bats: 180 },
  high: { name: 'Élevée', pixelRatio: 1.75, tileRadius: 1000, fogFar: 1100, shadows: true, shadowSize: 2048, traffic: 480, peds: 220, maxTrees: 16000, lights: 90, antialias: true, trafficLights: 110, bats: 320 },
};
export function detect() {
  const ua = navigator.userAgent || ''; const touch = matchMedia('(pointer:coarse)').matches;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || touch;
  const mem = navigator.deviceMemory || (mobile ? 3 : 8), cores = navigator.hardwareConcurrency || 4;
  if (mobile) return mem >= 6 && cores >= 8 ? 'med' : 'low';
  return mem >= 8 && cores >= 8 ? 'high' : 'med';
}
export class DynRes {
  constructor(renderer, base) { this.r = renderer; this.base = base; this.cur = base; this.acc = 0; this.frames = 0; this.fps = 60; this.low = 0; }
  tick(dt) {
    this.acc += dt; this.frames++; if (this.acc < 1.0) return; this.fps = this.frames/this.acc; this.acc = 0; this.frames = 0;
    if (this.fps < 40 && this.cur > 0.6) { this.cur = Math.max(0.6, this.cur - 0.15); this.r.setPixelRatio(Math.min(devicePixelRatio, this.cur)); this.r.setSize(innerWidth, innerHeight, false); }
    else if (this.fps > 57 && this.cur < this.base) { this.cur = Math.min(this.base, this.cur + 0.1); this.r.setPixelRatio(Math.min(devicePixelRatio, this.cur)); this.r.setSize(innerWidth, innerHeight, false); }
    return this.fps;
  }
}
