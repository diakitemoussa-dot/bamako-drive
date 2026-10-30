// Relais Cloudflare Worker : le jeu parle à ce relais, qui seul connaît la clé secrète Notion.
// Variables à définir : NOTION_TOKEN (secret), DB_ID (id de la base « Bamako Drive — Joueurs »).
const ORIGINS = ['https://diakitemoussa-dot.github.io', 'http://localhost:8080', 'http://127.0.0.1:8080'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTION = 'https://api.notion.com/v1/';

const cors = (req) => { const o = req.headers.get('Origin'); return { 'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' }; };
const json = (req, data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors(req) } });
const notion = (env, path, body) => fetch(NOTION + path, { method: 'POST', headers: { 'Authorization': 'Bearer ' + env.NOTION_TOKEN, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.message || r.status); return j; });
const patch = (env, id, body) => fetch(NOTION + 'pages/' + id, { method: 'PATCH', headers: { 'Authorization': 'Bearer ' + env.NOTION_TOKEN, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.message || r.status); return j; });
const text = (p) => (p && p.rich_text ? p.rich_text.map(t => t.plain_text).join('') : '');
const find = async (env, id) => (await notion(env, 'databases/' + env.DB_ID + '/query', { filter: { property: 'ID appareil', rich_text: { equals: id } }, page_size: 1 })).results[0];
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

async function bump(env, page, device) {
  const n = (page.properties['Nombre de fois'].number || 0) + 1;
  await patch(env, page.id, { properties: { 'Nombre de fois': { number: n }, 'Dernière visite': { date: { start: new Date().toISOString() } }, ...(device ? { 'Appareil': { rich_text: [{ text: { content: device } }] } } : {}) } });
  return { known: true, name: page.properties['Nom'].title.map(t => t.plain_text).join(''), count: n };
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    if (req.method !== 'POST') return json(req, { error: 'POST uniquement' }, 405);
    if (!ORIGINS.includes(req.headers.get('Origin'))) return json(req, { error: 'origine refusée' }, 403);
    const path = new URL(req.url).pathname; let b; try { b = await req.json(); } catch { return json(req, { error: 'JSON invalide' }, 400); }
    const id = String(b.id || ''); if (!UUID.test(id)) return json(req, { error: 'id invalide' }, 400); const device = clean(b.device, 60);
    try {
      const page = await find(env, id);
      // /visit : le joueur ouvre le jeu. S'il est connu, +1 ; sinon le jeu demandera son nom.
      if (path === '/visit') return json(req, page ? await bump(env, page, device) : { known: false });
      // /register : premier nom de ce joueur (compté comme sa 1re entrée). Si l'appareil existe déjà, +1 seulement.
      if (path === '/register') {
        if (page) return json(req, await bump(env, page, device));
        const name = clean(b.name, 40); if (name.length < 2) return json(req, { error: 'nom trop court' }, 400); const now = new Date().toISOString();
        await notion(env, 'pages', { parent: { database_id: env.DB_ID }, properties: { 'Nom': { title: [{ text: { content: name } }] }, 'ID appareil': { rich_text: [{ text: { content: id } }] }, 'Nombre de fois': { number: 1 }, 'Première visite': { date: { start: now } }, 'Dernière visite': { date: { start: now } }, 'Appareil': { rich_text: [{ text: { content: device } }] } } });
        return json(req, { known: true, name, count: 1 });
      }
      return json(req, { error: 'route inconnue' }, 404);
    } catch (e) { return json(req, { error: 'indisponible' }, 502); }
  }
};
