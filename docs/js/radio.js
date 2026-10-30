// In-car radio: Malian artists (Salif Keïta, Sidiki Diabaté, Oumou Sangaré, Djénéba Seck).
// Tracks are 30 s official previews from the public iTunes Search API (needs an internet connection; no music is bundled).
// Your own mp3 files: put them in  musique/  and list them in  musique/liste.json  -> [{"title":"...","artist":"...","url":"musique/fichier.mp3"}]  (station "Ma playlist").
const ARTISTS = [
  { id: 'salif', name: 'Salif Keïta', term: 'Salif Keita', key: 'salif keita' },
  { id: 'sidiki', name: 'Sidiki Diabaté', term: 'Sidiki Diabate', key: 'sidiki diabate' },
  { id: 'oumou', name: 'Oumou Sangaré', term: 'Oumou Sangare', key: 'oumou sangare' },
  { id: 'djeneba', name: 'Djénéba Seck', term: 'Djeneba Seck', key: 'djeneba seck' },
];
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ​]/g, '').toLowerCase();
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export class Radio {
  constructor() {
    this.audio = new Audio(); this.audio.preload = 'auto'; this.vol = 0.8; this.audio.volume = this.vol; this.station = null; this.queue = []; this.i = 0; this.on = false; this.err = 0; this.cache = new Map(); this.local = null; this.onChange = () => {}; this.status = '';
    this.audio.addEventListener('ended', () => this.next()); this.audio.addEventListener('error', () => { if (!this.on) return; if (++this.err > 6) { this.status = 'Pas de connexion : la radio a besoin d\'internet.'; this.stop(true); } else this.next(); });
    this.audio.addEventListener('playing', () => { this.err = 0; this.status = ''; this.onChange(); }); this.audio.addEventListener('waiting', () => { this.status = 'Chargement…'; this.onChange(); });
    this.audio.addEventListener('timeupdate', () => { const d = this.audio.duration, t = this.audio.currentTime; if (d && isFinite(d)) this.audio.volume = this.vol*Math.max(0, Math.min(1, (d - t)/1.5, 0.05 + t/0.8)); });   // soft fade in / out
  }
  async stations() { if (this.local === null) { try { const l = await fetch('musique/liste.json').then(r => r.ok ? r.json() : []); this.local = Array.isArray(l) ? l.filter(t => t && t.url) : []; } catch (e) { this.local = []; } } return [{ id: 'mix', name: 'Mix malien' }, ...ARTISTS.map(a => ({ id: a.id, name: a.name })), ...(this.local.length ? [{ id: 'local', name: 'Ma playlist' }] : [])]; }
  async _artistTracks(a) {
    if (this.cache.has(a.id)) return this.cache.get(a.id);
    const r = await fetch('https://itunes.apple.com/search?media=music&entity=song&limit=50&term=' + encodeURIComponent(a.term)); const j = await r.json(), seen = new Set(), out = [];
    for (const x of j.results || []) { if (!x.previewUrl || !norm(x.artistName).includes(a.key)) continue; const k = norm(x.trackName).replace(/\(.*?\)/g, '').trim(); if (seen.has(k)) continue; seen.add(k); out.push({ title: x.trackName, artist: x.artistName.replace(/​/g, ''), url: x.previewUrl }); }
    this.cache.set(a.id, out); return out;
  }
  async play(id) {
    this.station = id; this.on = true; this.err = 0; this.status = 'Chargement…'; this.audio.pause(); this.onChange();
    try {
      let q = [];
      if (id === 'local') q = this.local || [];
      else if (id === 'mix') { const all = await Promise.all(ARTISTS.map(a => this._artistTracks(a).catch(() => []))); q = all.flatMap(t => shuffle([...t]).slice(0, 12)); }
      else q = await this._artistTracks(ARTISTS.find(a => a.id === id));
      if (this.station !== id) return; this.queue = shuffle([...q]); this.i = -1; if (!this.queue.length) { this.status = 'Aucun morceau trouvé (vérifie ta connexion).'; this.on = false; this.onChange(); return; } this.next();
    } catch (e) { this.status = 'Pas de connexion : la radio a besoin d\'internet.'; this.on = false; this.onChange(); }
  }
  /** À appeler DIRECTEMENT dans le clic/toucher : iOS et Android n'autorisent le son que si lecture démarrée par un geste (le chargement des morceaux, lui, est asynchrone). */
  unlock() { if (this._unlocked) return; this._unlocked = true; const a = this.audio; a.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='; a.muted = true; const p = a.play(); const done = () => { a.muted = false; }; if (p && p.then) p.then(done, done); else done(); }
  _play() {
    const p = this.audio.play(); if (!p || !p.catch) return;
    p.catch(e => { if (!this.on || (e && e.name === 'AbortError')) return; this.status = 'Touche l’écran pour lancer la musique'; this.onChange(); const retry = () => { removeEventListener('pointerdown', retry, true); if (this.on) { this.status = ''; this._play(); this.onChange(); } }; addEventListener('pointerdown', retry, true); });
  }
  next() { if (!this.on || !this.queue.length) return; this.i = (this.i + 1) % this.queue.length; this.audio.muted = false; this.audio.src = this.queue[this.i].url; this.audio.volume = 0; this._play(); this.onChange(); }
  get track() { return this.on && this.i >= 0 ? this.queue[this.i] : null; }
  setVolume(v) { this.vol = Math.max(0, Math.min(1, v)); this.audio.volume = this.vol; }
  pause(on) { if (!this.on) return; if (on) this.audio.pause(); else this._play(); }
  stop(keepStatus) { this.on = false; this.station = null; this.audio.pause(); if (!keepStatus) this.status = ''; this.onChange(); }
}
