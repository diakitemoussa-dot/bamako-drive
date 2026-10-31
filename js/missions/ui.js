// Interface des missions : guide (flèche + distance), argent, bulle de dialogue du client, barre de patience.
import { fmt } from './fare.js';
const el = (tag, id, html = '', parent = document.getElementById('hud')) => { const e = document.createElement(tag); e.id = id; e.innerHTML = html; parent.appendChild(e); return e; };
const KEY = 'bd_cash';

export class MissionUI {
  constructor() {
    this.cash = 0; try { this.cash = +localStorage.getItem(KEY) || 0; } catch {}
    this.cashEl = el('div', 'mCash', ''); this.guide = el('div', 'mGuide', '<svg id="mArrow" viewBox="0 0 40 40"><path d="M20 3 L35 34 L20 27 L5 34 Z"/></svg><div><b id="mGuideTxt"></b><small id="mGuideSub"></small></div>');
    this.pat = el('div', 'mPat', '<span id="mPatFace">😊</span><div id="mPatBar"><i id="mPatFill"></i></div><b id="mFare"></b>');
    this.card = el('div', 'mCard', '<div id="mWho"></div><div id="mSay"></div><div id="mBtns"></div>', document.body);   // hors du HUD : au-dessus des zones tactiles
    this.hide(); this.setCash(this.cash); this.onPick = null;
    addEventListener('keydown', e => { if (!this.card.classList.contains('on') || e.repeat) return; const i = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code]; if (i !== undefined && this.onPick) this.onPick(i); });
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
    document.getElementById('mWho').textContent = who; document.getElementById('mSay').textContent = say; const b = document.getElementById('mBtns'); b.innerHTML = '';
    buttons.forEach((bt, i) => { const x = document.createElement('button'); x.className = bt.cls || ''; x.innerHTML = (buttons.length > 1 ? '<kbd>' + (i + 1) + '</kbd>' : '') + bt.label; x.onclick = () => { if (this.onPick) onPick(i); }; b.appendChild(x); });
    this.onPick = onPick; this.card.classList.add('on');
  }
  say(who, say) { document.getElementById('mWho').textContent = who; document.getElementById('mSay').textContent = say; document.getElementById('mBtns').innerHTML = ''; this.onPick = null; this.card.classList.add('on'); }
  hide() { this.card.classList.remove('on'); this.onPick = null; }
  hideAll() { this.hide(); this.hideGuide(); this.hidePatience(); }
}
