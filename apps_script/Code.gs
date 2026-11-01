// Relais Google Apps Script : le jeu envoie ici (1) le joueur → onglet « Joueurs », (2) ses retours sur le jeu → onglet « Retours ».
// Joueurs : Nom | ID appareil | Nombre de fois | Première visite | Dernière visite | Appareil
// Retours : Date | Nom | Note | Catégorie | Message | Véhicule | Lieu | Heure du jeu | Qualité | FPS | Appareil | Écran | Position | Version | Argent (FCFA) | ID appareil
var FEUILLE = 'Joueurs';
var FEUILLE_RETOURS = 'Retours';
var CATEGORIES = ['Conduite', 'Missions', 'Graphismes', 'Performance', 'Bug', 'Idée', 'Autre'];
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function propre(s, n) { return String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/^[=+@-]+/, '').trim().slice(0, n); }   // retire aussi les débuts de formule (=, +, @, -)
function reponse(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function feuille() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(FEUILLE) || ss.insertSheet(FEUILLE);
  if (sh.getLastRow() === 0) { sh.appendRow(['Nom', 'ID appareil', 'Nombre de fois', 'Première visite', 'Dernière visite', 'Appareil']); sh.setFrozenRows(1); }
  return sh;
}

function feuilleRetours() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(FEUILLE_RETOURS) || ss.insertSheet(FEUILLE_RETOURS);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['Date', 'Nom', 'Note', 'Catégorie', 'Message', 'Véhicule', 'Lieu', 'Heure du jeu', 'Qualité', 'FPS', 'Appareil', 'Écran', 'Position', 'Version', 'Argent (FCFA)', 'ID appareil', 'Déclencheur', 'Durée de jeu (min)', 'Erreurs récentes']);
    sh.setFrozenRows(1); sh.getRange(1, 1, 1, 19).setFontWeight('bold').setBackground('#55415D').setFontColor('#F8F3EA');
    sh.setColumnWidth(5, 420); sh.getRange(2, 5, 1000, 1).setWrap(true);
  }
  return sh;
}

// Enregistre un retour (une ligne par retour). Limite : 1 retour toutes les 4 s par appareil, message ≤ 600 caractères.
function retour(b, id) {
  var cache = CacheService.getScriptCache(); if (cache.get('fb_' + id)) return { error: 'trop rapide' };
  var note = Math.round(Number(b.rating)); if (!(note >= 1 && note <= 5)) return { error: 'note invalide' };
  var cat = propre(b.category, 20), msg = propre(b.message, 600), c = b.ctx || {};
  if (CATEGORIES.indexOf(cat) < 0) cat = 'Autre';
  feuilleRetours().appendRow([new Date(), propre(b.name, 40), note, cat, msg, propre(c.vehicle, 30), propre(c.place, 60), propre(c.time, 12), propre(c.quality, 12), Math.round(Number(c.fps)) || '', propre(b.device, 60), propre(c.screen, 20), propre(c.pos, 24), propre(c.version, 20), Math.round(Number(c.cash)) || 0, id, propre(b.trigger, 30), Math.round(Number(c.minutes)) || 0, propre(c.errors, 250)]);
  cache.put('fb_' + id, '1', 4); return { ok: true };
}

function doPost(e) {
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var b = JSON.parse(e.postData.contents), id = String(b.id || ''), action = String(b.action || ''), device = propre(b.device, 60);
    if (!UUID.test(id)) return reponse({ error: 'id invalide' });
    if (action === 'feedback') return reponse(retour(b, id));
    var sh = feuille(), n = sh.getLastRow(), ids = n > 1 ? sh.getRange(2, 2, n - 1, 1).getValues() : [], row = -1, now = new Date();
    for (var i = 0; i < ids.length; i++) if (ids[i][0] === id) { row = i + 2; break; }
    function bump() {
      var count = (Number(sh.getRange(row, 3).getValue()) || 0) + 1;
      sh.getRange(row, 3).setValue(count); sh.getRange(row, 5).setValue(now); if (device) sh.getRange(row, 6).setValue(device);
      return { known: true, name: String(sh.getRange(row, 1).getValue()), count: count };
    }
    if (action === 'visit') return reponse(row > 0 ? bump() : { known: false });
    if (action === 'register') {
      if (row > 0) return reponse(bump());
      var name = propre(b.name, 40); if (name.length < 2) return reponse({ error: 'nom trop court' });
      sh.appendRow([name, id, 1, now, now, device]); return reponse({ known: true, name: name, count: 1 });
    }
    return reponse({ error: 'action inconnue' });
  } catch (err) { return reponse({ error: 'indisponible' }); } finally { lock.releaseLock(); }
}

function doGet() { return reponse({ ok: true }); }   // test dans le navigateur : doit afficher {"ok":true}
