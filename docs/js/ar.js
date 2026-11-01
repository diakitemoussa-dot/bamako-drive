// Réalité augmentée d'un lieu (vue du ciel) : aperçu 3D + bouton « Voir en AR ».
// Technologie choisie par <model-viewer> selon l'appareil : WebXR (Android Chrome), Scene Viewer (Android), Quick Look (iPhone / iPad, USDZ généré à la volée).
// Les modèles (un GLB par lieu, ~35 cm) sont produits par tools/build_ar_models.mjs dans data/ar/.
const $ = id => document.getElementById(id);
let index = null, mvLib = null, current = null;

/** liste des lieux disponibles en AR (data/ar/index.json) ; résolue une fois, vide si absente */
export function loadARIndex() {
  return index || (index = fetch('data/ar/index.json').then(r => r.ok ? r.json() : []).then(l => new Map(l.map(e => [e.name, e]))).catch(() => new Map()));
}
export async function hasAR(name) { return (await loadARIndex()).has(name); }

function loadViewer() {   // import dynamique : la bibliothèque (~1 Mo) n'est chargée qu'à la première ouverture
  return mvLib || (mvLib = import('model-viewer').catch(e => { mvLib = null; throw e; }));
}
function say(txt, bad) { const m = $('arMsg'); m.textContent = txt; m.classList.toggle('bad', !!bad); m.style.display = txt ? '' : 'none'; }

export async function openAR(name) {
  const entry = (await loadARIndex()).get(name); if (!entry) return;
  closeAR();
  const token = current = {};
  $('arName').textContent = name; $('arGo').disabled = true; say('Chargement du modèle 3D…'); $('arStage').replaceChildren(); $('arSheet').classList.remove('hidden'); $('explore').classList.add('arOn');
  try { await loadViewer(); } catch { if (current === token) say("Impossible de charger la réalité augmentée (connexion ?). Réessaie quand tu as du réseau.", true); return; }
  if (current !== token) return;
  const mv = document.createElement('model-viewer');
  mv.setAttribute('src', 'data/ar/' + entry.file); mv.setAttribute('alt', 'Modèle 3D : ' + name);
  mv.setAttribute('ar', ''); mv.setAttribute('ar-modes', 'webxr scene-viewer quick-look'); mv.setAttribute('ar-placement', 'floor'); mv.setAttribute('ar-scale', 'auto');
  mv.setAttribute('camera-controls', ''); mv.setAttribute('auto-rotate', ''); mv.setAttribute('shadow-intensity', '1'); mv.setAttribute('environment-image', 'neutral'); mv.setAttribute('exposure', '1.1');
  mv.setAttribute('interaction-prompt', 'none'); mv.setAttribute('loading', 'eager'); mv.setAttribute('touch-action', 'pan-y');
  mv.addEventListener('error', () => { if (current === token) say("Le modèle 3D n'a pas pu être chargé.", true); });
  mv.addEventListener('load', () => {
    if (current !== token) return;
    const ok = () => { const can = mv.canActivateAR; $('arGo').disabled = !can; say(can ? '' : "L'AR n'est pas disponible ici. Ouvre Bamako Drive sur ton iPhone (Safari) ou ton Android (Chrome) pour poser ce lieu sur ta table.", !can); };
    ok(); setTimeout(ok, 600);   // canActivateAR peut se résoudre juste après « load »
  });
  $('arGo').onclick = () => { if (mv.canActivateAR) mv.activateAR(); };
  $('arStage').appendChild(mv);
}
export function closeAR() { current = null; $('arStage').replaceChildren(); $('arSheet').classList.add('hidden'); $('explore').classList.remove('arOn'); }
export const arOpen = () => !$('arSheet').classList.contains('hidden');
