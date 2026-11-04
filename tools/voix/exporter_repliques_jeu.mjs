// Exporte les phrases bambara DÉJÀ présentes dans le jeu (js/missions/bambara.js) au format de repliques.csv,
// pour générer leurs voix : python generer_voix.py --csv repliques_jeu.csv
// Une voix n'est jouée que si son texte bambara est exactement celui affiché par le jeu : on part donc du texte du jeu.
// Usage : node tools/voix/exporter_repliques_jeu.mjs
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(ICI, '../..');
const tmp = path.join(os.tmpdir(), 'bm_export_' + process.pid + '.mjs'); fs.copyFileSync(path.join(ROOT, 'js/missions/bambara.js'), tmp); globalThis.localStorage = { getItem: () => 'bm', setItem() {} };
const { ENTRIES } = await import(pathToFileURL(tmp).href); fs.rmSync(tmp);
const VOIX = ['Bourama', 'Adama', 'Seydou', 'Amadou', 'Modibo', 'Moussa', 'Ngolo', 'Ibrahima', 'Amara', 'Bakary'];   // à répartir à ton goût (voir LISEZMOI.md)
const q = s => '"' + String(s).replace(/"/g, '""') + '"';
const phrases = ENTRIES.exact.filter(([fr, bm]) => /[.!?…]$/.test(fr.trim()) && /[.!?…]$/.test(bm.trim()));   // seulement les vraies phrases dites (pas les noms d'objets ni les libellés de boutons)
let csv = '﻿id,personnage,locuteur,texte_bambara,traduction_francais\n';
phrases.forEach(([fr, bm], i) => { csv += [`jeu_${String(i + 1).padStart(3, '0')}`, 'Jeu', VOIX[i % VOIX.length], q(bm), q(fr)].join(',') + '\n'; });
fs.writeFileSync(path.join(ICI, 'repliques_jeu.csv'), csv);
console.log(phrases.length + ' phrases du jeu -> tools/voix/repliques_jeu.csv');
