// Code de la route pour la circulation IA (installé sur Traffic.prototype) :
//  - panneaux STOP : arrêt complet à la ligne (≥ 1,2 s), puis passage seulement si aucune voiture n'arrive des autres branches ;
//  - panneaux « Cédez le passage » : ralentir avant le carrefour, laisser passer ceux qui arrivent ;
//  - passages piétons sans feu : des piétons y traversent quand la voie est libre, les voitures s'arrêtent pour eux ;
//  - piétons sur la chaussée : toute voiture freine si un piéton est devant elle.
const rnd = (a, b) => a + Math.random()*(b - a);
export function installRules(T) {
  const P = T.prototype;
  /** associe chaque panneau STOP / Cédez le passage à la voie qui arrive au carrefour, et crée les passages piétons sans feu */
  P._buildRules = function () {
    if (this._rulesDone || !this.signList) return; this._rulesDone = true;
    const g = this.g, rule = new Map(), zebras = [];
    for (const s of this.signList) {
      const [sx, sz, fx, fz, type] = s;
      if (type === 'stop' || type === 'yield') {
        for (const e of g.edges) {
          if (e.rank < 1 || e.level !== 0 || this.edgeSig.has(e.id)) continue;
          const k = e.n - 1, ex = g.px(e, k), ez = g.pz(e, k); if ((ex - sx)**2 + (ez - sz)**2 > 28*28) continue;
          const h = g.heading(e, Math.max(0, k - 1)), dot = Math.cos(h)*fx + Math.sin(h)*fz; if (Math.abs(dot) < 0.7) continue;   // la voie est dans l'axe du panneau
          let near = 1e9; for (let i = Math.max(0, k - 12); i <= k; i++) near = Math.min(near, Math.hypot(g.px(e, i) - sx, g.pz(e, i) - sz));
          if (near > 8) continue;
          if (type === 'stop' || rule.get(e.id) !== 'stop') rule.set(e.id, type);
        }
      } else if (type === 'cross') {
        const n = g.nearest(sx, sz, 12, e => e.rank >= 1 && e.level === 0); if (!n) continue;
        const e = n.edge, h = g.heading(e, n.i), x = g.px(e, n.i), z = g.pz(e, n.i);
        if (this.edgeSig.has(e.id) || zebras.some(q => Math.hypot(q.x - x, q.z - z) < 25)) continue;
        zebras.push({ node: null, x, z, T: [Math.cos(h), Math.sin(h)], Rn: [-Math.sin(h), Math.cos(h)] });
      }
    }
    this.edgeRule = rule; this.zebras = zebras;
    if (this.xwalks) this.xwalks.push(...zebras);
  };
  /** distance libre jusqu'au premier piéton devant la voiture (sur sa trajectoire), ou null */
  P.pedAhead = function (ag) {
    if (!this.peds) return null; const c = Math.cos(ag.ang), s = Math.sin(ag.ang), look = 8 + ag.v*2.2; let best = null;
    for (const pd of this.peds) {
      if (pd.mode === 'off' || pd.mode === 'hit') continue; const dx = pd.x - ag.x, dz = pd.z - ag.z; if (dx*dx + dz*dz > (look + 6)**2) continue;
      const fwd = dx*c + dz*s, lat = -dx*s + dz*c; if (fwd < ag.len*0.5 || fwd > look) continue;
      const wide = pd.mode === 'cross' || pd.mode === 'zcross' ? 3.2 : 1.6;   // un piéton qui traverse : on garde de la marge
      if (Math.abs(lat - ag.lat) > wide) continue;
      const gp = fwd - ag.len*0.5 - 2.2; if (best === null || gp < best) best = gp;
    }
    return best;
  };
  /** arrêt au STOP / ralentissement au cédez-le-passage : renvoie { gap, vcap } (ou null) pour la voiture sur la pièce Pc */
  P.ruleGate = function (ag, Pc, dt) {
    if (!this.edgeRule || Pc.edge === null) return null; const r = this.edgeRule.get(Pc.edge); if (!r) return null;
    const line = Pc.b - ag.s - 1.0 - ag.len*0.5; if (line > 45) return null;
    if (r === 'stop') {
      if (ag.stopP === Pc) return null;                                     // déjà marqué l'arrêt sur cette voie
      if (line < ag.s0 + 1.3 && ag.v < 0.35) { ag.stopW = (ag.stopW || 0) + dt; if (ag.stopW > 1.2) { ag.stopP = Pc; ag.stopW = 0; return null; } }
      return { gap: Math.max(line, 0.05), vcap: null };
    }
    return { gap: null, vcap: 3.5 + Math.max(0, line)*0.45 };                // cédez le passage : arrivée lente
  };
  /** une voie STOP / cédez-le-passage n'entre que si aucune voiture prioritaire n'arrive dans les prochaines secondes (l'exigence baisse avec l'attente) */
  P.ruleClear = function (ag, A) {
    if (!this.edgeRule || A.edge === null || !this.edgeRule.has(A.edge)) return true;
    const waited = ag._rwP === A ? this.t - ag._rw0 : 0, horizon = waited > 10 ? 1.8 : waited > 5 ? 3.0 : 4.5; let blocked = false;
    for (const ei of this.g.inn.get(A.node) || []) {
      if (ei === A.edge || this.edgeRule.has(ei) || blocked) continue; const Q = this.pieces.get('e' + ei); if (!Q) continue;   // les autres voies à STOP ne se bloquent pas entre elles
      for (const o of Q.agents) { const d = Q.b - o.s; if (d < 38 && o.v > 0.8 && d/Math.max(o.v, 1.5) < horizon) { blocked = true; break; } }
    }
    const p = this.player; if (!blocked && p && p.speed > 1) { const nd = this.g.nodes[A.node]; if (nd) { const d = Math.hypot(p.x - nd[0], p.z - nd[1]); if (d < 38 && d/p.speed < horizon) blocked = true; } }   // le joueur arrive aussi
    if (blocked) { if (ag._rwP !== A) { ag._rwP = A; ag._rw0 = this.t; } return false; }
    ag._rwP = null; return true;
  };
  /** passage piéton sans feu : libre si aucune voiture rapide n'est à moins de 22 m */
  P.zebraClear = function (xw) {
    for (const ag of this.agents) { if (!ag.piece) continue; const d = (ag.x - xw.x)**2 + (ag.z - xw.z)**2; if (d < 22*22 && ag.v > 2.5) return false; }
    const p = this.player; if (p && p.speed > 2.5 && (p.x - xw.x)**2 + (p.z - xw.z)**2 < 22*22) return false;
    return true;
  };
}
export { rnd };
