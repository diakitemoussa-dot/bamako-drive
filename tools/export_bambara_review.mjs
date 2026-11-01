// Génère docs/bambara_a_relire.md : toutes les phrases des clients (français -> bambara) pour relecture par un locuteur natif.
// Usage : node tools/export_bambara_review.mjs
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = path.join(os.tmpdir(), 'bambara_review_' + process.pid + '.mjs');
fs.copyFileSync(path.join(ROOT, 'js/missions/bambara.js'), tmp); globalThis.localStorage = { getItem: () => 'bm', setItem() {} };
const { ENTRIES, phon } = await import(pathToFileURL(tmp).href); fs.rmSync(tmp);
const esc = s => String(s).replace(/\|/g, '\|');
let md = `# Bambara des clients — à faire relire\n\nTraduction écrite **sans locuteur natif** : chaque ligne est à vérifier (sens, naturel, orthographe, tons).\nPour corriger : modifier la ligne dans \`js/missions/bambara.js\` (tableau \`E\` pour les phrases, \`P\` pour les phrases à trous), puis relancer ce script.\n\nLa colonne « Lue par la voix » est la même phrase écrite pour que la voix française la prononce (≈ approximation).\n\n## Phrases\n\n| Français | Bambara | Lue par la voix |\n|---|---|---|\n`;
for (const [fr, bm] of ENTRIES.exact) md += `| ${esc(fr)} | ${esc(bm)} | ${esc(phon(bm))} |\n`;
md += `\n## Phrases à trous (les {0}, {1}… sont remplacés par un nom, un lieu, un prix ou un nombre)\n\n| Motif français | Bambara |\n|---|---|\n`;
for (const p of ENTRIES.patterns) md += `| \`${esc(p.fr)}\` | ${esc(p.bm)} |\n`;
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'docs/bambara_a_relire.md'), md);
console.log('docs/bambara_a_relire.md :', ENTRIES.exact.length, 'phrases,', ENTRIES.patterns.length, 'modèles');
