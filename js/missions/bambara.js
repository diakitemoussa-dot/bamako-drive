// Langue des clients : français (par défaut) ou bambara (choix du menu, localStorage bd_lang = "bm").
// Le jeu écrit toujours ses phrases en français ; on traduit au dernier moment (bulle de dialogue, messages, voix) :
//   - EXACT : phrase française complète -> bambara
//   - PATTERNS : phrases à trous (noms, prix, lieux) : { re, bm (modèle avec {0}, {1}…), nested (captures à traduire à leur tour) }
// tr(texte) -> { text : bambara écrit (orthographe standard : ɛ ɔ ɲ ŋ), spoken : bambara écrit « comme ça se prononce » pour la voix française }.
// ⚠ Traduction faite sans locuteur natif : à faire relire (voir docs/bambara_a_relire.md, généré par tools/export_bambara_review.mjs).
const KEY = 'bd_lang';
export const getLang = () => { try { return localStorage.getItem(KEY) === 'bm' ? 'bm' : 'fr'; } catch { return 'fr'; } };
export const setLang = l => { try { localStorage.setItem(KEY, l === 'bm' ? 'bm' : 'fr'); } catch { /* ignoré */ } };

const norm = s => String(s).replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

/** orthographe bambara -> écriture que la synthèse vocale française prononce à peu près juste (ɛ→è, ɔ→o, ɲ→gn, c→tch, j→dj, u→ou…) */
export function phon(t) {
  return t
    .replace(/ɛ/g, 'è').replace(/Ɛ/g, 'È').replace(/ɔ/g, 'o').replace(/Ɔ/g, 'O').replace(/ɲ/g, 'gn').replace(/Ɲ/g, 'Gn').replace(/ŋ/g, 'ng').replace(/Ŋ/g, 'Ng')
    .replace(/c/g, 'tch').replace(/C/g, 'Tch').replace(/j/g, 'dj').replace(/J/g, 'Dj')
    .replace(/u/g, 'ou').replace(/U/g, 'Ou').replace(/ow/g, 'ou').replace(/w/g, 'ou').replace(/W/g, 'Ou')
    .replace(/e/g, 'é').replace(/E/g, 'É')
    .replace(/g(?=[éèi])/g, 'gu').replace(/G(?=[éèi])/g, 'Gu')   // g devant é / è / i reste dur (« gu »)
    .replace(/([aeiouèéo])s(?=[aeiouèéo])/g, '$1ss');
}

const E = [
  // --- prix et marchandage (fare.js, taxi.js) ---
  ['Ah, c’est bien, merci ! On y va.', 'Awɔ, a ka ɲi, i ni ce! An ka taa.'],
  ['D’accord, ça va. On y va.', 'Awɔ, a ka ɲi. An ka taa.'],
  ['Quoi ?! Beaucoup trop cher, je descends !', 'Mun?! A ka gɛlɛn kosɛbɛ, ne bɛ jigin!'],
  ['C’est un peu cher… Diminue un peu, s’il te plaît.', 'A ka gɛlɛn dɔɔnin… A dɔgɔya dɔɔnin, ni i sɔnna.'],
  ['Oh là là, c’est cher ! Diminue, sinon je descends.', 'Ayiwa, a ka gɛlɛn! A dɔgɔya, ni o tɛ ne bɛ jigin.'],
  ['Merci ! On y va.', 'I ni ce! An ka taa.'],
  ['Alors je descends, au revoir.', 'O tuma ne bɛ jigin, k’an bɛn.'],
  ['J’en ai marre ! Arrête-toi, je descends !', 'Ne sɛgɛnna! I jɔ, ne bɛ jigin!'],
  ['On est arrivés, merci !', 'An sera, i ni ce!'],
  ['Refuser (le client descend)', 'Ka ban (mɔgɔ bɛ jigin)'],
  // --- réactions des passagers (voice.js) ---
  ['Aïe ! Doucement !', 'Ayiii! Dɔɔnin dɔɔnin!'],
  ['Aïïe ! Fais attention !', 'Ayiii! I kɔlɔsi!'],
  ['Ouille ! Doucement, chauffeur !', 'Ayo! Dɔɔnin dɔɔnin, shɔfɛri!'],
  ['Oh là là ! Tu conduis comment ?!', 'Ayiwa! I bɛ mobili bila cogo di?!'],
  ['Aii ! Mon dos !', 'Ayiii! Ne kɔ!'],
  ['Ralentis, s’il te plaît !', 'Dɔɔnin dɔɔnin, ni i sɔnna!'],
  ['Ralentis ! J’ai peur !', 'Dɔɔnin dɔɔnin! Ne bɛ siran!'],
  ['Doucement, doucement !', 'Dɔɔnin dɔɔnin, dɔɔnin dɔɔnin!'],
  ['Aii ! Pas si vite !', 'Ayiii! I kana teliya ten!'],
  ['Ralentis, on n’est pas pressés !', 'Dɔɔnin dɔɔnin, an tɛ teliya la!'],
  ['Allah ! Tu as renversé quelqu’un !', 'Ala! I ye mɔgɔ dɔ bugɔ!'],
  ['Aii ! Tu as touché quelqu’un !', 'Ayiii! I ye mɔgɔ dɔ bugɔ!'],
  ['Oh non ! Arrête-toi !', 'Ayi-ayi! I jɔ!'],
  ['Doucement, chauffeur !', 'Dɔɔnin dɔɔnin, shɔfɛri!'],
  ['Eh ! Ralentis !', 'He! Dɔɔnin dɔɔnin!'],
  ['Aii ! Ça secoue !', 'Ayiii! A bɛ an yɛrɛyɛrɛ!'],
  ['Tu conduis comme un fou !', 'I bɛ mobili bila i n’a fɔ mɔgɔ min ka hakili tɛ a la!'],
  ['Oh là là, doucement !', 'Ayiwa, dɔɔnin dɔɔnin!'],
  ['Aii ! Doucement dans les virages !', 'Ayiii! Dɔɔnin dɔɔnin sira lamini na!'],
  ['Ouh là ! Ça tourne trop vite !', 'Ayiwa! A bɛ wili teliya kosɛbɛ!'],
  // --- sotrama et passagers (sotrama.js, scenarios.js) ---
  ['Passagers', 'Taama mɔgɔw'], ['L’apprenti', 'Gaindé'],
  ['Bamako ! Bamako ! Monte, monte, il reste des places !', 'Bamakɔ! Bamakɔ! Don, don, yɔrɔ bɛ yen!'],
  ['Une place devant, une place derrière !', 'Yɔrɔ kelen bɛ ɲɛfɛ, yɔrɔ kelen bɛ kɔfɛ!'],
  ['Arrête-toi ! On descend, tu conduis trop mal !', 'Jɔ! An bɛ jigin, i bɛ mobili bila jugu!'],
  // --- engine.js ---
  ['Arrête-toi dans le cercle jaune', 'I jɔ sɛrikili nɛrɛmuguman kɔnɔ'],
  ['Le client a changé d’avis', 'Mɔgɔ ye a miiri yɛlɛma'],
  ['Mission annulée', 'Baara dabora'],
  // --- livraisons : marchandises (scenarios.js) ---
  ['Poulet braisé', 'Sisɛ jɛnnen'], ['Médicaments', 'Fura'], ['Attaya et pain', 'Ataya ni buru'], ['Dossiers', 'Sɛbɛnw'], ['Colis de la boutique', 'Butiki kolisi'],
  ['Sacs de charbon', 'Ɲɛgɛn sakɔw'], ['Bidons d’eau', 'Ji bidɔnw'], ['Légumes du marché', 'Sugu nakɔw'], ['Mil et arachides', 'Ŋɔ ni tiga'],
  ['Moutons de Tabaski', 'Sagadon sagaw'], ['Tomates du Grand Marché', 'Sugu belebele tomatiw'], ['Matériaux de chantier', 'Baarayɔrɔ fɛnw'],
  ['Sacs de ciment', 'Siman sakɔw'], ['Mangues de Sikasso', 'Sikaso mangorow'], ['Sacs de riz', 'Malo sakɔw'], ['Beurre de karité', 'Shi'],
  // --- livraisons : ce que disent l'expéditeur (give) et le destinataire (get) ---
  ['Voilà le poulet braisé du maquis, il doit arriver CHAUD ! Va vite, Jakarta !', 'A in ye sisɛ jɛnnen ye, a ka kan ka se yen a goni! Taa teliya, Jakarta!'],
  ['Hmm, encore chaud ! Que Dieu te le rende, voilà pour toi.', 'Hmm, a bɛ goni hali bi! Ala ka a sara i ye, a in ye i ta ye.'],
  ['Ordonnance urgente de la pharmacie. Ne traîne pas, c’est pour un malade !', 'Fura min ka kan ka teliya. I kana makɔnɔ, a ye banabagatɔ ta ye!'],
  ['Allah soit loué, tu es arrivé à temps. Merci beaucoup !', 'Ala ka tanu, i sera yan tuma na. I ni ce kosɛbɛ!'],
  ['Le thé et le pain pour les amis du grin. Attention, ça se renverse !', 'Ataya ni buru ye grɛn ɲɔgɔnw ta ye. I kɔlɔsi, a bɛ bin!'],
  ['Le thé est encore bien chaud, parfait pour le grin !', 'Ataya bɛ goni hali bi, a ka ɲi grɛn kama!'],
  ['Les dossiers à déposer à l’administration avant la fermeture !', 'Sɛbɛnw ka kan ka di adiminisirasiyɔn ma sani u ka da datugu!'],
  ['Parfait, c’est dans les temps. Merci, jeune homme !', 'A ka ɲi, i nana waati la. I ni ce, kamalen!'],
  ['Un colis de la boutique à livrer au client. Soigne-le bien !', 'Butiki kolisi min ka kan ka di mɔgɔ ma. I k’a kɔlɔsi ka ɲɛ!'],
  ['Mon colis ! Merci, c’était rapide !', 'Ne ta kolisi! I ni ce, a teliyara!'],
  ['Les sacs de charbon pour la vendeuse du quartier. C’est lourd, doucement !', 'Ɲɛgɛn sakɔw ye dugu kɔnɔ feerekɛmuso ta ye. A girinman, dɔɔnin dɔɔnin!'],
  ['Merci, avec ça je vais vendre toute la semaine.', 'I ni ce, ni nin ye ne bɛna feere dɔgɔkun bɛɛ.'],
  ['Des bidons d’eau pour la famille. Ne les renverse pas !', 'Ji bidɔnw ye du ta ye. I kana u bin!'],
  ['De l’eau fraîche, merci mon frère !', 'Ji sumaman, i ni ce n balima!'],
  ['Salades, tomates et oignons pour la vendeuse du marché. Ça se fane vite !', 'Salati ni tomati ni jaba ye sugu feerekɛmuso ta ye. A bɛ tiɲɛ teliya!'],
  ['Frais comme ce matin, merci !', 'A sumaman i n’a fɔ bi sɔgɔma, i ni ce!'],
  ['Mil et arachides à porter à la boutique. Bonne route !', 'Ŋɔ ni tiga ka kan ka taa butiki la. Sira ɲuman!'],
  ['Merci, ta livraison arrive au bon moment.', 'I ni ce, i ka na ni a nana waati ɲuman na.'],
  ['Deux beaux moutons pour la Tabaski ! Ne freine pas trop fort, ils sont nerveux.', 'Saga fila ɲumanw ye Sagadon ta ye! I kana jɔ ni fanga ye, u bɛ siran.'],
  ['Quels beaux moutons ! Que Dieu t’accorde une longue vie, voilà.', 'Saga ɲuman ye nin ye! Ala ka i ka ɲɛnamaya jan, a in ye i ta ye.'],
  ['Les caisses de tomates pour la revendeuse. Elles sont fragiles, hein !', 'Tomati kisɛw ye feerekɛmuso ta ye. U bɛ tiɲɛ teliya, i kɔlɔsi!'],
  ['Pas une tomate abîmée, bravo chauffeur !', 'Tomati kelen ma tiɲɛ, i ni ce shɔfɛri!'],
  ['Briques et fer à béton pour le chantier. Ça tient bien, tu peux rouler.', 'Biriki ni nɛgɛ ye baarayɔrɔ ta ye. A jɔlen bɛ, i bɛ se ka taa.'],
  ['Le maçon t’attendait. Merci, voilà ton argent.', 'Biriki-dilanna tun bɛ i makɔnɔ. I ni ce, i ta wari in ye.'],
  ['Du ciment pour le chantier de Bamako. La charge est bien arrimée, bonne route.', 'Siman ye Bamakɔ baarayɔrɔ ta ye. A sirilen bɛ ka ɲɛ, sira ɲuman.'],
  ['Le ciment est arrivé, les maçons peuvent travailler. Merci !', 'Siman sera yan, biriki-dilannaw bɛ se ka baara kɛ. I ni ce!'],
  ['Les mangues de Sikasso pour le marché. Elles mûrissent vite : roule sans secousses !', 'Sikaso mangorow ye sugu ta ye. U bɛ mɔ teliya: i kana u yɛrɛyɛrɛ!'],
  ['Magnifiques mangues, pas une de gâtée ! Voilà ton salaire.', 'Mangoro ɲumanw, kelen ma tiɲɛ! I ta sara in ye.'],
  ['Le riz de l’Office du Niger pour les grossistes. Charge lourde, prudence aux virages.', 'Ofisi di Nizɛri malo ye feerekɛla belebelew ta ye. A girinman, i kɔlɔsi sira lamini na.'],
  ['Le riz est bien arrivé. Merci, le grossiste est content.', 'Malo sera yan ka ɲɛ. I ni ce, feerekɛla nisɔndiyara.'],
  ['Les bidons de beurre de karité des coopératives de femmes. Ne les secoue pas.', 'Shi bidɔnw ye musow ka kooperatifu ta ye. I kana u yɛrɛyɛrɛ.'],
  ['Du beurre de karité de qualité, merci pour le transport !', 'Shi ɲuman, i ni ce taama kosɔn!'],
  ['Le client a annulé : tu es arrivé trop tard', 'Mɔgɔ ye a dabo: i nana a tuma kɔ.'],
];

// Phrases à trous. bm : modèle ({0}, {1}… = captures de re) ou fonction (match) -> modèle ; nested : indices de captures à traduire aussi.
const P = [
  { re: /^I ni ce ! C'est combien pour aller à (.+) \? \((.+) km\)$/, bm: 'I ni ce! Ka taa {0}, a ye joli ye? ({1} km)' },
  { re: /^Bonjour chauffeur, je suis pressé\. C'est combien pour (.+) \? \((.+) km\)$/, bm: 'I ni ce shɔfɛri, n bɛ teliya la. Ka taa {0}, a ye joli ye? ({1} km)' },
  { re: /^Accepter (.+)$/, bm: 'Ka sɔn {0}' },
  { re: /^(.+) arrive…$/, bm: '{0} bɛ na…' },
  { re: /^En route vers (.+)$/, bm: 'An bɛ taa {0}' },
  { re: /^(.+) est parti sans payer$/, bm: '{0} taara, a ma sara' },
  { re: /^(.+) a quitté le taxi$/, bm: '{0} bɔra taksi kɔnɔ' },
  { re: /^\+ (.+) · pourboire (.+)$/, bm: '+ {0} · pɔrubwari {1}' },
  { re: /^\+ (.+) · bonus rapidité$/, bm: '+ {0} · bɔnisi teliya ma' },
  { re: /^\+ (.+) · marchandise abîmée$/, bm: '+ {0} · fɛn tiɲɛna' },
  { re: /^Vite vite, ça part ! Direction (.+) !$/, bm: 'Teliya teliya, an bɛ taa! An bɛ taa {0}!' },
  { re: /^Prochain arrêt : (.+?)(?: !)?$/, bm: 'Jɔyɔrɔ nata: {0}' },
  { re: /^(.+) : (\d+) descendent(?:, (\d+) montent)?$/, bm: m => m[3] ? '{0} : mɔgɔ {1} jiginna, mɔgɔ {2} donna' : '{0} : mɔgɔ {1} jiginna' },
  { re: /^Ligne interrompue : les passagers sont descendus ?(?:\((.+) encaissés\))?\s*$/, bm: m => m[1] ? 'Sira jɔra: taama mɔgɔw jiginna ({0} sɔrɔla)' : 'Sira jɔra: taama mɔgɔw jiginna' },
  { re: /^Fin de ligne ! (.+?)(?: \+ (.+) de bonus)?$/, bm: m => m[2] ? 'Sira laban! {0} + bɔnisi {1}' : 'Sira laban! {0}' },
  { re: /^Les passagers râlent : (.+)$/, bm: 'Taama mɔgɔw bɛ kuma jugu: {0}', nested: [0] },
  { re: /^⚠ (.+) secoué\(es\) ! (\d+) %$/, bm: '⚠ {0} bɛ yɛrɛyɛrɛ! {1} %', nested: [0] },
  { re: /^(\S+) (.+) chargé\(es\) → (.+)$/, bm: 'An bɛ taa ni {0} {1} ye → {2}', nested: [1] },
  { re: /^(\S+) (.+) : tout est abîmé, le client refuse la livraison$/, bm: '{0} {1} : a bɛɛ tiɲɛna, mɔgɔ tɛ a sɔn', nested: [1] },
];

const EXACT = new Map(E.map(([fr, bm]) => [norm(fr), bm]));
const fill = (tpl, vals) => tpl.replace(/\{(\d+)\}/g, (_, i) => vals[+i] ?? '');

/** { text, spoken } : bambara si la langue des clients est « bm » et que la phrase est connue, sinon le texte tel quel */
export function tr(text) {
  if (typeof text !== 'string' || getLang() !== 'bm') return { text, spoken: text };
  const key = norm(text), hit = EXACT.get(key);
  if (hit) return { text: hit, spoken: phon(hit) };
  for (const p of P) {
    const m = key.match(p.re); if (!m) continue;
    const tpl = typeof p.bm === 'function' ? p.bm(m) : p.bm, vals = m.slice(1).filter((_, i) => i < 8), sv = vals.slice();
    for (const i of p.nested || []) if (vals[i] !== undefined) { const r = tr(vals[i]); vals[i] = r.text; sv[i] = r.spoken; }
    // les groupes optionnels non capturés sont retirés de la liste : on réaligne sur {0}, {1}… en sautant les undefined
    const dense = vals.filter(v => v !== undefined), denseS = sv.filter(v => v !== undefined);
    return { text: fill(tpl, dense), spoken: fill(phon(tpl), denseS) };
  }
  return { text, spoken: text };
}
export const trText = t => tr(t).text;

/** pour le document de relecture : toutes les phrases et modèles */
export const ENTRIES = { exact: E, patterns: P.map(p => ({ fr: String(p.re), bm: typeof p.bm === 'function' ? '(variable) ' + p.bm({ 1: 'x', 2: 'x', 3: 'x' }) : p.bm })) };
