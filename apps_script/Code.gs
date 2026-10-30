// Relais Google Apps Script : le jeu envoie le joueur ici, le script écrit dans le tableur lié (onglet « Joueurs »).
// Colonnes : Nom | ID appareil | Nombre de fois | Première visite | Dernière visite | Appareil
var FEUILLE = 'Joueurs';
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function propre(s, n) { return String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/^[=+@-]+/, '').trim().slice(0, n); }   // retire aussi les débuts de formule (=, +, @, -)
function reponse(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function feuille() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(FEUILLE) || ss.insertSheet(FEUILLE);
  if (sh.getLastRow() === 0) { sh.appendRow(['Nom', 'ID appareil', 'Nombre de fois', 'Première visite', 'Dernière visite', 'Appareil']); sh.setFrozenRows(1); }
  return sh;
}

function doPost(e) {
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var b = JSON.parse(e.postData.contents), id = String(b.id || ''), action = String(b.action || ''), device = propre(b.device, 60);
    if (!UUID.test(id)) return reponse({ error: 'id invalide' });
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
