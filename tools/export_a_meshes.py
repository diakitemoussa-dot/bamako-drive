import bpy, numpy as np, math, json, collections
# ---- tile grid (three.js coordinates: x = Blender x, y = Blender z, z = -Blender y) ----
TILE = 250.0; TX0 = -2400.0; TZ0 = -2800.0; NX = 20; NZ = 22; QS = 0.02
CLS = {"Bamako_Mur_Banco": 1, "Cite_Mur": 1, "CHU_Mur": 1, "Bamako_Asphalte": 2, "Bamako_Route_Marquee": 2, "Bamako_Eau": 3, "NIGHT_Lampadaire": 4, "NIGHT_Balise": 7, "Bamako_Bordure_RB": 6}
CONST = {"Bamako_Terre": (0.64, 0.38, 0.22), "Bamako_Vegetation": (0.2, 0.36, 0.1), "Bamako_Talus": (0.6, 0.4, 0.25), "Bamako_Piste": (0.5, 0.37, 0.24), "Bamako_Terreplein": (0.74, 0.62, 0.6),
         "Bamako_Bordure": (0.78, 0.77, 0.73), "Lm_Globe": (0.1, 0.46, 0.52), "Mon_Pierre": (0.78, 0.7, 0.58), "Mem_Mur": (0.87, 0.81, 0.68), "Musee_Pierre": (0.58, 0.4, 0.33),
         "Bamako_Asphalte": (0.075, 0.075, 0.085), "Bamako_Route_Marquee": (0.09, 0.09, 0.1), "Bamako_Eau": (0.22, 0.2, 0.14), "Marche_Rose": (0.84, 0.67, 0.6), "CHU_Mur": (0.82, 0.63, 0.55),
         "Cite_Mur": (0.85, 0.76, 0.6), "Bamako_Bordure_RB": (0.8, 0.45, 0.42)}
TREE_PREF = ("Arbres_", "Foret_", "CICB_Arbres", "Memorial_Palmiers")
def is_skipped(o):
    n = o.name
    if o.type != 'MESH' or o.hide_viewport or o.hide_get() or not len(o.data.polygons): return True
    if n.startswith(("V0", "P0", "TL_", "Terrain_envelope")) or n.endswith(("_ax", "_leg")): return True
    if any(c.name == "Trafic_Anime" for c in o.users_collection): return True
    return n.startswith(TREE_PREF)
def mat_table(m):
    """-> (class, lut (256,3) or None, const rgb)"""
    nm = m.name; cls = CLS.get(nm, 5 if ("Verre" in nm or "Balcon" in nm) else 0)
    lut = None; const = CONST.get(nm)
    if m.use_nodes:
        attr = any(n.type == "ATTRIBUTE" and n.attribute_name == "bld_rnd" for n in m.node_tree.nodes)
        ramps = [n for n in m.node_tree.nodes if n.type == "VALTORGB"]
        if attr and ramps: lut = np.array([ramps[0].color_ramp.evaluate(i/255.0)[:3] for i in range(256)], np.float32)
        elif const is None and ramps:
            ev = np.array([ramps[0].color_ramp.evaluate(t)[:3] for t in (0.25, 0.5, 0.75)], np.float32); const = tuple(ev.mean(0))
        if const is None:
            b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if b is not None and not b.inputs["Base Color"].is_linked: const = tuple(b.inputs["Base Color"].default_value[:3])
    if const is None and lut is None: const = tuple(m.diffuse_color[:3])
    return cls, lut, const
def srgb(c): return np.where(c <= 0.0031308, c*12.92, 1.055*np.power(np.maximum(c, 1e-6), 1/2.4) - 0.055)
tiles = collections.defaultdict(lambda: {"pos": [], "col": [], "kpos": [], "kcol": [], "kv": []})
stats = collections.Counter(); matcache = {}
rng = np.random.default_rng(3)
for o in bpy.data.objects:
    if is_skipped(o): continue
    me = o.data; me.calc_loop_triangles(); nt = len(me.loop_triangles)
    if nt == 0: continue
    tv = np.empty(nt*3, np.int32); me.loop_triangles.foreach_get("vertices", tv); tv = tv.reshape(-1, 3)
    tp = np.empty(nt, np.int32); me.loop_triangles.foreach_get("polygon_index", tp)
    nv = len(me.vertices); co = np.empty(nv*3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    M = np.array(o.matrix_world); co = co @ M[:3, :3].T + M[:3, 3]
    mi = np.empty(len(me.polygons), np.int32); me.polygons.foreach_get("material_index", mi); tmi = mi[tp]
    rnd = None
    if "bld_rnd" in me.attributes:
        rnd = np.empty(len(me.polygons), np.float32); me.attributes["bld_rnd"].data.foreach_get("value", rnd); trnd = rnd[tp]
    uv = None
    if me.uv_layers.active is not None and any(m is not None and m.name == "Bamako_Bordure_RB" for m in me.materials):
        lu = np.empty(len(me.loops)*2, np.float32); me.uv_layers.active.data.foreach_get("uv", lu); lu = lu.reshape(-1, 2)[:, 1]
        lt = np.empty(nt*3, np.int32); me.loop_triangles.foreach_get("loops", lt); tuv = lu[lt.reshape(-1, 3)]; uv = True
    for k, m in enumerate(me.materials):
        if m is None: continue
        sel = np.nonzero(tmi == k)[0]
        if len(sel) == 0: continue
        if m.name not in matcache: matcache[m.name] = mat_table(m)
        cls, lut, const = matcache[m.name]
        P = co[tv[sel]]                                                  # (n,3,3) blender xyz
        T = np.stack([P[..., 0], P[..., 2], -P[..., 1]], axis=-1)        # -> three xyz (y up)
        if lut is not None and rnd is not None: base = lut[np.clip((trnd[sel]*255).astype(np.int32), 0, 255)]
        elif lut is not None: base = np.tile(lut[128], (len(sel), 1))
        else: base = np.tile(np.array(const, np.float32), (len(sel), 1))
        jit = 1.0 + (rng.random((len(sel), 1)).astype(np.float32) - 0.5)*(0.16 if cls in (0, 2) else 0.07)
        col = np.clip(srgb(np.clip(base*jit, 0, 1)), 0, 1)
        cen = T.mean(1); ix = np.floor((cen[:, 0] - TX0)/TILE).astype(np.int32); iz = np.floor((cen[:, 2] - TZ0)/TILE).astype(np.int32)
        ok = (ix >= 0) & (ix < NX) & (iz >= 0) & (iz < NZ)
        key = ix*100 + iz
        for kk in np.unique(key[ok]):
            s2 = np.nonzero(ok & (key == kk))[0]; d = tiles[(int(kk)//100, int(kk) % 100)]
            if cls == 6 and uv is not None or (cls == 6):
                d["kpos"].append(T[s2]); d["kcol"].append(col[s2])
                if uv is not None: v = tuv[sel][s2]; v = v - np.floor(v.min(1, keepdims=True)/3.0)*3.0; d["kv"].append(v.astype(np.float32))
                else: d["kv"].append(np.zeros((len(s2), 3), np.float32))
            else:
                a = np.full((len(s2), 3, 1), cls/255.0, np.float32); d["pos"].append(T[s2]); d["col"].append(np.concatenate([np.repeat(col[s2][:, None, :], 3, axis=1), a], axis=2))
        stats[o.name.rsplit("_", 2)[0] if o.name[-1].isdigit() else o.name] += int(ok.sum())
bpy.app.driver_namespace["game_tiles"] = tiles
tot = sum(sum(len(a) for a in d["pos"]) + sum(len(a) for a in d["kpos"]) for d in tiles.values())
print("tiles with geometry:", len(tiles), "| triangles exported:", tot)
print("top sources:", stats.most_common(8))
