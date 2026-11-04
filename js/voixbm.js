// Voix bambara pré-générées (tools/voix/generer_voix.py -> data/voix/*.mp3 + data/voix/index.json).
// - on retrouve la voix d'une phrase par son texte bambara (le même que dans repliques.csv / js/missions/bambara.js) ;
// - une seule voix à la fois : une réplique de dialogue (prio 1) attend la fin de la précédente, une simple réaction (prio 0) est abandonnée si une voix parle déjà ;
// - sous-titres bambara + français pendant la voix ; volume des voix réglable à part (la radio / la musique a son propre volume) ;
// - si aucune voix n'existe pour une phrase, on renvoie null : l'appelant garde la synthèse vocale phonétique (js/missions/voice.js).
const KEY_VOL = 'bd_vol_voix', DIR = 'data/voix/';
let byBm = null, ready = false, cur = null, queue = [], paused = false, subs = null;

const norm = s => String(s).replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
export const getVolume = () => { try { const v = parseFloat(localStorage.getItem(KEY_VOL)); return isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; } catch { return 1; } };
export function setVolume(v) { v = Math.max(0, Math.min(1, +v || 0)); try { localStorage.setItem(KEY_VOL, String(v)); } catch { /* ignoré */ } if (cur && cur.audio) cur.audio.volume = v; }

/** charge la liste des voix (une fois) ; liste vide si le dossier data/voix n'existe pas */
export function loadVoices() {
  if (byBm) return Promise.resolve(byBm);
  byBm = new Map();
  return fetch(DIR + 'index.json').then(r => (r.ok ? r.json() : [])).then(list => { for (const e of Array.isArray(list) ? list : []) if (e && e.bm && e.file) byBm.set(norm(e.bm), e); ready = true; return byBm; }).catch(() => { ready = true; return byBm; });
}
export const voiceCount = () => (byBm ? byBm.size : 0);

function box() {
  if (subs) return subs;
  subs = document.createElement('div'); subs.id = 'voiceSubs'; subs.className = 'hidden'; subs.innerHTML = '<b id="vsBm"></b><span id="vsFr"></span>'; document.body.appendChild(subs); return subs;
}
function showSubs(e) { const b = box(); b.querySelector('#vsBm').textContent = e.bm; b.querySelector('#vsFr').textContent = e.fr || ''; b.classList.remove('hidden'); }
function hideSubs() { if (subs) subs.classList.add('hidden'); }

function start(it) {
  cur = it; try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch { /* ignoré */ }   // jamais de synthèse vocale par-dessus une voix enregistrée
  const a = new Audio(DIR + it.e.file); a.volume = getVolume(); it.audio = a;
  const end = () => { if (cur !== it) return; cur = null; hideSubs(); const n = queue.shift(); if (n) start(n); };
  a.addEventListener('ended', end); a.addEventListener('error', end);
  if (!it.card) showSubs(it.e);   // dans une bulle de dialogue, le bambara est déjà affiché par la bulle : elle ajoute elle-même le français
  if (!paused) a.play().catch(end);
}
function stopCurrent() { if (cur && cur.audio) { cur.audio.pause(); cur.audio.src = ''; } cur = null; hideSubs(); }

/**
 * Joue la voix de la phrase bambara `bm` si elle existe. Retourne son entrée { id, bm, fr, … } (même si la voix est mise en attente
 * ou abandonnée parce qu'une autre parle : l'appelant ne doit alors PAS lancer la synthèse vocale), ou null s'il n'y a pas de voix.
 * opts : { prio: 1 dialogue (attend son tour) | 0 réaction (abandonnée si une voix parle), card: true si une bulle affiche déjà le texte }
 */
export function playBm(bm, opts = {}) {
  if (!ready || !byBm.size) return null; const e = byBm.get(norm(bm)); if (!e) return null;
  const it = { e, prio: opts.prio ?? 1, card: !!opts.card };
  if (!cur) { start(it); return e; }
  if (it.prio > cur.prio) { stopCurrent(); queue.length = 0; start(it); return e; }   // un dialogue coupe une simple réaction
  if (it.prio < 1) return e;                                                           // réaction pendant une voix : abandonnée
  if (queue.length >= 2) queue.shift(); queue.push(it); return e;                      // dialogue : attend la fin de la voix en cours
}
/** joue une réplique par son id (événements du jeu qui n'ont pas de texte à l'écran) */
export function playId(id, opts = {}) {
  if (!ready) return null; for (const e of byBm.values()) if (e.id === id) return playBm(e.bm, opts); return null;
}
export function stopVoices() { queue.length = 0; stopCurrent(); }
export function pauseVoices(on) { paused = !!on; if (cur && cur.audio) { if (on) cur.audio.pause(); else cur.audio.play().catch(() => {}); } }
