// Tarification : prix juste selon la distance, personnalité du client, marchandage.
const round250 = v => Math.max(250, Math.round(v/250)*250);
export const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';

export const NAMES_F = ['Awa', 'Fatoumata', 'Mariam', 'Aminata', 'Oumou', 'Kadiatou', 'Rokia', 'Nana'];
const NAMES_M = ['Mamadou', 'Ibrahim', 'Seydou', 'Adama', 'Moussa', 'Bakary', 'Boubacar', 'Souleymane'];

/** prix « normal » d'une course : prise en charge + kilomètre (arrondi à 250 FCFA) */
export const fairPrice = distM => round250(500 + 450*distM/1000);

/** client aléatoire : tolérance = combien il accepte de payer par rapport au prix normal */
export function newClient() {
  const f = Math.random() < 0.5, names = f ? NAMES_F : NAMES_M;
  return { female: f, name: names[(Math.random()*names.length) | 0], tol: 0.9 + Math.random()*0.4, patience: 100 };
}
/** trois prix proposés au joueur : bas, normal, élevé */
export function choices(fair) { return [round250(fair*0.75), fair, round250(fair*1.5)]; }

/** réaction du client au prix annoncé → { kind: 'accept'|'counter'|'leave', text, price? } */
export function react(client, fair, price) {
  const ok = fair*client.tol, r = price/ok;
  if (r <= 0.9) return { kind: 'accept', text: 'Ah, c’est bien, merci ! On y va.' };
  if (r <= 1.0) return { kind: 'accept', text: 'D’accord, ça va. On y va.' };
  if (r > 1.8) return { kind: 'leave', text: client.female ? 'Quoi ?! Beaucoup trop cher, je descends !' : 'Quoi ?! Beaucoup trop cher, je descends !' };
  return { kind: 'counter', price: Math.min(price - 250, round250(ok)), text: r < 1.3 ? 'C’est un peu cher… Diminue un peu, s’il te plaît.' : 'Oh là là, c’est cher ! Diminue, sinon je descends.' };
}
/** pourboire selon la patience restante à l'arrivée */
export const tipFor = (price, patience) => patience >= 60 ? Math.round(price*0.25*(patience - 50)/50/50)*50 : 0;
