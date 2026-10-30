// Natural lighting: sun/moon path, sky, stars, fog, ambient. One clock in hours (0-24) drives everything incl. the night factor used by the shaders.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { shared } from './world.js';

const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a)/(b - a), 0), 1); return t*t*(3 - 2*t); };
// Bamako : latitude 12,65° N, longitude 8,0° O -> midi solaire à ~12 h 32 ; déclinaison du soleil d'après la date
const LAT = 12.65*Math.PI/180, SIN_LAT = Math.sin(LAT), COS_LAT = Math.cos(LAT), SOLAR_NOON = 12.53, KEY_MIN = Math.sin(20*Math.PI/180);
const DECL = (() => { const d = new Date(), doy = Math.floor((d - new Date(d.getFullYear(), 0, 0))/864e5); return -23.44*Math.PI/180*Math.cos(2*Math.PI*(doy + 10)/365); })();
export const PRESETS = { jour: 11.5, soir: 17.6, nuit: 22.0 };

export class Atmosphere {
  constructor(scene, renderer, quality) {
    this.scene = scene; this.renderer = renderer; this.q = quality; this.hours = PRESETS.jour; this.auto = false; this.autoSpeed = 1/60;      // 1 game hour per real minute
    this.sky = new Sky(); this.sky.scale.setScalar(9000); scene.add(this.sky);
    const u = this.sky.material.uniforms; u.turbidity.value = 7; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.82;
    this.sun = new THREE.DirectionalLight(0xffffff, 3); this.sun.castShadow = quality.shadows; scene.add(this.sun); scene.add(this.sun.target);
    this.shadowR = quality.shadowR || 80; this._sr = 0; this.keyDir = new THREE.Vector3(0, 1, 0); if (quality.shadows) { const s = this.sun.shadow; s.mapSize.set(quality.shadowSize, quality.shadowSize); const c = s.camera; c.left = -80; c.right = 80; c.top = 80; c.bottom = -80; c.near = 10; c.far = 500; s.bias = -0.0006; s.normalBias = 0.4; }
    this.moon = new THREE.DirectionalLight(0x7f9bd6, 0.0); scene.add(this.moon); scene.add(this.moon.target);
    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0x6b5a45, 1.0); scene.add(this.hemi);
    this.fog = new THREE.Fog(0xb8c8dc, 120, quality.fogFar); scene.fog = this.fog; scene.background = null;
    // stars
    const n = 1400, p = new Float32Array(n*3), c = new Float32Array(n*3);
    for (let i = 0; i < n; i++) { const a = Math.random()*Math.PI*2, e = Math.asin(Math.random()*0.98 + 0.02), r = 4200; p[i*3] = Math.cos(a)*Math.cos(e)*r; p[i*3 + 1] = Math.sin(e)*r; p[i*3 + 2] = Math.sin(a)*Math.cos(e)*r; const b = 0.5 + Math.random()*0.5; c[i*3] = b; c[i*3 + 1] = b; c[i*3 + 2] = 0.8 + 0.2*b; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(p, 3)); sg.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.starMat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false }); this.stars = new THREE.Points(sg, this.starMat); this.stars.frustumCulled = false; scene.add(this.stars);
    // moon disc
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const cx = cv.getContext('2d'); const gr = cx.createRadialGradient(64, 64, 8, 64, 64, 62); gr.addColorStop(0, 'rgba(255,252,235,1)'); gr.addColorStop(0.55, 'rgba(235,238,255,0.95)'); gr.addColorStop(0.62, 'rgba(180,200,255,0.25)'); gr.addColorStop(1, 'rgba(120,150,255,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
    this.moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, fog: false, opacity: 0 })); this.moonSprite.scale.setScalar(380); scene.add(this.moonSprite);
    this.sunDir = new THREE.Vector3(); this.night = 0; this.tmp = new THREE.Color(); this.update(0, new THREE.Vector3());
  }
  setPreset(name) { this.hours = PRESETS[name]; this.auto = false; }
  label() { const h = Math.floor(this.hours) % 24, m = Math.floor((this.hours % 1)*60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); }
  period() { const e = this.elev; return e > 0.2 ? 'Jour' : e > -0.08 ? (this.hours < 12 ? 'Aube' : 'Soir') : 'Nuit'; }
  /** demi-largeur (m) de la zone ombrée autour du point regardé : petite en conduite, large en exploration */
  setShadowRange(r) { if (!this.sun.castShadow || Math.abs(r - this._sr) < this._sr*0.03) return; this._sr = r; const c = this.sun.shadow.camera; c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 10; c.far = r*4 + 600; c.updateProjectionMatrix(); }
  update(dt, focus) {
    if (this.auto) this.hours = (this.hours + dt*this.autoSpeed) % 24;
    const t = this.hours;
    // vrai soleil de Bamako (12,65° N, 8,0° O ; heure du jeu = heure UTC = heure légale) : se lève à l'est, midi au sud en hiver, se couche à l'ouest ; la déclinaison suit la date du jour
    { const D = DECL, H = (t - SOLAR_NOON)*Math.PI/12, sinEl = SIN_LAT*Math.sin(D) + COS_LAT*Math.cos(D)*Math.cos(H);
      const east = -Math.cos(D)*Math.sin(H), north = Math.sin(D)*COS_LAT - Math.cos(D)*SIN_LAT*Math.cos(H);                       // x = est, z = sud (le nord est -z)
      this.sunDir.set(east, sinEl, -north).normalize(); this.elev = this.sunDir.y; }
    const se = this.elev, day = smooth(-0.04, 0.28, se), night = 1 - smooth(-0.20, 0.07, se); this.night = night; shared.uNight.value = night; this.dusk = 1 - smooth(0.02, 0.34, se); shared.uDusk.value = this.dusk;
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    const low = 1 - smooth(0.05, 0.45, Math.abs(se));                        // 1 near the horizon
    // la lumière « sun » est aussi celle de la lune la nuit : une seule carte d'ombre, jamais de recompilation de shaders
    { const sg = se >= 0 ? 1 : -1, hl = Math.hypot(this.sunDir.x, this.sunDir.z) || 1, sinK = Math.max(Math.abs(se), KEY_MIN), cosK = Math.sqrt(1 - sinK*sinK); this.keyDir.set(sg*this.sunDir.x/hl*cosK, sinK, sg*this.sunDir.z/hl*cosK); }
    if (se >= 0) { this.sun.color.setRGB(1.0, 0.93 - 0.35*low, 0.84 - 0.55*low); this.sun.intensity = 3.4*smooth(0.0, 0.18, se); } else { this.sun.color.setRGB(0.5, 0.61, 0.84); this.sun.intensity = 0.55*night*(1 - smooth(-0.12, 0, se)); }   // la lune prend le relais progressivement (pas de saut d'ombre au coucher du soleil)
    this.setShadowRange(this.shadowR); this.sun.position.copy(focus).addScaledVector(this.keyDir, this._sr*2 + 170); this.sun.target.position.copy(focus);
    this.moon.position.copy(focus).addScaledVector(this.sunDir, -250); this.moon.target.position.copy(focus); this.moon.intensity = 0;
    this.hemi.intensity = 0.28 + 0.8*day; this.hemi.color.setRGB(0.52 + 0.28*day, 0.6 + 0.3*day, 0.85 + 0.15*day); this.hemi.groundColor.setRGB(0.25 + 0.18*day, 0.2 + 0.16*day, 0.16 + 0.13*day);
    // night: slightly lift the shadows so the streets stay readable without killing the mood
    this.hemi.intensity = Math.max(this.hemi.intensity, 0.46*night + 0.28);
    const horizon = this.tmp.setRGB(0.68, 0.77, 0.9).lerp(new THREE.Color(0.95, 0.52, 0.32), low*0.85*smooth(-0.1, 0.1, se + 0.05)).lerp(new THREE.Color(0.025, 0.04, 0.085), night);
    this.fog.color.copy(horizon); this.fog.near = 90 + 120*day; shared.uSky.value.copy(horizon).multiplyScalar(0.9 + 0.5*day);
    this.sky.material.uniforms.rayleigh.value = 0.45 + 1.6*day + 1.4*low*day; this.renderer.toneMappingExposure = 0.62 + 0.42*day + 0.25*night*0.0; this.stars.material.opacity = smooth(0.35, 0.95, night); this.stars.position.copy(focus);
    this.moonSprite.position.copy(focus).addScaledVector(this.sunDir, -3600); this.moonSprite.material.opacity = (this.sunDir.y < 0.02 ? 1 : 0)*smooth(0.35, 0.9, night);
    this.sky.position.copy(focus);
  }
}
