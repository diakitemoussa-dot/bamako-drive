// Retours des joueurs, bien visibles (menu, en jeu, pause, touche F) : note en un toucher (emojis), puis commentaire facultatif.
// Envoyé au tableur Google (onglet « Retours ») par le même script Apps Script que le comptage des joueurs (apps_script/Code.gs, action « feedback »).
// Principes (recherche sur les pratiques des studios) : plusieurs points d'entrée toujours disponibles ; un seul rappel par session, jamais en pleine action
// ni après un échec ; tout est facultatif sauf l'envoi ; « Plus tard » aussi visible que « Envoyer » ; infos techniques jointes (appareil, lieu, fluidité, erreurs).
// Hors ligne : le retour est gardé sur l'appareil et renvoyé à la prochaine ouverture.
import { sendToSheet, getPlayer } from './players.js';

const CATS = [['Conduite', '🚗'], ['Missions', '💼'], ['Graphismes', '🎨'], ['Performance', '⚡'], ['Bug', '🐞'], ['Idée', '💡'], ['Autre', '💬']];
export const EMO = [['😍', 5, 'Super'], ['🙂', 4, 'Bien'], ['😐', 3, 'Moyen'], ['🙁', 2, 'Bof'], ['😡', 1, 'Mauvais']];
const QKEY = 'bd_fb_queue', LKEY = 'bd_fb_asked', MIN_GAP = 4000;
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
let cfg = null, el = null, lastSend = 0, playSec = 0, asked = false, ridesDone = 0, invEl = null; const errors = [];

/** cfg : { context() → {…}, onOpen(), onClose(), isPlaying() → bool, isCalm() → bool } */
export function initFeedback(c) {
  cfg = c; flushQueue(); addEventListener('online', flushQueue);
  addEventListener('error', e => { errors.push(String(e.message || '').slice(0, 80)); if (errors.length > 3) errors.shift(); });
  addEventListener('unhandledrejection', e => { errors.push('REJ ' + String((e.reason && e.reason.message) || e.reason || '').slice(0, 70)); if (errors.length > 3) errors.shift(); });
  setInterval(() => { if (!cfg.isPlaying() || el) return; playSec += 5; if (playSec >= 600 && cfg.isCalm()) maybeInvite('10 min'); }, 5000);
}
/** appelé quand une mission est RÉUSSIE (jamais après un échec) : rappel après la 2e */
export function missionDone() { ridesDone++; if (ridesDone === 2) setTimeout(() => cfg && cfg.isCalm() && maybeInvite('mission'), 3500); }
/** appelé au retour au menu : après une vraie partie, la carte d'avis du menu se met en avant */
export function sessionEnded() { const c = document.getElementById('fbCard'); if (c && playSec >= 180) { resetCard(c); c.classList.add('hot'); try { c.scrollIntoView({ block: 'nearest' }); } catch {} } }

const ctxNow = (full) => { const x = cfg.context(); return full ? { ...x, minutes: Math.round(playSec/60), errors: errors.join(' | ') } : { version: x.version }; };
const payload = (f) => { const p = getPlayer(); return { id: p.id, name: p.name || '', rating: f.rating, category: f.category, message: f.message, trigger: f.trigger || 'bouton', ctx: f.ctx }; };
async function post(f) { await sendToSheet('/feedback', payload(f)); }
async function send(f) { let ok = false; try { await post(f); ok = true; } catch { const q = lsGet(QKEY, []); q.push(f); lsSet(QKEY, q.slice(-5)); } return ok; }
async function flushQueue() {
  const q = lsGet(QKEY, []); if (!q.length || !navigator.onLine) return; const rest = [];
  for (const f of q) { try { await post(f); } catch { rest.push(f); } }
  lsSet(QKEY, rest);
}

/** rangée d'emojis : un toucher = note envoyée tout de suite (comme un bouton d'envoi) ; onDone(rating, ok) ensuite */
export function mountEmoji(container, trigger, onDone) {
  container.innerHTML = EMO.map(([e, v, t]) => `<button type="button" class="fbEmoBtn" data-v="${v}" aria-label="${t} (${v} sur 5)" title="${t}"><span>${e}</span><small>${t}</small></button>`).join('');
  container.querySelectorAll('button').forEach(b => b.onclick = async () => {
    const rating = +b.dataset.v; container.querySelectorAll('button').forEach(x => { x.disabled = true; x.classList.toggle('on', x === b); });
    if (rating <= 2) { openFeedback({ rating, trigger }); onDone && onDone(rating, null); return; }   // note basse : on veut savoir pourquoi (rien n'est envoyé avant)
    const ok = await send({ rating, category: trigger === 'mission' ? 'Missions' : 'Autre', message: '', trigger, ctx: ctxNow(true) }); lastSend = Date.now(); onDone && onDone(rating, ok);
  });
}
function resetCard(c) { c.classList.remove('hot', 'done'); const r = c.querySelector('.fbEmo'); if (r) mountEmoji(r, 'menu', (rt, ok) => cardThanks(c, rt, ok)); }
function cardThanks(c, rating, ok) {
  if (ok === null) { resetCard(c); return; }
  c.classList.add('done'); c.querySelector('.fbS').textContent = ok ? 'Merci ! Ton avis a bien été envoyé. 🙏' : 'Merci ! Il sera envoyé dès que tu auras du réseau. 🙏';
}
/** branche la carte d'avis du menu principal (index.html : #fbCard) */
export function mountMenuCard() { const c = document.getElementById('fbCard'); if (!c) return; const s = c.querySelector('.fbS'); c.dataset.s = s.textContent; resetCard(c); }

function maybeInvite(reason) {
  if (asked || el || Date.now() - lsGet(LKEY, 0) < 3*864e5) return; asked = true; lsSet(LKEY, Date.now());
  invEl = document.createElement('div'); invEl.id = 'fbInvite'; invEl.setAttribute('role', 'dialog'); invEl.setAttribute('aria-label', 'Ton avis');
  invEl.innerHTML = `<div class="fbInvT">💬 Comment trouves-tu le jeu ?</div><div class="fbEmo" id="fbInvEmo"></div><div class="fbInvRow"><button class="fbLink" id="fbInvMore">✍ Écrire un commentaire</button><button class="back" id="fbInvNo">Plus tard</button></div>`;
  document.body.appendChild(invEl); const close = () => { if (invEl) { invEl.remove(); invEl = null; } };
  mountEmoji(invEl.querySelector('#fbInvEmo'), reason === 'mission' ? 'mission' : 'invitation', (rt, ok) => { if (rt <= 2) { close(); return; } const t = invEl && invEl.querySelector('.fbInvT'); if (t) { t.textContent = ok ? 'Merci ! 🙏' : 'Merci ! (envoi dès que le réseau revient)'; } setTimeout(close, 2200); });
  invEl.querySelector('#fbInvMore').onclick = () => { close(); openFeedback({ trigger: reason === 'mission' ? 'mission' : 'invitation' }); }; invEl.querySelector('#fbInvNo').onclick = close; setTimeout(close, 25000);
}

export function openFeedback(opt = {}) {
  if (el || !cfg) return; if (invEl) { invEl.remove(); invEl = null; }
  cfg.onOpen && cfg.onOpen(); const trigger = opt.trigger || 'bouton';
  el = document.createElement('div'); el.id = 'fbGate'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'fbTitle');
  el.innerHTML = `<form class="panel" novalidate>
    <h2 id="fbTitle">💬 Ton avis sur Bamako Drive</h2><p class="sub">Ça prend 20 secondes. Tout est facultatif, sauf la note.</p>
    <div id="fbStars" role="radiogroup" aria-label="Ta note">${[1, 2, 3, 4, 5].map(i => `<button type="button" role="radio" aria-checked="false" aria-label="${i} sur 5" data-v="${i}">★</button>`).join('')}</div>
    <div id="fbCats" class="chips" role="group" aria-label="Sujet">${CATS.map(([c, e]) => `<button type="button" data-c="${c}">${e} ${c}</button>`).join('')}</div>
    <textarea id="fbMsg" maxlength="600" rows="4" placeholder="Qu'est-ce qui te plaît ? Qu'est-ce qui ne va pas ? (un bug, un endroit précis, une idée…)"></textarea>
    <div id="fbCount">0 / 600</div>
    <label class="check"><input type="checkbox" id="fbCtx" checked> Joindre les infos techniques (appareil, lieu, fluidité) : ça nous aide à corriger</label>
    <div id="fbErr" role="alert"></div>
    <div class="ctaRow"><button type="button" class="back" id="fbCancel">Plus tard</button><button class="cta" type="submit" id="fbSend">✓ ENVOYER</button></div></form>`;
  document.body.appendChild(el);
  const $ = s => el.querySelector(s), form = $('form'), msg = $('#fbMsg'), err = $('#fbErr'); let rating = 0, cat = '';
  const setRating = v => { rating = v; el.querySelectorAll('#fbStars button').forEach(b => { const on = +b.dataset.v <= v; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(+b.dataset.v === v)); }); err.textContent = ''; };
  el.querySelectorAll('#fbStars button').forEach(b => b.onclick = () => setRating(+b.dataset.v));
  el.querySelectorAll('#fbCats button').forEach(b => b.onclick = () => { cat = cat === b.dataset.c ? '' : b.dataset.c; el.querySelectorAll('#fbCats button').forEach(x => x.classList.toggle('on', x.dataset.c === cat)); err.textContent = ''; });
  msg.oninput = () => { $('#fbCount').textContent = msg.value.length + ' / 600'; err.textContent = ''; };
  if (opt.rating) setRating(opt.rating);
  // le jeu écoute le clavier (W, M, P, Échap…) : tant que le formulaire est ouvert, ces touches ne doivent rien déclencher
  for (const t of ['keydown', 'keyup', 'keypress']) el.addEventListener(t, e => { e.stopPropagation(); if (t === 'keydown' && e.key === 'Escape') close(); });
  const close = () => { if (!el) return; el.remove(); el = null; cfg.onClose && cfg.onClose(); };
  $('#fbCancel').onclick = close; el.addEventListener('pointerdown', e => { if (e.target === el) close(); });
  setTimeout(() => (opt.rating ? $('#fbMsg') : $('#fbStars button')).focus(), 60);
  form.onsubmit = async e => {
    e.preventDefault(); const text = msg.value.trim();
    if (!rating) { err.textContent = 'Choisis une note de 1 à 5 étoiles.'; return; }
    if ((rating <= 2 || cat === 'Bug') && text.length < 5) { err.textContent = 'Dis-nous en quelques mots ce qui ne va pas.'; msg.focus(); return; }
    if (Date.now() - lastSend < MIN_GAP) { err.textContent = 'Un instant, ton avis vient d’être envoyé…'; return; }
    const f = { rating, category: cat || 'Autre', message: text, trigger: opt.rating ? trigger + ' + commentaire' : trigger, ctx: ctxNow($('#fbCtx').checked) };
    $('#fbSend').disabled = true; $('#fbSend').textContent = 'Envoi…'; lastSend = Date.now(); const sent = await send(f);
    form.innerHTML = `<h2>Merci ! 🙏</h2><p class="sub">${sent ? 'Ton avis a bien été envoyé à l’équipe.' : 'Pas de connexion pour le moment : ton avis est gardé sur ton appareil et sera envoyé à ta prochaine visite.'}</p><button class="cta" type="button" id="fbDone">✓ FERMER</button>`;
    const d = el.querySelector('#fbDone'); d.onclick = close; d.focus();
    const c = document.getElementById('fbCard'); if (c) { c.classList.remove('hot'); c.classList.add('done'); c.querySelector('.fbS').textContent = 'Merci pour ton avis ! 🙏'; }
  };
}
