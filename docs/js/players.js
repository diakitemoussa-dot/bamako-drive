// Comptage des joueurs : un nom demandé une seule fois par appareil, puis +1 à chaque ouverture du jeu (une fois par session).
// Les données vont dans un tableur Google (onglet « Joueurs ») via un script Google Apps Script (voir apps_script/).
export const PLAYERS_API = '';   // URL de l'application Web Apps Script (…/exec) ; vide = fonction désactivée

const KEY = 'bd_player', SESSION = 'bd_counted';
const store = { get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }, set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} } };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const device = () => { const u = navigator.userAgent; return (/iPhone|iPad/.test(u) ? 'iOS' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'Mac' : 'Autre') + ' · ' + (matchMedia('(pointer:coarse)').matches ? 'tactile' : 'souris'); };
const call = (path, body) => fetch(PLAYERS_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, action: path.slice(1), device: device() }) }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(j => { if (j.error) throw new Error(j.error); return j; });   // text/plain : requête « simple », sans pré-vérification CORS (Google Apps Script)

/** à appeler une fois le jeu prêt : demande le nom si besoin, puis compte l'entrée. Ne bloque jamais le jeu. */
export async function startPlayers() {
  if (!PLAYERS_API) return;
  let p = store.get(); if (!p || !p.id) { p = { id: uuid(), name: '', sent: false }; store.set(p); }
  let counted = false; try { counted = sessionStorage.getItem(SESSION) === '1'; } catch {}
  try {
    if (p.name && p.sent) {                                       // joueur déjà inscrit : +1 (sauf rechargement dans la même session)
      if (counted) return; const r = await call('/visit', { id: p.id }); try { sessionStorage.setItem(SESSION, '1'); } catch {}
      if (r.known) return;                                         // ligne supprimée dans Notion : on redemande le nom
      p.sent = false;
    }
    if (p.name && !p.sent) { await register(p); return; }          // nom saisi hors ligne : on renvoie
  } catch { return; }                                              // hors ligne : on réessaiera à la prochaine ouverture
  const name = await askName(p.name); if (!name) return;
  p.name = name; p.sent = false; store.set(p); try { await register(p); } catch {}
}
async function register(p) { await call('/register', { id: p.id, name: p.name }); p.sent = true; store.set(p); try { sessionStorage.setItem(SESSION, '1'); } catch {} }

function askName(prefill) {
  return new Promise(res => {
    const el = document.createElement('div'); el.id = 'nameGate';
    el.innerHTML = '<form class="panel"><h2>Bienvenue sur Bamako Drive !</h2><p class="sub">Comment tu t’appelles ? Ton nom sert seulement à compter les joueurs du jeu.</p><input id="nameIn" type="text" maxlength="40" minlength="2" autocomplete="given-name" placeholder="Ton prénom ou ton nom" required><button class="cta" type="submit">✓ VALIDER</button><small>Tu ne le verras demandé qu’une seule fois sur cet appareil.</small></form>';
    document.body.appendChild(el); const inp = el.querySelector('input'); inp.value = prefill || ''; setTimeout(() => inp.focus(), 100);
    el.querySelector('form').onsubmit = e => { e.preventDefault(); const v = inp.value.trim(); if (v.length < 2) { inp.focus(); return; } el.remove(); res(v); };
  });
}
