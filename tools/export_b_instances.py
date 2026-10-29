import bpy, numpy as np, collections
TILE = 250.0; TX0 = -2400.0; TZ0 = -2800.0; NX = 20; NZ = 22
def islands(me):
    n = len(me.vertices); parent = np.arange(n)
    ev = np.empty(len(me.edges)*2, np.int64); me.edges.foreach_get("vertices", ev); ev = ev.reshape(-1, 2)
    def find(a):
        while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for a, b in ev:
        ra, rb = find(a), find(b)
        if ra != rb: parent[rb] = ra
    roots = np.array([find(i) for i in range(n)]); order = np.argsort(roots, kind="stable"); cuts = np.nonzero(np.diff(roots[order]))[0] + 1
    return np.split(order, cuts)
trees = []     # x, y(base), z, trunkH, crownH, crownR  (three coords)
for o in bpy.data.objects:
    if o.type != 'MESH' or o.hide_viewport or not o.name.startswith(("Arbres_", "Foret_", "CICB_Arbres", "Memorial_Palmiers")) or not len(o.data.vertices): continue
    me = o.data; T = np.array(o.matrix_world.translation)
    co = np.empty(len(me.vertices)*3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3) + T
    gs = islands(me); crowns = []; trunks = []
    for g in gs:
        P = co[g]
        if len(g) == 6 and (P[:, 2].max() - P[:, 2].min()) < 4.0 and np.ptp(P[:, 0]) < 0.8: trunks.append((P[:, 0].mean(), P[:, 1].mean(), P[:, 2].min(), P[:, 2].max()))
        elif len(g) >= 6: crowns.append((P[:, 0].mean(), P[:, 1].mean(), P[:, 2].min(), P[:, 2].max(), max(np.ptp(P[:, 0]), np.ptp(P[:, 1]))/2))
    if not crowns: continue
    from collections import defaultdict
    grid = defaultdict(list)
    for t in trunks: grid[(int(t[0]//2), int(t[1]//2))].append(t)
    for c in crowns:
        best = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for t in grid.get((int(c[0]//2) + dx, int(c[1]//2) + dy), ()):
                    d = (t[0] - c[0])**2 + (t[1] - c[1])**2
                    if d < 0.5 and (best is None or d < best[0]): best = (d, t)
        base = best[1][2] if best else c[2] - 2.1
        trees.append((c[0], base - 0.05, -c[1], max(0.8, c[2] + 0.5 - base), max(1.5, c[3] - c[2]), max(0.8, c[4])))
trees = np.array(trees, np.float32)
print("trees:", len(trees), "| mean trunk", round(float(trees[:, 3].mean()), 2), "crown h", round(float(trees[:, 4].mean()), 2), "r", round(float(trees[:, 5].mean()), 2))
# ---- lamp heads (emissive faces of the street lamps)
lamps = []
for nm in ("Lampadaires", "Ponts_Equipements"):
    o = bpy.data.objects.get(nm)
    if not o: continue
    me = o.data; idx = [i for i, m in enumerate(me.materials) if m is not None and m.name == "NIGHT_Lampadaire"]
    if not idx: continue
    mi = np.empty(len(me.polygons), np.int32); me.polygons.foreach_get("material_index", mi); sel = np.nonzero(np.isin(mi, idx))[0]
    cen = np.empty(len(me.polygons)*3, np.float32); me.polygons.foreach_get("center", cen); cen = cen.reshape(-1, 3)[sel]
    seen = set()
    for c in cen:
        k = (int(c[0]/1.6), int(c[1]/1.6), int(c[2]/1.0))
        if k in seen: continue
        seen.add(k); lamps.append((c[0], c[2], -c[1]))
lamps = np.array(lamps, np.float32); print("lamp heads:", len(lamps))
bpy.app.driver_namespace["game_trees"] = trees; bpy.app.driver_namespace["game_lamps"] = lamps

# ---- colliders: thin vertical poles (street lamps, bridge lamps) -> circles [x, z, r, y0, y1] in three coordinates
cols = []
for nm in ("Lampadaires", "Ponts_Equipements"):
    o = bpy.data.objects.get(nm)
    if not o or not len(o.data.vertices): continue
    me = o.data; T = np.array(o.matrix_world.translation); co = np.empty(len(me.vertices)*3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3) + T
    for g in islands(me):
        P = co[g]; sx, sy, sz = np.ptp(P[:, 0]), np.ptp(P[:, 1]), np.ptp(P[:, 2])
        if sz > 6.0 and sx < 0.9 and sy < 0.9: cols.append((float(P[:, 0].mean()), float(-P[:, 1].mean()), float(max(sx, sy)*0.5 + 0.1), float(P[:, 2].min()), float(P[:, 2].max())))
cols = np.array(cols, np.float32); bpy.app.driver_namespace["game_cols"] = cols
print("pole colliders:", len(cols))

# ---- bridge railings: steel rails -> rows of circles (r 0.5) every 1.4 m, so the car stays on the bridge
rails = []; seen_r = set()
for nm in ("Ponts", "Ponts_Rampes"):
    o = bpy.data.objects.get(nm)
    if not o or not len(o.data.vertices): continue
    me = o.data; mats = [m.name if m else "" for m in me.materials]; wi = [i for i, n in enumerate(mats) if n == "Pont_Acier"]
    if not wi: continue
    T = np.array(o.matrix_world.translation); co = np.empty(len(me.vertices)*3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3) + T
    mi = np.empty(len(me.polygons), np.int32); me.polygons.foreach_get("material_index", mi); keepv = set()
    for p, m in zip(me.polygons, mi):
        if m in wi: keepv.update(p.vertices)
    for g in islands(me):
        if not keepv.intersection(g.tolist()[:3]): continue
        P = co[g]; xy = P[:, :2]; c = xy.mean(0); u, s, vt = np.linalg.svd(xy - c, full_matrices=False); ax = vt[0]; ext = (xy - c) @ ax; L = ext.max() - ext.min()
        if L < 1.5 or np.ptp(P[:, 2]) > 0.2: continue
        n = max(2, int(L/1.4) + 1)
        for k in range(n):
            q = c + ax*(ext.min() + (ext.max() - ext.min())*k/(n - 1)); key = (round(float(q[0])/0.7), round(float(q[1])/0.7))
            if key in seen_r: continue
            seen_r.add(key); rails.append((float(q[0]), float(-q[1]), 0.5, float(P[:, 2].min()) - 1.2, float(P[:, 2].max())))
rails = np.array(rails, np.float32).reshape(-1, 5); cols = bpy.app.driver_namespace["game_cols"][:447] if len(bpy.app.driver_namespace["game_cols"]) >= 447 else bpy.app.driver_namespace["game_cols"]
cols = np.concatenate([cols, rails]) if len(rails) else cols; bpy.app.driver_namespace["game_cols"] = cols
print("bridge railing circles:", len(rails), "| total colliders:", len(cols))
