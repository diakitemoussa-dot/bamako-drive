// Voix des clients : chaque phrase d'un client est dite à voix haute (synthèse vocale du navigateur) : voix d'homme pour un homme, voix de femme pour une femme,
// avec une hauteur et un débit propres à chaque personne, et des tons qui varient d'une phrase à l'autre (surprise, colère, remerciement, question).
// Le navigateur n'a pas de voix bambara : on lit le français avec les mots bambara écrits comme ils se prononcent (« I ni ce » -> « i ni tché »).
// Désactivable : localStorage bd_voice = "off".
import { NAMES_F } from './fare.js';
import { tr } from './bambara.js';

const FEM = new Set(NAMES_F);
const FEM_RE = /hortense|julie|denise|eloise|brigitte|amelie|marie|celine|paulina|female|femme|google fran[cç]ais|aria|sylvie|chantal|lea\b/i;
const MALE_RE = /\bpaul\b|claude|henri|antoine|thomas|mathieu|jean|guillaume|remy|male\b|homme|maxime|bernard|nicolas/i;
let voices = [], last = { text: '', t: 0 };
const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
const load = () => { if (synth) voices = synth.getVoices().filter(v => /^fr/i.test(v.lang)); };
if (synth) { load(); synth.addEventListener && synth.addEventListener('voiceschanged', load); }
const hash = (s, k) => { let h = 2166136261 ^ k; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000)/1000; };
const enabled = () => { try { return localStorage.getItem('bd_voice') !== 'off'; } catch { return true; } };

/** homme / femme d'après le prénom (les prénoms de fare.js) ; l'apprenti du sotrama est un jeune homme, les passagers une foule */
function profile(who) {
  const female = FEM.has(who), kind = female ? 'f' : who === 'Passagers' ? 'crowd' : 'm', p1 = hash(who, 1), p2 = hash(who, 2);
  const real = voices.filter(v => (female ? FEM_RE : MALE_RE).test(v.name)), other = voices.filter(v => (female ? MALE_RE : FEM_RE).test(v.name));
  let voice = real.length ? real[Math.floor(p1*real.length) % real.length] : null, shifted = false;
  if (!voice) { voice = (voices.find(v => !(female ? MALE_RE : FEM_RE).test(v.name)) || voices[0] || null); shifted = !female && !!voice && !MALE_RE.test(voice.name); }   // pas de voix d'homme : on baisse la hauteur d'une voix de femme
  const base = female ? 1.12 + 0.28*p1 : who === "L’apprenti" ? 0.95 + 0.2*p1 : shifted ? 0.5 + 0.18*p1 : 0.8 + 0.2*p1;
  return { voice, pitch: base, rate: 0.93 + 0.17*p2, kind };
}
/** exclamations et réactions des passagers (dites ET affichées) : on tire une phrase au hasard pour que ça ne se répète pas */
const LINES = {
  crash: ['Aïe ! Doucement !', 'Aïïe ! Fais attention !', 'Ouille ! Doucement, chauffeur !', 'Oh là là ! Tu conduis comment ?!', 'Aii ! Mon dos !'],
  fast: ['Ralentis, s’il te plaît !', 'Ralentis ! J’ai peur !', 'Doucement, doucement !', 'Aii ! Pas si vite !', 'Ralentis, on n’est pas pressés !'],
  ped: ['Allah ! Tu as renversé quelqu’un !', 'Aii ! Tu as touché quelqu’un !', 'Oh non ! Arrête-toi !'],
  crowd: ['Doucement, chauffeur !', 'Eh ! Ralentis !', 'Aii ! Ça secoue !', 'Tu conduis comme un fou !', 'Oh là là, doucement !'],
  corner: ['Aii ! Doucement dans les virages !', 'Ouh là ! Ça tourne trop vite !'],
};
let lastReact = 0;
/** une phrase de réaction au hasard (kind : crash, fast, ped, crowd, corner) */
export const reaction = kind => { const a = LINES[kind] || LINES.crash; return a[(Math.random()*a.length) | 0]; };
/** dit une réaction sans couper trop souvent (1,3 s minimum entre deux) */
export function react(who, text) { const n = performance.now(); if (n - lastReact < 1300) return; lastReact = n; speak(who, tr(text).spoken, false, text); }
/** les mots bambara tels qu'ils se prononcent, et sans emoji */
const say = t => t.replace(/\bI ni ce\b/gi, 'i ni tché').replace(/\bA(?:ï|i)+e?(?![a-zà-ÿ])/g, 'aïe').replace(/\bOuille\b/gi, 'ouille').replace(/\bFCFA\b/g, 'francs CFA').replace(/\(([^)]*)\)/g, ', $1,').replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, '').replace(/\s+/g, ' ').trim();
/** ton de chaque phrase selon ce qu'elle dit */
function mood(s) {
  if (/a[ïi]+e?\b|ouille|allah ?!|aii/i.test(s) && /!/.test(s) && s.length < 40) return { dp: 0.24, dr: 1.2, vol: 1 };   // cri / douleur
  if (/ralentis|doucement|pas si vite|j’ai peur/i.test(s)) return { dp: 0.18, dr: 1.16, vol: 1 };                    // inquiet
  if (/quoi|marre|trop cher|je descends|arrête|oh là là/i.test(s)) return { dp: 0.2, dr: 1.14, vol: 1 };      // fâché / surpris
  if (/merci|allah|dieu|bravo|parfait|magnifique/i.test(s)) return { dp: 0.06, dr: 0.95, vol: 0.95 };           // chaleureux
  if (/diminue|s’il te plaît|s'il te plaît/i.test(s)) return { dp: 0.12, dr: 0.97, vol: 0.9 };                  // il supplie
  if (/vite|pressé|ne traîne|attention/i.test(s)) return { dp: 0.1, dr: 1.12, vol: 1 };                          // pressé
  return { dp: 0, dr: 1, vol: 0.95 };
}

// Chrome / Edge n'autorisent la voix qu'après un vrai clic, une touche du clavier ou un toucher : un bouton de manette ne compte pas.
// Si le joueur n'a jamais cliqué, on le lui dit une fois ; dès son premier clic / touche on débloque la voix et on rejoue la dernière phrase.
let hint = null, lastWho = '', lastText = '', lastSrc = '';
const activated = () => !(navigator.userActivation && !navigator.userActivation.hasBeenActive);
function showHint() {
  if (hint || !document.body) return; hint = document.createElement('div'); hint.id = 'voiceHint'; hint.textContent = '🔊 Pour entendre la voix des clients : clique une fois avec la souris ou appuie sur une touche du clavier'; document.body.appendChild(hint);
}
function hideHint() { if (hint) { hint.remove(); hint = null; } }
function unlock() {
  const was = !!hint; hideHint(); if (!synth) return; try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch (e) { /* ignoré */ }
  if (was && lastText) setTimeout(() => speak(lastWho, lastText, true, lastSrc), 150);
}
for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, e => { if (e.isTrusted) unlock(); }, { capture: true });
export function stopSpeech() { if (synth) { synth.cancel(); } hideHint(); }
export function pauseSpeech(on) { if (synth) { if (on) synth.pause(); else synth.resume(); } }
/** dit la phrase de `who` ; coupe la phrase précédente */
/** src : la phrase d'origine (française) quand `text` est une traduction — sert à choisir le ton de la voix */
export function speak(who, text, again = false, src = text) {
  if (!synth || !enabled() || !text) return; const now = performance.now(); if (!again && text === last.text && now - last.t < 3000) return; last = { text, t: now }; lastWho = who; lastText = text; lastSrc = src;
  if (!activated()) showHint();
  if (!voices.length) load(); const P = profile(who), parts = say(text).match(/[^.!?…]+[.!?…]*/g) || [say(text)];
  if (synth.speaking || synth.pending) synth.cancel(); if (synth.paused) synth.resume();
  parts.forEach((s, i) => {
    s = s.trim(); if (!s) return; const m = mood(src !== text ? src : s), q = /\?\s*$/.test(s), u = new SpeechSynthesisUtterance(s);
    if (P.voice) { u.voice = P.voice; u.lang = P.voice.lang; } else u.lang = 'fr-FR';
    const jit = (Math.sin(hash(s, i + 5)*6.28))*0.07;   // légère variation d'une phrase à l'autre
    u.pitch = Math.max(0.1, Math.min(2, P.pitch + m.dp + jit + (q ? 0.12 : 0) + (i === 0 && /^(i ni|bonjour)/i.test(s) ? 0.08 : 0))); u.rate = Math.max(0.6, Math.min(1.5, P.rate*m.dr*(q ? 0.97 : 1))); u.volume = m.vol;
    u.onerror = e => { if (e.error === 'not-allowed') showHint(); };
    synth.speak(u);
  });
}
