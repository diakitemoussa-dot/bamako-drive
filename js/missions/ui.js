// Interface des missions : guide (flèche + distance), argent, bulle de dialogue du client, barre de patience.
import { fmt } from './fare.js';
import { readPad } from '../input.js';
import { speak, stopSpeech } from './voice.js';
import { tr, trText } from './bambara.js';
const el = (tag, id, html = '', parent = document.getElementById('hud')) => { const e = document.createElement(tag); e.id = id; e.innerHTML = html; parent.appendChild(e); return e; };
const KEY = 'bd_cash';

export class MissionUI {
  constructor() {
    this.cash = 0; try { this.cash = +localStorage.getItem(KEY) || 0; } catch {}
    this.cashEl = el('div', 'mCash', ''); this.guide = el('div', 'mGuide', '<svg id="mArrow" viewBox="0 0 40 40"><path d="M20 3 L35 34 L20 27 L5 34 Z"/></svg><div><b id="mGuideTxt"></b><small id="mGuideSub"></small></div>');
    this.pat = el('div', 'mPat', '<span id="mPatFace">😊</span><div id="mPatBar"><i id="mPatFill"></i></div><b id="mFare"></b>');
    this.card = el('div', 'mCard', '<div id="mWho"></div><div id="mSay"></div><div id="mBtns"></div>', document.body);   // hors du HUD : au-dessus des zones tactiles
    this.hide(); this.setCash(this.cash); this.onPick = null; this.sel = 0; this.t0 = 0; this._pp = {}; this._padLoop();
    addEventListener('keydown', e => { if (!this.card.classList.contains('on') || e.repeat) return; const i = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code]; if (i !== undefined && this.onPick) this.onPick(i); });
  }
  /** manette : gauche / droite (croix ou stick gauche) = choisir un prix ; ✕ (ou □ / A) = valider */
  _padLoop() {
    requestAnimationFrame(() => this._padLoop());
    const btns = this.onPick && this.card.classList.contains('on') ? [...this.card.querySelectorAll('#mBtns button')] : [], gp = readPad();
    if (!btns.length || !gp) { this._pp = {}; if (this.hint) this.hint.style.display = 'none'; return; }
    if (!this.hint) { this.hint = document.createElement('div'); this.hint.id = 'mPadHint'; this.card.appendChild(this.hint); }
    this.hint.style.display = ''; this.hint.textContent = btns.length > 1 ? '🎮  ◀ ▶ choisir   ·   ✕ valider' : '🎮  ✕ continuer';
    const B = i => !!(gp.buttons[i] && gp.buttons[i].pressed), ax = gp.axes[0] || 0, edge = (k, v) => { const e = v && !this._pp[k]; this._pp[k] = v; return e; };
    const left = edge('l', B(14) || ax < -0.55), right = edge('r', B(15) || ax > 0.55), ok = edge('a', B(0) || B(2));
    if (this.sel >= btns.length) this.sel = btns.length - 1;
    if (performance.now() - this.t0 > 450) { if (left) this.sel = Math.max(0, this.sel - 1); if (right) this.sel = Math.min(btns.length - 1, this.sel + 1); if (ok) { btns[this.sel].click(); return; } }
    btns.forEach((b, i) => b.classList.toggle('padFocus', i === this.sel));
  }
  setCash(v) { this.cash = v; try { localStorage.setItem(KEY, String(v)); } catch {} this.cashEl.textContent = '💰 ' + fmt(v); this.cashEl.classList.add('on'); }
  /** flèche vers la cible : rel = angle relatif au cap du joueur (rad, + = à droite) */
  setGuide(txt, sub, rel, kind) { const g = this.guide; g.className = 'on ' + (kind || ''); document.getElementById('mGuideTxt').textContent = txt; document.getElementById('mGuideSub').textContent = sub || ''; document.getElementById('mArrow').style.transform = `rotate(${rel}rad)`; }
  hideGuide() { this.guide.className = ''; }
  /** barre de jauge (patience / état de la cargaison) ; text = ligne de droite ; icon = emoji fixe (sinon visage selon le niveau) */
  setPatience(p, text, icon) { this.pat.classList.add('on'); document.getElementById('mPatFill').style.width = Math.max(0, p) + '%'; this.pat.dataset.lvl = p > 60 ? 'ok' : p > 30 ? 'mid' : 'low'; document.getElementById('mPatFace').textContent = icon || (p > 60 ? '😊' : p > 30 ? '😐' : '😠'); document.getElementById('mFare').textContent = text || ''; }
  hidePatience() { this.pat.classList.remove('on'); }
  /** bulle de dialogue : who = nom, say = phrase, buttons = [{label, cls}] ; onPick(index) */
  ask(who, say, buttons, onPick) {
    const r = tr(say); document.getElementById('mWho').textContent = trText(who); document.getElementById('mSay').textContent = r.text; speak(who, r.spoken, false, say); const b = document.getElementById('mBtns'); b.innerHTML = '';
    buttons.forEach((bt, i) => { const x = document.createElement('button'); x.className = bt.cls || ''; x.innerHTML = (buttons.length > 1 ? '<kbd>' + (i + 1) + '</kbd>' : '') + trText(bt.label); x.onclick = () => { if (this.onPick) onPick(i); }; b.appendChild(x); });
    this.onPick = onPick; this.card.classList.add('on'); this.sel = buttons.length === 3 ? 1 : 0; this.t0 = performance.now(); this._pp = { a: true, l: true, r: true };   // le prix du milieu est présélectionné ; un bouton déjà enfoncé ne valide pas
  }
  say(who, say) { const r = tr(say); document.getElementById('mWho').textContent = trText(who); document.getElementById('mSay').textContent = r.text; speak(who, r.spoken, false, say); document.getElementById('mBtns').innerHTML = ''; this.onPick = null; this.card.classList.add('on'); }
  hide() { this.card.classList.remove('on'); this.onPick = null; }
  hideAll() { this.hide(); this.hideGuide(); this.hidePatience(); stopSpeech(); }
}
