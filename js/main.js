import * as THREE from 'three';
import { World, shared } from './world.js';
import { Atmosphere, PRESETS } from './sky.js';
import { Models, KINDS, NAMES, PHYS } from './vehicles.js';
import { Garage } from './garage.js';
import { startPlayers } from './players.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Graph } from './graph.js';
import { PROFILES, detect, DynRes } from './quality.js';
import { Sound } from './audio.js';
import { Radio } from './radio.js';
import { Bats } from './bats.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = id => document.getElementById(id);
const PLACES = [
  { name: 'Monument de la Paix', x: -843.6, z: 853.8 }, { name: 'Grand Marché', x: 656, z: -586 }, { name: 'Monument de l\'Indépendance', x: -183, z: 212 }, { name: 'Ecobank (Ave de la Nation)', x: -251, z: 337 },
  { name: 'Tour BCEAO', x: 510, z: 705 }, { name: 'Cathédrale', x: 377, z: -520 }, { name: 'Grande Mosquée', x: 1058, z: -880 }, { name: 'Stade Modibo Keïta', x: 1059, z: -2342 }];
const LANDMARKS = [...PLACES, { name: 'Palais de la Culture', x: 1315, z: 1636 }, { name: 'Azalaï Hôtel', x: -523, z: 1091 }, { name: 'Radisson Collection', x: -1263, z: 1077 }, { name: 'Cité Administrative', x: -768, z: 1170 }, { name: 'Hôtel de l\'Amitié', x: 1034, z: 86 }, { name: 'Hôtel Libya', x: 1060, z: 511 }, { name: 'Gare de Bamako', x: 437, z: -1040 }, { name: 'CHU Gabriel Touré', x: 660, z: -1353 }, { name: 'Musée National', x: 378, z: -2172 }, { name: 'Assemblée Nationale', x: 1016, z: -1046 }, { name: 'Mémorial Modibo Keïta', x: -662, z: 911 }];
const sel = { car: 'taxi', ci: 0, place: 0, time: 'reel', traffic: 0.7, quality: 'auto' };
let garage = null;
const state = { running: false, paused: false, cam: 0, lights: null, hornT: 0, score: 100, toast: 0, ready: false, flying: false };

// ---------------- renderer / scene ----------------
let prof = PROFILES[detect()]; const urlQ = new URLSearchParams(location.search).get('q'); if (urlQ && PROFILES[urlQ]) prof = PROFILES[urlQ];
let renderer, scene, camera, world, atmo, models, graph, player, input, sound, dyn, traffic = null, bats = null;
function createRenderer() {
  if (renderer) renderer.dispose();
  renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: prof.antialias, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, prof.pixelRatio)); renderer.setSize(innerWidth, innerHeight, false); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = prof.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}
function setupScene() {
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(64, innerWidth/innerHeight, 0.4, 6000); scene.add(camera);
  world = new World(scene, prof); atmo = new Atmosphere(scene, renderer, prof); dyn = new DynRes(renderer, prof.pixelRatio);
}
addEventListener('resize', () => { if (!renderer) return; renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); checkOrientation(); });
function checkOrientation() { const portrait = innerHeight > innerWidth*1.05 && input && input.isTouch; $('rotate').classList.toggle('hidden', !(portrait && state.running)); }

// ---------------- toasts / score ----------------
function toast(msg, kind = '', t = 2.2) { const el = $('toast'); el.textContent = msg; el.className = 'show ' + kind; state.toast = t; }
function penalty(n, why) { state.score = Math.max(0, state.score - n); $('scoreVal').textContent = Math.round(state.score); toast('⚠ ' + why + '  -' + n, 'bad'); }

// ---------------- night lights: street lamps (pools + glow), player headlights ----------------
let lampPool = null, lampGlow = null, headSpots = [], cones = null;
function glowTexture() { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 2, 64, 64, 62); r.addColorStop(0, 'rgba(255,235,190,1)'); r.addColorStop(0.25, 'rgba(255,210,140,.55)'); r.addColorStop(1, 'rgba(255,190,100,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); }
function setupLights() {
  const tex = glowTexture(); const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI/2);
  lampPool = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ map: tex, color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 }), 2500); lampPool.frustumCulled = false; lampPool.count = 0; scene.add(lampPool);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2500*3), 3));
  lampGlow = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex, size: 11, sizeAttenuation: true, color: 0xffe2b0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 })); lampGlow.frustumCulled = false; scene.add(lampGlow);
  world.onTilesChanged = refreshLamps;
  for (let i = 0; i < 2; i++) { const s = new THREE.SpotLight(0xfff0d0, 0, 95, 0.52, 0.55, 1.2); s.castShadow = false; scene.add(s); scene.add(s.target); headSpots.push(s); }
}
const _l = [];
function refreshLamps() {
  if (!lampPool) return; world.allLamps(_l); const n = Math.min(_l.length/3, 2500), M = new THREE.Matrix4(), pos = lampGlow.geometry.attributes.position.array;
  for (let i = 0; i < n; i++) { const x = _l[i*3], y = _l[i*3 + 1], z = _l[i*3 + 2]; const g = world.ground(x, z, y - 5) ?? (y - 6); M.makeScale(15, 1, 15); M.setPosition(x, g + 0.09, z); lampPool.setMatrixAt(i, M); pos[i*3] = x; pos[i*3 + 1] = y; pos[i*3 + 2] = z; }
  lampPool.count = n; lampPool.instanceMatrix.needsUpdate = true; lampGlow.geometry.attributes.position.needsUpdate = true; lampGlow.geometry.setDrawRange(0, n);
}
// red warning lights (data/beacons.json): glow + a very faint red light, evening and night
let beaconGlow = null, beaconLight = null;
async function setupBeacons() {
  const list = await fetch('data/beacons.json').then(r => r.ok ? r.json() : []).catch(() => []); if (!list.length) return;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), r = g.createRadialGradient(32, 32, 1, 32, 32, 31); r.addColorStop(0, 'rgba(255,90,70,1)'); r.addColorStop(0.3, 'rgba(255,30,20,.6)'); r.addColorStop(1, 'rgba(255,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(list.flatMap(b => [b[0], b[1], b[2]])), 3));
  beaconGlow = new THREE.Points(geo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(cv), size: 16, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 })); beaconGlow.frustumCulled = false; scene.add(beaconGlow);
  const c = list.reduce((a, b) => [a[0] + b[0]/list.length, a[1] + b[1]/list.length, a[2] + b[2]/list.length], [0, 0, 0]);
  beaconLight = new THREE.PointLight(0xff2a18, 0, 70, 2); beaconLight.position.set(c[0], c[1] + 2, c[2]); scene.add(beaconLight);
}
function updateBeacons(now) { if (!beaconGlow) return; const k = atmo.dusk || 0, p = 0.8 + 0.5*Math.sin(now/1000*2.4); beaconGlow.visible = k > 0.01; beaconGlow.material.opacity = Math.min(1, k*p); beaconLight.intensity = 120*k*p; }
function updateNightLights(dt) {
  const k = atmo.night; lampPool.material.opacity = 0.55*k; lampGlow.material.opacity = 0.9*k; lampPool.visible = lampGlow.visible = k > 0.02;
  const on = state.lights === null ? k > 0.35 : state.lights; player.car.front.material.color.setScalar(on ? 1.6 : 0.85);
  const f = [Math.cos(player.yaw), Math.sin(player.yaw)], r = [-f[1], f[0]];
  headSpots.forEach((s, i) => { const side = i ? 0.55 : -0.55; s.intensity = on ? 900*Math.max(k, 0.25)*(prof.shadows ? 1.2 : 1) : 0; s.position.set(player.x + f[0]*player.len*0.45 + r[0]*side, player.y + 0.75, player.z + f[1]*player.len*0.45 + r[1]*side); s.target.position.set(player.x + f[0]*28 + r[0]*side*1.5, player.y - 0.2, player.z + f[1]*28 + r[1]*side*1.5); });
  if (traffic) traffic.setNight(k);
}

// ---------------- camera ----------------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(); let camYaw = 0, shake = 0, fovCur = 64;
function updateCamera(dt) {
  const p = player, speed = p.speed, back = [Math.cos(p.yaw), Math.sin(p.yaw)];
  camYaw += ((Math.hypot(p.vx, p.vz) > 4 && p.vf > 0 ? Math.atan2(p.vz*0.35 + back[1]*0.65*Math.hypot(p.vx, p.vz), p.vx*0.35 + back[0]*0.65*Math.hypot(p.vx, p.vz)) : p.yaw) - camYaw + Math.PI*3) % (Math.PI*2) - Math.PI;
  const cy = p.yaw + 0; const mode = state.cam; let tx, ty, tz, lx, ly, lz;
  const fx = Math.cos(cy), fz = Math.sin(cy), tall = p.kind === 'truck' ? 1.5 : p.kind === 'sotrama' ? 0.8 : 0;
  if (mode === 0) { const d = 7.2 + speed*0.035 + p.len*0.25, h = 2.7 + tall + speed*0.006; tx = p.x - fx*d; tz = p.z - fz*d; ty = p.y + h; lx = p.x + fx*6; lz = p.z + fz*6; ly = p.y + 1.1; }
  else if (mode === 1) { const hx = p.kind === 'moto' ? -0.2 : 0.35, hy = p.kind === 'truck' ? 2.55 : p.kind === 'sotrama' ? 1.9 : p.kind === 'moto' ? 1.5 : p.kind === 'suv' || p.kind === 'pickup' ? 1.55 : 1.22; tx = p.x + fx*hx; tz = p.z + fz*hx; ty = p.y + hy; lx = p.x + fx*30; lz = p.z + fz*30; ly = p.y + hy - 0.1; }
  else { const d = 14 + speed*0.08; tx = p.x - fx*d; tz = p.z - fz*d; ty = p.y + 8 + speed*0.03; lx = p.x + fx*4; lz = p.z + fz*4; ly = p.y + 0.5; }
  const k = mode === 1 ? 1 : 1 - Math.exp(-dt*(mode === 0 ? 5.5 : 4)); camPos.x += (tx - camPos.x)*k; camPos.y += (ty - camPos.y)*k; camPos.z += (tz - camPos.z)*k; camLook.x += (lx - camLook.x)*(mode === 1 ? 1 : k*1.4); camLook.y += (ly - camLook.y)*(mode === 1 ? 1 : k*1.4); camLook.z += (lz - camLook.z)*(mode === 1 ? 1 : k*1.4);
  const g = world.ground(camPos.x, camPos.z, p.y); if (g !== null && camPos.y < g + 0.7) camPos.y = g + 0.7;
  if (shake > 0) { shake -= dt; camera.position.set(camPos.x + (Math.random() - 0.5)*shake*0.6, camPos.y + (Math.random() - 0.5)*shake*0.4, camPos.z + (Math.random() - 0.5)*shake*0.6); } else camera.position.copy(camPos);
  camera.lookAt(camLook); const fov = 62 + Math.min(speed, 55)*0.38 + (mode === 1 ? 6 : 0); fovCur += (fov - fovCur)*Math.min(1, dt*3); if (Math.abs(camera.fov - fovCur) > 0.05) { camera.fov = fovCur; camera.updateProjectionMatrix(); }
  player.car.parts.visible = !(mode === 1 && p.kind !== 'moto' && false);
}

// ---------------- HUD ----------------
let mapCtx = null, hudT = 0, limitT = 0, curLimit = null, whereT = 0;
function updateHud(dt) {
  const kmh = Math.round(player.speed*3.6); $('speedVal').textContent = kmh; $('rpmFill').style.width = Math.round(player.rpm*100) + '%'; $('gear').textContent = player.vf < -0.5 ? 'R' : kmh < 2 ? 'N' : player.gear;
  $('clockTime').textContent = atmo.label(); $('clockPeriod').textContent = atmo.period() + (atmo.auto ? ' · cycle' : '');
  limitT -= dt; if (limitT <= 0) { limitT = 0.3; const n = graph.nearest(player.x, player.z, 9, e => e.rank >= 1 && e.level === (world.hasDeck(player.x, player.z) && player.y > (world.ground(player.x, player.z, -1e3) ?? 0) + 3 ? 1 : 0)); player.onRoad = !!n; curLimit = n ? n.edge.limit : null; $('limit').classList.toggle('hidden', curLimit === null); if (curLimit !== null) $('limitVal').textContent = curLimit; }
  const over = curLimit !== null && kmh > curLimit + 14; $('speedVal').style.color = over ? '#F9D58B' : ''; if (over && player.speed > 3) { state.over = (state.over || 0) + dt; if (state.over > 4) { penalty(2, 'Excès de vitesse'); state.over = 0; } } else state.over = 0;
  whereT -= dt; if (whereT <= 0) { whereT = 1; let b = null, bd = 450*450; for (const l of LANDMARKS) { const d = (l.x - player.x)**2 + (l.z - player.z)**2; if (d < bd) { bd = d; b = l; } } $('where').textContent = b ? 'Près de : ' + b.name : 'Bamako'; }
  if (state.toast > 0) { state.toast -= dt; if (state.toast <= 0) $('toast').className = ''; }
  drawMap();
}
function drawMap() {
  const c = $('minimap'); if (!mapCtx) mapCtx = c.getContext('2d'); const g = mapCtx, W = c.width, [x0, z0, sc] = graph.mapOrg, R = 360/2; g.save(); g.clearRect(0, 0, W, W); g.beginPath(); g.arc(R, R, R, 0, Math.PI*2); g.clip(); g.fillStyle = '#3b2c42'; g.fillRect(0, 0, W, W);
  const zoom = 1.4/ (1 + Math.min(player.speed, 40)*0.01); g.translate(R, R*1.25); g.rotate(-player.yaw - Math.PI/2); g.scale(zoom, zoom); g.drawImage(graph.mapCanvas, -(player.x - x0)/sc, -(player.z - z0)/sc);
  if (traffic) { g.fillStyle = 'rgba(248,243,234,.85)'; for (const p of traffic.nearPositions(260)) g.fillRect((p[0] - player.x)/sc - 1, (p[1] - player.z)/sc - 1, 2.2, 2.2); }
  g.setTransform(1, 0, 0, 1, 0, 0); g.beginPath(); g.moveTo(R, R*1.25 - 13); g.lineTo(R + 9, R*1.25 + 10); g.lineTo(R, R*1.25 + 5); g.lineTo(R - 9, R*1.25 + 10); g.closePath(); g.fillStyle = '#F9D58B'; g.fill(); g.strokeStyle = '#55415D'; g.lineWidth = 3; g.stroke(); g.restore();
}


// ---------------- big map (tap the mini-map) ----------------
const BM = { open: false, cx: 0, cz: 0, z: 0.12, minZ: 0.05, maxZ: 0.9, ptr: new Map(), pinch: 0, wasPaused: false, dirty: true };
function bigMapFit() { const cv = $('bigmapCv'); BM.minZ = Math.min(innerWidth/5000, innerHeight/5700)*0.9; BM.maxZ = 1.0; }
function openMap() { if (!state.running || BM.open) return; BM.open = true; BM.wasPaused = state.paused; state.paused = true; sound.horn(false); $('bigmap').classList.remove('hidden'); bigMapFit(); BM.cx = player.x; BM.cz = player.z; BM.z = Math.max(BM.minZ, Math.min(0.22, BM.maxZ)); sizeBigMap(); BM.dirty = true; }
function closeMap() { if (!BM.open) return; BM.open = false; $('bigmap').classList.add('hidden'); if (!BM.wasPaused) state.paused = false; }
function sizeBigMap() { const cv = $('bigmapCv'), dpr = Math.min(devicePixelRatio || 1, 2); cv.width = Math.round(innerWidth*dpr); cv.height = Math.round(innerHeight*dpr); BM.dpr = dpr; BM.dirty = true; }
function zoomMap(f, px, pz) { const nz = Math.max(BM.minZ, Math.min(BM.maxZ, BM.z*f)); if (px !== undefined) { const wx = BM.cx + (px - innerWidth/2)/BM.z, wz = BM.cz + (pz - innerHeight/2)/BM.z; BM.z = nz; BM.cx = wx - (px - innerWidth/2)/BM.z; BM.cz = wz - (pz - innerHeight/2)/BM.z; } else BM.z = nz; BM.dirty = true; }
function setupBigMap() {
  if (input.isTouch) $('bmHint').textContent = 'Glisse pour déplacer · pince pour zoomer · ✕ pour fermer';
  $('minimap').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); openMap(); });
  $('bmClose').onclick = closeMap; $('bmIn').onclick = () => zoomMap(1.5); $('bmOut').onclick = () => zoomMap(1/1.5); $('bmCenter').onclick = () => { BM.cx = player.x; BM.cz = player.z; BM.dirty = true; };
  const cv = $('bigmapCv');
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); BM.ptr.set(e.pointerId, [e.clientX, e.clientY]); BM.pinch = 0; cv.style.cursor = 'grabbing'; });
  cv.addEventListener('pointermove', e => { const p = BM.ptr.get(e.pointerId); if (!p) return; const pts = [...BM.ptr.values()];
    if (BM.ptr.size === 1) { BM.cx -= (e.clientX - p[0])/BM.z; BM.cz -= (e.clientY - p[1])/BM.z; }
    else if (BM.ptr.size === 2) { const other = [...BM.ptr.entries()].find(([id]) => id !== e.pointerId)[1], d = Math.hypot(e.clientX - other[0], e.clientY - other[1]); if (BM.pinch) zoomMap(d/BM.pinch, (e.clientX + other[0])/2, (e.clientY + other[1])/2); BM.pinch = d; }
    p[0] = e.clientX; p[1] = e.clientY; BM.dirty = true; });
  const up = e => { BM.ptr.delete(e.pointerId); BM.pinch = 0; cv.style.cursor = 'grab'; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); zoomMap(e.deltaY < 0 ? 1.2 : 1/1.2, e.clientX, e.clientY); }, { passive: false });
  addEventListener('keydown', e => { if (EX.on && e.code === 'Escape') { stopExplore(); return; } if (state.running && !e.repeat && e.code === 'KeyN' && radio.on) radio.next(); if (!state.running || e.repeat) return; if (e.code === 'KeyM') { BM.open ? closeMap() : openMap(); } else if (e.code === 'Escape' || e.code === 'KeyP') { if (BM.open) closeMap(); else pause(!state.paused); } });
  addEventListener('resize', () => { if (BM.open) sizeBigMap(); });
}
function drawBigMap() {
  const cv = $('bigmapCv'), g = cv.getContext('2d'), d = BM.dpr || 1, W = cv.width, H = cv.height, z = BM.z*d; g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#3b2c42'; g.fillRect(0, 0, W, H);
  const [x0, z0, sc] = graph.mapOrg; g.imageSmoothingEnabled = true; g.save(); g.translate(W/2 + (x0 - BM.cx)*z, H/2 + (z0 - BM.cz)*z); g.scale(sc*z, sc*z); g.drawImage(graph.mapCanvas, 0, 0); g.restore();
  const S = (x, zz) => [W/2 + (x - BM.cx)*z, H/2 + (zz - BM.cz)*z];
  // landmarks
  g.font = `600 ${Math.round(12*d)}px Lato, sans-serif`; g.textBaseline = 'middle'; const showAll = BM.z > 0.1;
  for (const l of LANDMARKS) { const [sx, sy] = S(l.x, l.z); if (sx < -80 || sy < -20 || sx > W + 80 || sy > H + 20) continue;
    g.fillStyle = '#F9D58B'; g.strokeStyle = '#55415D'; g.lineWidth = 2*d; g.beginPath(); g.arc(sx, sy, 5*d, 0, 7); g.fill(); g.stroke();
    if (showAll || PLACES.includes(l)) { const w = g.measureText(l.name).width; g.fillStyle = 'rgba(85,65,93,.85)'; g.beginPath(); g.roundRect(sx + 9*d, sy - 10*d, w + 12*d, 20*d, 8*d); g.fill(); g.fillStyle = '#F8F3EA'; g.fillText(l.name, sx + 15*d, sy + 1*d); } }
  // other vehicles
  if (traffic && BM.z > 0.12) { g.fillStyle = 'rgba(248,243,234,.8)'; for (const p of traffic.nearPositions(700)) { const [sx, sy] = S(p[0], p[1]); g.fillRect(sx - d, sy - d, 2*d, 2*d); } }
  // me
  const [px, py] = S(player.x, player.z); g.save(); g.translate(px, py); g.rotate(player.yaw + Math.PI/2); g.fillStyle = '#F9D58B'; g.strokeStyle = '#55415D'; g.lineWidth = 3*d; g.beginPath(); g.moveTo(0, -13*d); g.lineTo(9*d, 10*d); g.lineTo(0, 5*d); g.lineTo(-9*d, 10*d); g.closePath(); g.fill(); g.stroke(); g.restore();
  g.fillStyle = 'rgba(85,65,93,.9)'; g.font = `700 ${Math.round(11*d)}px Lato, sans-serif`; g.fillStyle = '#F8F3EA'; g.textAlign = 'left';
  // scale bar
  const m = [50, 100, 200, 500, 1000, 2000].find(v => v*z > 70*d) || 2000, bx = 18*d, by = H - 46*d; g.strokeStyle = '#F8F3EA'; g.lineWidth = 3*d; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + m*z, by); g.moveTo(bx, by - 5*d); g.lineTo(bx, by + 5*d); g.moveTo(bx + m*z, by - 5*d); g.lineTo(bx + m*z, by + 5*d); g.stroke(); g.fillText(m >= 1000 ? (m/1000) + ' km' : m + ' m', bx, by - 12*d);
  BM.dirty = false;
}

// ---------------- game flow ----------------
function startPos() {
  const pl = LANDMARKS[sel.place], tried = new Set(); let best = null;   // prefer a road lane that drives straight toward the landmark, ~45 m before it
  for (let k = 0; k < 16; k++) {
    const n = graph.nearest(pl.x, pl.z, 260, e => !tried.has(e.id) && e.rank >= 2 && e.level === 0 && e.len > 40 && e.nl >= 1 && !e.bridge); if (!n) break; tried.add(n.edge.id); const e = n.edge;
    for (let i = 3; i < e.n - 3; i++) { const x = graph.px(e, i), z = graph.pz(e, i), dx = pl.x - x, dz = pl.z - z, d = Math.hypot(dx, dz); if (d < 25 || d > 110) continue; const yaw = graph.heading(e, i), dot = (Math.cos(yaw)*dx + Math.sin(yaw)*dz)/d; if (dot < 0.8) continue; const s = Math.abs(d - 45) + (1 - dot)*40; if (!best || s < best.s) best = { x, z, yaw, s }; }
  }
  if (best) return best;
  let n = graph.nearest(pl.x, pl.z, 160, e => e.rank >= 2 && e.level === 0 && e.len > 40 && e.nl >= 1) || graph.nearest(pl.x, pl.z, 400, e => e.level === 0 && e.len > 30);
  const e = n.edge, i = Math.min(Math.max(n.i, 3), e.n - 4); const x = graph.px(e, i), z = graph.pz(e, i), yaw = graph.heading(e, i); return { x, z, yaw };
}
async function begin() {
  const sp = startPos(); world.update(sp.x, sp.z, true);
  await new Promise(res => { const t0 = performance.now(); const chk = () => { const loaded = world.tiles.size, want = Math.min(4, world.index.size); if ((world.tileAt(sp.x, sp.z) && world.loading.size === 0) || performance.now() - t0 > 12000) res(); else setTimeout(chk, 80); }; chk(); });
  if (player) { scene.remove(player.car.root); }
  const cols = models.kinds[sel.car].colors, color = cols[sel.ci % cols.length]; const g = world.ground(sp.x, sp.z, null) ?? 20; player = new Player(models, world, sel.car, color, { x: sp.x, y: g, z: sp.z }, sp.yaw); scene.add(player.car.root); player.onCrash = (v) => { shake = Math.min(0.6, v*0.04); sound.crash(v); penalty(Math.min(8, Math.round(v*0.6)), 'Collision'); };
  player.car.setPose(sp.x, g, sp.z, sp.yaw, 0, 0); camPos.set(sp.x - Math.cos(sp.yaw)*8, g + 4, sp.z - Math.sin(sp.yaw)*8); camLook.set(sp.x, g + 1, sp.z); camYaw = sp.yaw;
  if (sel.time === 'auto') { atmo.hours = 9.5; atmo.auto = true; } else if (sel.time === 'reel') { atmo.hours = bamakoHours(); atmo.auto = false; } else { atmo.setPreset(sel.time); }
  atmo.update(0, new THREE.Vector3(sp.x, g, sp.z)); state.lights = null; state.score = 100; $('scoreVal').textContent = 100;
  if (traffic) traffic.start(sp, sel.traffic, player);
  $('menu').classList.add('hidden'); $('backGame').classList.add('hidden'); $('hud').classList.remove('hidden'); if (input.isTouch) $('touch').classList.remove('hidden'); state.running = true; state.paused = false; checkOrientation(); input.calibrateTilt(); sound.start(); toast('Bonne route !', 'good', 2.5);
}
async function setTilt(on) {
  if (on) { const ok = await input.enableTilt(); if (!ok) { $('tilt').checked = false; $('btnTilt').classList.remove('on'); toast('Capteur d\'inclinaison indisponible sur cet appareil', 'bad', 3); return; } toast('📱 Volant activé : tiens le téléphone droit, puis tourne-le', 'good', 3); }
  else { input.disableTilt(); const w = $('wheel'); if (w) w.style.transform = 'rotate(0deg)'; toast('Volant à l\'écran', '', 1.6); }
  $('tilt').checked = on; $('btnTilt').classList.toggle('on', on); try { localStorage.setItem('tilt', on ? '1' : '0'); } catch (e) {}
}
function goFullscreen() {   // phones: fill the screen and lock landscape (when the browser allows it)
  if (!input.isTouch) return; const el = document.documentElement; try { const f = el.requestFullscreen || el.webkitRequestFullscreen; if (f) { const p = f.call(el); if (p && p.catch) p.catch(() => {}); } } catch (e) {}
  try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) {}
}
function pause(on) { if (!state.running) return; if (BM.open) closeMap(); state.paused = on; $('pause').classList.toggle('hidden', !on); if (on) { sound.horn(false); input.keys.clear(); const T = input.touch; T.gas = T.brake = 0; T.hand = false; T.steer = 0; T.active = false; input.ptr.clear(); } }
function toMenu() { pause(false); state.running = false; $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); $('menu').classList.remove('hidden'); showView('home'); if (player) $('backGame').classList.remove('hidden'); sound.horn(false); }
function backToGame() { if (!player) return; showView('home'); $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); if (input.isTouch) $('touch').classList.remove('hidden'); state.running = true; state.paused = false; checkOrientation(); }

// ---------------- parcours : accueil → garage → moment → départ ----------------
const BLURB = { taxi: 'Le jaune de Bamako, partout, tout le temps.', sedan: 'Confortable et stable sur les grands boulevards.', suv: 'Haut sur roues, il passe partout.', pickup: 'Une grande benne pour tout transporter.', sotrama: 'Le minibus vert, toujours plein de monde.', truck: 'Lent, lourd, impressionnant.', moto: 'Agile, parfaite pour se faufiler dans la ville.', tricycle: 'Le petit utilitaire des quartiers.' };
const bamakoHours = () => { const d = new Date(); return d.getUTCHours() + d.getUTCMinutes()/60; };           // Bamako = UTC+0, toute l'année
const modeOfHours = h => h >= 6.2 && h < 17 ? 'jour' : (h >= 17 && h < 19.3) || (h >= 5.3 && h < 6.2) ? 'soir' : 'nuit';
const hhmm = h => String(Math.floor(h) % 24).padStart(2, '0') + ':' + String(Math.floor((h % 1)*60)).padStart(2, '0');
function showView(v) {
  $('menu').dataset.view = v; if (garage) { if (v === 'garage') { garage.start(); garageFill(); } else garage.stop(); } if (v === 'moment') momentFill(); if (v === 'depart') recapFill();
}
function garageFill() {
  const k = sel.car, i = KINDS.indexOf(k), P = PHYS[k], cols = models.kinds[k].colors; garage.show(k, sel.ci);
  $('gCount').textContent = (i + 1) + ' / ' + KINDS.length; $('gName').textContent = NAMES[k]; $('gBlurb').textContent = BLURB[k];
  const pc = (v, lo, hi) => Math.round(100*Math.max(0.08, Math.min(1, (v - lo)/(hi - lo))));
  const st = [['Vitesse', pc(P.vmax, 15, 52)], ['Maniabilité', Math.round((pc(P.steer, 0.45, 0.62) + pc(P.a0, 1.5, 8))/2)], ['Gabarit', pc(Math.log(P.mass), Math.log(150), Math.log(7500))]];
  $('gStats').innerHTML = st.map(([n, v]) => '<div><span>' + n + '</span><div class="bar"><i style="width:' + v + '%"></i></div></div>').join('');
  $('gDots').innerHTML = KINDS.map((_, j) => '<i class="' + (j === i ? 'on' : '') + '"></i>').join('');
  const sw = $('gSwatch'); sw.innerHTML = ''; cols.forEach((c, j) => { const b = document.createElement('button'); b.style.background = 'rgb(' + c.map(x => Math.round(Math.pow(x, 1/2.2)*255)).join(',') + ')'; b.setAttribute('aria-label', 'Couleur ' + (j + 1)); if (j === sel.ci % cols.length) b.classList.add('on'); b.onclick = () => { sel.ci = j; garageFill(); }; sw.appendChild(b); }); sw.style.display = cols.length > 1 ? 'flex' : 'none';
}
function garageStep(d) { const i = (KINDS.indexOf(sel.car) + d + KINDS.length) % KINDS.length; sel.car = KINDS[i]; sel.ci = 0; garageFill(); }
const MOMENTS = [
  { t: 'reel', name: 'Comme à Bamako maintenant', sub: () => 'Il est ' + hhmm(bamakoHours()) + ' à Bamako : ' + { jour: 'plein jour', soir: 'le soir tombe', nuit: 'il fait nuit' }[modeOfHours(bamakoHours())] + '. La ville est comme dehors.', tag: true },
  { t: 'jour', name: 'Jour', sub: () => 'Plein soleil, ombres nettes, circulation dense.' },
  { t: 'soir', name: 'Soir', sub: () => 'Coucher de soleil, lampadaires qui s’allument, chauves-souris.' },
  { t: 'nuit', name: 'Nuit', sub: () => 'Phares, vitrines éclairées, balises rouges, étoiles.' },
  { t: 'auto', name: 'Cycle automatique', sub: () => 'Le temps passe : tu vois le jour se coucher puis la nuit.' }];
const SKY = {
  jour: { sil: '#323536', top: '#86ADD4', bot: '#F4E0BD', b1: '#C9A68C', b2: '#A98269', gr: '#BE8A62', sx: 540, sy: 130, sun: 1, moon: 0, star: 0, win: 0, bat: 0, tail: 0, p: 'Jour', k: ['Ombres nettes', 'Trafic maximal'] },
  soir: { sil: '#323536', top: '#55415D', bot: '#EE9A5A', b1: '#7A5C6C', b2: '#6A4F63', gr: '#8C5E4E', sx: 420, sy: 330, sun: .95, moon: 0, star: .25, win: .55, bat: 1, tail: .9, p: 'Soir', k: ['Lampadaires allumés', 'Chauves-souris'] },
  nuit: { sil: '#323536', top: '#14102A', bot: '#3B2C5A', b1: '#2E2640', b2: '#262036', gr: '#2D2530', sx: 540, sy: 130, sun: 0, moon: 1, star: 1, win: 1, bat: 1, tail: 1, p: 'Nuit', k: ['Phares et vitrines', 'Balises rouges'] } };
function momentFill() {
  const box = $('mOpts'); box.innerHTML = '';
  MOMENTS.forEach(m => { const b = document.createElement('button'); b.className = 'opt' + (sel.time === m.t ? ' on' : ''); b.innerHTML = '<b>' + m.name + (m.tag ? '<em>Conseillé</em>' : '') + '</b><span>' + m.sub() + '</span>'; b.onclick = () => { sel.time = m.t; momentFill(); }; box.appendChild(b); });
  const mode = sel.time === 'reel' ? modeOfHours(bamakoHours()) : sel.time === 'auto' ? 'soir' : sel.time, P = SKY[mode];
  const clock = sel.time === 'reel' ? hhmm(bamakoHours()) : sel.time === 'auto' ? '17:10' : { jour: '12:00', soir: '18:30', nuit: '22:00' }[mode];
  const c = models.kinds[sel.car].colors[sel.ci % models.kinds[sel.car].colors.length], rgb = 'rgb(' + c.map(x => Math.round(Math.pow(x, 1/2.2)*255)).join(',') + ')';
  const win = [[46, 320], [70, 350], [146, 300], [170, 340], [540, 320], [570, 360], [636, 350], [232, 360], [440, 330]].map(([x, y]) => '<rect x="' + x + '" y="' + y + '" width="10" height="12"/>').join('');
  $('mPrev').innerHTML = '<svg viewBox="0 0 700 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="skg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + P.top + '"/><stop offset=".72" stop-color="' + P.bot + '"/></linearGradient><radialGradient id="gl"><stop offset="0" stop-color="#FFE6A8" stop-opacity=".95"/><stop offset="1" stop-color="#FFE6A8" stop-opacity="0"/></radialGradient></defs>'
    + '<rect width="700" height="600" fill="url(#skg)"/><g fill="#fff" opacity="' + P.star + '"><circle cx="90" cy="70" r="2"/><circle cx="210" cy="130" r="1.6"/><circle cx="330" cy="50" r="2"/><circle cx="470" cy="110" r="1.6"/><circle cx="600" cy="60" r="2.2"/><circle cx="150" cy="190" r="1.5"/></g>'
    + '<circle cx="' + P.sx + '" cy="' + P.sy + '" r="120" fill="url(#gl)" opacity="' + P.sun + '"/><circle cx="' + P.sx + '" cy="' + P.sy + '" r="42" fill="#FFF3CF" opacity="' + P.sun + '"/><circle cx="560" cy="120" r="34" fill="#F4EEDD" opacity="' + P.moon + '"/><circle cx="574" cy="112" r="30" fill="' + P.top + '" opacity="' + P.moon + '"/>'
    + '<defs><mask id="skm" maskUnits="userSpaceOnUse" x="0" y="265" width="700" height="206"><image href="icons/skyline.png" x="0" y="265.5" width="700" height="204.5" preserveAspectRatio="none"/></mask></defs>'
    + '<rect x="0" y="265" width="700" height="206" fill="' + P.sil + '" mask="url(#skm)"/>'
    + '<rect y="470" width="700" height="130" fill="' + P.gr + '"/><polygon points="270,470 430,470 640,600 60,600" fill="#3F3A48"/><polygon points="346,478 354,478 372,600 328,600" fill="#F8F3EA" opacity=".8"/>'
    + '<g opacity="' + P.win + '"><circle cx="234" cy="431" r="34" fill="url(#gl)" opacity=".9"/><circle cx="459" cy="431" r="34" fill="url(#gl)" opacity=".9"/><circle cx="651" cy="431" r="34" fill="url(#gl)" opacity=".9"/></g>'
    + '<g opacity="' + P.bat + '" fill="#2B2233"><path d="M120 120 q10 -12 20 0 q10 -12 20 0 q-10 4 -20 10 q-10 -6 -20 -10z"/><path d="M420 80 q8 -10 16 0 q8 -10 16 0 q-8 3 -16 8 q-8 -5 -16 -8z"/><path d="M270 170 q8 -10 16 0 q8 -10 16 0 q-8 3 -16 8 q-8 -5 -16 -8z"/></g>'
    + '<g transform="translate(250 506)"><rect width="200" height="80" rx="22" fill="' + rgb + '" stroke="#2B2030" stroke-width="3"/><rect x="26" y="12" width="140" height="30" rx="10" fill="#4C5E73"/><rect x="10" y="52" width="26" height="12" rx="4" fill="#C23B35" opacity="' + P.tail + '"/><rect x="164" y="52" width="26" height="12" rx="4" fill="#C23B35" opacity="' + P.tail + '"/></g></svg>'
    + '<div class="mClock"><b>' + clock + '</b><small>' + (sel.time === 'auto' ? 'Le temps s’écoule' : P.p) + '</small></div><div class="mPerks"><span>' + P.k[0] + '</span><span>' + P.k[1] + '</span></div>';
}
function recapFill() {
  const m = MOMENTS.find(x => x.t === sel.time); $('recap').innerHTML = '<b>' + NAMES[sel.car] + '</b><b>' + (sel.time === 'reel' ? 'Bamako maintenant' : m.name) + '</b><button data-go="garage">Modifier</button>';
}
function setupFlow() {
  garage = new Garage($('garageCv'), models);
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => showView(b.dataset.go)); $('recap').onclick = e => { const b = e.target.closest('button'); if (b) showView(b.dataset.go); };
  $('gPrev').onclick = () => garageStep(-1); $('gNext').onclick = () => garageStep(1); $('gOk').onclick = () => showView('moment'); $('mOk').onclick = () => showView('depart');
  window.addEventListener('keydown', e => {
    if ($('menu').classList.contains('hidden')) return; const v = $('menu').dataset.view;
    if (v === 'garage') { if (e.code === 'ArrowLeft') garageStep(-1); else if (e.code === 'ArrowRight') garageStep(1); else if (e.code === 'Enter') showView('moment'); else if (e.code === 'Escape') showView('home'); }
    else if (v === 'moment') { if (e.code === 'Enter') showView('depart'); else if (e.code === 'Escape') showView('garage'); }
    else if (v === 'depart') { if (e.code === 'Escape') showView('moment'); }
  });
}
function buildMenu() {
  setupFlow();
  const pl = $('placeList'); PLACES.forEach((p, i) => { const b = document.createElement('button'); b.textContent = p.name; if (i === sel.place) b.classList.add('on'); b.onclick = () => { sel.place = i; [...pl.children].forEach(c => c.classList.toggle('on', c === b)); }; pl.appendChild(b); });
  const chips = (id, key, attr, conv = v => v) => { const box = $(id); box.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; sel[key] = conv(b.dataset[attr]); [...box.children].forEach(c => c.classList.toggle('on', c === b)); }; };
  chips('trafficList', 'traffic', 'v', parseFloat); chips('qualList', 'quality', 'q');
  $('play').onclick = () => { goFullscreen(); showView('garage'); };
  $('go').onclick = async () => { goFullscreen(); $('go').disabled = true; $('go').textContent = 'Chargement…'; if (sel.quality !== 'auto' && PROFILES[sel.quality] !== prof) await applyQuality(PROFILES[sel.quality]); await begin(); $('go').textContent = "▶ C'EST PARTI"; $('go').disabled = false; };
  $('resume').onclick = () => { pause(false); input.calibrateTilt(); }; $('toMenu').onclick = toMenu; $('backGame').onclick = backToGame; $('hudPause').onclick = () => pause(!state.paused); $('hudMenu').onclick = () => { pause(true); };
  setupRadio(); $('exploreBtn').onclick = startExplore; setupExplore();
  $('fsBtn').onclick = () => { const el = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); };
  if (input.isTouch) { $('helpPC').classList.add('hidden'); $('helpTouch').classList.remove('hidden'); if (typeof DeviceOrientationEvent !== 'undefined') $('tiltRow').classList.remove('hidden'); $('tilt').onchange = e => setTilt(e.target.checked); $('btnTilt').addEventListener('pointerdown', e => { e.preventDefault(); setTilt(!input.tilt.on); }); } else $('btnTilt').classList.add('hidden');
}
async function applyQuality(p) { prof = p; createRenderer(); const keep = { hours: atmo.hours, auto: atmo.auto }; while (scene.children.length) scene.remove(scene.children[0]); setupScene(); atmo.hours = keep.hours; atmo.auto = keep.auto; setupLights(); await world.init(); if (beaconGlow) { scene.add(beaconGlow); scene.add(beaconLight); } if (traffic) traffic.rebind(scene, world, prof); if (bats) { bats.max = prof.bats || 150; bats.rebind(scene, world); } if (player) scene.add(player.car.root); scene.add(camera); }

let last = performance.now(), fpsT = 0;
function frame(now) {
  requestAnimationFrame(frame); let dt = Math.min((now - last)/1000, 0.06); last = now; if (!world) return; if (garage && garage.on) garage.frame(dt);
  shared.uTime.value = now/1000;
  if (state.running && !state.paused) {
    const e = input.takeEdges(); if (e.pause) pause(true); if (e.cam) state.cam = (state.cam + 1) % 3; if (e.lights) { state.lights = state.lights === null ? !(atmo.night > 0.35) : !state.lights; toast(state.lights ? 'Phares allumés' : 'Phares éteints', '', 1.2); } if (e.reset) { const sp = startPosNear(); player.reset(sp.x, sp.z, sp.yaw); toast('Remis sur la route', '', 1.4); } if (e.time) { const order = ['jour', 'soir', 'nuit']; const cur = atmo.elev > 0.2 ? 0 : atmo.elev > -0.08 ? 1 : 2; atmo.setPreset(order[(cur + 1) % 3]); toast('Moment : ' + order[(cur + 1) % 3], '', 1.4); }
    const inp = input.poll(dt); player.world.night = atmo.night; player.update(dt, inp, traffic); world.update(player.x, player.z); player.hornT = inp.horn ? 1 : 0;
    const horn = e.horn || input.keys.has('KeyH'); sound.horn(horn); if (horn) state.honk = 1;
    atmo.update(dt, camera.position.lengthSq() ? camera.position : player.car.root.position); updateNightLights(dt); updateCamera(dt); if (traffic) traffic.update(dt, atmo.night, camera); updateHud(dt);
    sound.update(player.speed, player.rpm, inp.throttle, player.drift, atmo.night); if (atmo.sun.castShadow) { const s = atmo.sun; s.position.copy(player.car.root.position).addScaledVector(atmo.sunDir, 220); s.target.position.copy(player.car.root.position); }
  } else if (EX.on) { exploreFrame(dt);
  } else if (!state.running && world) { // menu: slow orbit above the city
    const t = now/1000*0.05, cx = PLACES[sel.place].x, cz = PLACES[sel.place].z; camera.position.set(cx + Math.cos(t)*160, 90, cz + Math.sin(t)*160); camera.lookAt(cx, 10, cz); world.update(cx, cz); atmo.update(dt, camera.position); atmo.sun.castShadow = false;
  }
  if (atmo) updateBeacons(now);
  if (bats && atmo) { const f = state.running && player ? player.car.root.position : EX.on ? _bf.set(EX.tx, EX.ty, EX.tz) : _bf.set(PLACES[sel.place].x, 20, PLACES[sel.place].z); bats.update(dt, f, atmo.elev, camera.position); }
  if (BM.open && (BM.dirty || (now|0) % 3 === 0)) drawBigMap();
  renderer.render(scene, camera);
  fpsT += dt; const f = dyn.tick(dt); if (f && new URLSearchParams(location.search).has('fps')) { $('fps').classList.remove('hidden'); $('fps').textContent = Math.round(f) + ' fps · x' + dyn.cur.toFixed(2) + ' · tiles ' + world.tiles.size + (traffic ? ' · ai ' + traffic.count : ''); }
}
function startPosNear() { const n = graph.nearest(player.x, player.z, 80, e => e.level === 0 && e.rank >= 1 && !e.bridge) || graph.nearest(player.x, player.z, 400, e => e.level === 0 && !e.bridge); const e = n.edge, i = Math.min(Math.max(n.i, 2), e.n - 3); return { x: graph.px(e, i), z: graph.pz(e, i), yaw: graph.heading(e, i) }; }


// ---------------- radio ----------------
const radio = new Radio();
async function setupRadio() {
  const list = $('radioList'), now = $('radioNow'); const render = () => { [...list.children].forEach(b => b.classList.toggle('on', radio.on && radio.station === b.dataset.id)); const t = radio.track; now.textContent = radio.status || (t ? '♪ ' + t.title + ' — ' + t.artist : 'Radio éteinte'); $('hudRadio').textContent = radio.on ? '📻 ♪' : '📻 Radio'; };
  radio.onChange = render; for (const st of await radio.stations()) { const b = document.createElement('button'); b.textContent = st.name; b.dataset.id = st.id; b.onclick = () => { if (sound.start) sound.start(); radio.play(st.id); }; list.appendChild(b); }
  $('hudRadio').onclick = () => $('radio').classList.toggle('hidden'); $('radioClose').onclick = () => $('radio').classList.add('hidden'); $('radioNext').onclick = () => radio.next(); $('radioOff').onclick = () => radio.stop(); $('radioVolIn').oninput = e => radio.setVolume(+e.target.value); render();
}
// ---------------- 3D exploration: bird's-eye view of the city with signboards on the landmarks ----------------
const EX = { on: false, tx: -200, tz: 200, ty: 20, dist: 1500, yaw: -0.5, pitch: 0.95, sel: -1, ptr: new Map(), pinch: null, labels: [], saved: null, labT: 0, fly: null, timeIdx: 0 };
const MAJOR = 8, EX_TIMES = [['jour', '☀ Jour'], ['soir', '🌇 Soir'], ['nuit', '🌙 Nuit']];
function setupExplore() {
  const box = $('exLabels'); LANDMARKS.forEach((l, i) => { const d = document.createElement('div'); d.className = 'exLabel' + (i < MAJOR ? ' major' : ''); d.textContent = l.name; d.style.display = 'none'; d.onclick = e => { e.stopPropagation(); exSelect(i); }; d.onpointerdown = e => e.stopPropagation(); box.appendChild(d); EX.labels.push({ el: d, y: 30, vis: false }); });
  const pad = $('exPad'); pad.addEventListener('contextmenu', e => e.preventDefault());
  let down = null; pad.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; EX.fly = null; });
  pad.addEventListener('click', e => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return; EX.sel = -1; $('exCard').classList.add('hidden'); EX.labels.forEach(l => l.el.classList.remove('on')); });
  $('exQuit').onclick = () => stopExplore(); $('exIn').onclick = () => exZoom(0.7); $('exOut').onclick = () => exZoom(1/0.7); $('exL').onclick = () => exOrbit(-0.45, 0); $('exR').onclick = () => exOrbit(0.45, 0);
  $('exUp').onclick = () => exOrbit(0, 0.2); $('exDown').onclick = () => exOrbit(0, -0.2);
  $('exTime').onclick = () => { EX.timeIdx = (EX.timeIdx + 1) % 3; atmo.setPreset(EX_TIMES[EX.timeIdx][0]); $('exTime').textContent = EX_TIMES[EX.timeIdx][1]; };
  $('exDrive').onclick = () => { if (EX.sel < 0) return; sel.place = EX.sel; document.querySelectorAll('#placeList button').forEach((b, i) => b.classList.toggle('on', i === sel.place)); stopExplore(true); $('go').click(); };
}
const _off = new THREE.Vector3(), _sph = new THREE.Spherical();
function exZoom(f) { if (!EX.ctl) return; _off.copy(camera.position).sub(EX.ctl.target); const d = Math.max(EX.ctl.minDistance, Math.min(EX.ctl.maxDistance, _off.length()*f)); camera.position.copy(EX.ctl.target).addScaledVector(_off.normalize(), d); }
function exOrbit(dTheta, dPhi) { if (!EX.ctl) return; _off.copy(camera.position).sub(EX.ctl.target); _sph.setFromVector3(_off); _sph.theta += dTheta; _sph.phi = Math.max(EX.ctl.minPolarAngle, Math.min(EX.ctl.maxPolarAngle, _sph.phi - dPhi)); camera.position.copy(EX.ctl.target).add(_off.setFromSpherical(_sph)); }
function exSelect(i) { EX.sel = i; const l = LANDMARKS[i]; EX.labels.forEach((o, k) => o.el.classList.toggle('on', k === i)); $('exName').textContent = l.name; $('exCard').classList.remove('hidden'); EX.fly = { x: l.x, z: l.z, d: Math.min(camera.position.distanceTo(EX.ctl.target), 420) }; }
function startExplore() {
  if (!state.ready || EX.on) return; EX.on = true; state.running = false;
  EX.saved = { r: prof.tileRadius, far: atmo.fog.far, hours: atmo.hours, auto: atmo.auto }; prof.tileRadius = prof === PROFILES.low ? 1000 : 1500; atmo.fog.far = 9000; atmo.auto = false; const tm = sel.time === 'reel' ? modeOfHours(bamakoHours()) : sel.time; EX.timeIdx = tm === 'soir' ? 1 : tm === 'nuit' ? 2 : 0; atmo.setPreset(EX_TIMES[EX.timeIdx][0]); $('exTime').textContent = EX_TIMES[EX.timeIdx][1];
  const pl = LANDMARKS[sel.place]; EX.tx = pl.x; EX.tz = pl.z; EX.dist = 1500; EX.pitch = 0.95; EX.sel = -1; EX.fly = null; $('exCard').classList.add('hidden'); EX.labels.forEach(l => l.el.classList.remove('on'));
  $('menu').classList.add('hidden'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); $('explore').classList.remove('hidden'); camera.far = 9000; camera.fov = 55; camera.updateProjectionMatrix(); world.update(EX.tx, EX.tz, true);
  // orbit camera: 1 finger / left mouse = rotate, 2 fingers = pinch zoom + pan, wheel = zoom, right mouse = pan
  const g0 = world.ground(EX.tx, EX.tz, null) ?? 20; EX.ty = g0; camera.position.set(EX.tx - Math.cos(EX.yaw)*Math.cos(EX.pitch)*EX.dist, g0 + Math.sin(EX.pitch)*EX.dist, EX.tz - Math.sin(EX.yaw)*Math.cos(EX.pitch)*EX.dist);
  const c = EX.ctl = new OrbitControls(camera, $('exPad')); c.target.set(EX.tx, g0, EX.tz); c.enableDamping = true; c.dampingFactor = 0.09; c.rotateSpeed = 0.75; c.zoomSpeed = 1.1; c.panSpeed = 0.9; c.minDistance = 70; c.maxDistance = 3600; c.minPolarAngle = 0.12; c.maxPolarAngle = 1.46; c.screenSpacePanning = false; c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }; c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }; c.update();
}
function stopExplore(toGame) {
  if (!EX.on) return; EX.on = false; if (EX.ctl) { EX.ctl.dispose(); EX.ctl = null; } $('explore').classList.add('hidden'); prof.tileRadius = EX.saved.r; atmo.fog.far = EX.saved.far; atmo.auto = EX.saved.auto; if (!toGame) atmo.hours = EX.saved.hours; camera.far = 6000; camera.fov = 64; camera.updateProjectionMatrix(); world.update(EX.tx, EX.tz, true);
  if (!toGame) { $('menu').classList.remove('hidden'); if (player) $('backGame').classList.remove('hidden'); }
}
const _v = new THREE.Vector3(), _bf = new THREE.Vector3();
function exploreFrame(dt) {
  const c = EX.ctl; if (!c) return; const T = c.target;
  if (EX.fly) { const k = 1 - Math.exp(-dt*4), dx = (EX.fly.x - T.x)*k, dz = (EX.fly.z - T.z)*k; T.x += dx; T.z += dz; camera.position.x += dx; camera.position.z += dz; _off.copy(camera.position).sub(T); const d = _off.length(), nd = d + (EX.fly.d - d)*k; camera.position.copy(T).addScaledVector(_off.normalize(), nd); if (Math.abs(EX.fly.x - T.x) + Math.abs(EX.fly.z - T.z) < 2) EX.fly = null; }
  const g = world.ground(T.x, T.z, null); if (g !== null) { const dy = (g - T.y)*Math.min(1, dt*3); T.y += dy; camera.position.y += dy; }
  c.update(); const gc = world.ground(camera.position.x, camera.position.z, null); if (gc !== null && camera.position.y < gc + 25) camera.position.y = gc + 25;
  EX.tx = T.x; EX.tz = T.z; EX.ty = T.y; EX.dist = camera.position.distanceTo(T);
  world.update(EX.tx, EX.tz); atmo.update(dt, camera.position); atmo.sun.castShadow = false;
  EX.labT -= dt; const refresh = EX.labT <= 0; if (refresh) EX.labT = 1; camera.updateMatrixWorld(); const W = innerWidth, H = innerHeight;
  LANDMARKS.forEach((l, i) => { const o = EX.labels[i]; if (refresh) { const gy = world.ground(l.x, l.z, null); if (gy !== null) o.y = gy + 55; }
    _v.set(l.x, o.y, l.z); const d = camera.position.distanceTo(_v); _v.project(camera); const vis = _v.z < 1 && _v.z > -1 && Math.abs(_v.x) < 1.08 && _v.y > -1.05 && _v.y < 1.1 && (i < MAJOR || d < 2800);
    if (vis !== o.vis) { o.vis = vis; o.el.style.display = vis ? '' : 'none'; } if (vis) { const sc = Math.max(0.72, Math.min(1.15, 900/Math.max(d, 1) + 0.45)); o.el.style.transform = `translate(${((_v.x + 1)/2*W).toFixed(1)}px, ${((1 - _v.y)/2*H).toFixed(1)}px) translate(-50%,-100%) scale(${sc.toFixed(2)})`; o.el.style.zIndex = Math.round(10000 - d); }
  });
}

// ---------------- boot ----------------
(async function boot() {
  input = new Input(document.body); if (input.isTouch) document.body.classList.add('touch'); sound = new Sound(); createRenderer(); setupScene(); setupLights(); const prog = (f, t) => { $('loadFill').style.width = $('splashFill').style.width = Math.round(f*100) + '%'; $('loadTxt').textContent = $('splashTxt').textContent = t; };
  prog(0.05, 'Chargement de la ville…'); await world.init(); prog(0.2, 'Chargement des véhicules…'); models = await new Models().load(); prog(0.4, 'Réseau routier…'); graph = await new Graph().load(); const river = await fetch('data/river.json').then(r => r.json()).catch(() => null); graph.renderMap(-2450, -2800, 4900, 5600, 5, river);
  prog(0.7, 'Circulation…'); try { const m = await import('./traffic.js'); traffic = new m.Traffic(scene, world, graph, models, prof); await traffic.init(); } catch (e) { console.warn('traffic unavailable', e); }
  bats = new Bats(scene, world, prof.bats || 150); setupBeacons();
  buildMenu(); setupBigMap(); prog(1, 'Prêt'); $('play').disabled = false; $('exploreBtn').disabled = false; $('play').textContent = 'JOUER'; state.ready = true; requestAnimationFrame(frame); setTimeout(() => { $('splash').classList.add('out'); setTimeout(() => $('splash').remove(), 700); startPlayers(); }, 900);
  window.__game = { get player() { return player; }, get atmo() { return atmo; }, get world() { return world; }, get traffic() { return traffic; }, get bats() { return bats; }, sel, state, begin, startExplore, stopExplore, EX, get camera() { return camera; } };
  if ('serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
