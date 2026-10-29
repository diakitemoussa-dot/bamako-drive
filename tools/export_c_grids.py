import bpy, numpy as np, time
TILE = 250.0; TX0 = -2400.0; TZ0 = -2800.0; NX = 20; NZ = 22
GH = 2.5; HX = NX*100 + 1; HZ = NZ*100 + 1          # height grid (2.5 m)
GS = 2.0; SX = NX*125; SZ = NZ*125                   # solid grid (2 m)
def tris_of(o, up=True):
    me = o.data; me.calc_loop_triangles(); nt = len(me.loop_triangles)
    if nt == 0: return np.zeros((0, 3, 3), np.float32)
    tv = np.empty(nt*3, np.int32); me.loop_triangles.foreach_get("vertices", tv); tv = tv.reshape(-1, 3)
    co = np.empty(len(me.vertices)*3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    M = np.array(o.matrix_world); co = co @ M[:3, :3].T + M[:3, 3]; P = co[tv]; T = np.stack([P[..., 0], P[..., 2], -P[..., 1]], axis=-1)
    if up:
        e1 = T[:, 1] - T[:, 0]; e2 = T[:, 2] - T[:, 0]; ny = e1[:, 2]*e2[:, 0] - e1[:, 0]*e2[:, 2]
        T = T[ny > 0.05*np.abs(ny).max()] if False else T[np.abs(ny) > 1e-6][ny[np.abs(ny) > 1e-6] > 0]
    return T
def raster(T, x0, z0, cell, nx, nz, fn):
    """call fn(ix, iz, y) for every grid sample covered by each triangle (barycentric y)"""
    for t in T:
        xs = t[:, 0]; zs = t[:, 2]
        i0 = max(int(np.ceil((xs.min() - x0)/cell)), 0); i1 = min(int(np.floor((xs.max() - x0)/cell)), nx - 1)
        j0 = max(int(np.ceil((zs.min() - z0)/cell)), 0); j1 = min(int(np.floor((zs.max() - z0)/cell)), nz - 1)
        if i1 < i0 or j1 < j0: continue
        gx, gz = np.meshgrid(np.arange(i0, i1 + 1), np.arange(j0, j1 + 1), indexing="ij"); px = x0 + gx*cell; pz = z0 + gz*cell
        d = (t[1, 2] - t[2, 2])*(t[0, 0] - t[2, 0]) + (t[2, 0] - t[1, 0])*(t[0, 2] - t[2, 2])
        if abs(d) < 1e-9: continue
        a = ((t[1, 2] - t[2, 2])*(px - t[2, 0]) + (t[2, 0] - t[1, 0])*(pz - t[2, 2]))/d
        b = ((t[2, 2] - t[0, 2])*(px - t[2, 0]) + (t[0, 0] - t[2, 0])*(pz - t[2, 2]))/d; c = 1 - a - b
        m = (a >= -1e-4) & (b >= -1e-4) & (c >= -1e-4)
        if m.any(): fn(gx[m], gz[m], a[m]*t[0, 1] + b[m]*t[1, 1] + c[m]*t[2, 1])
t0 = time.time(); NEG = -1e9
terr = np.full((HX, HZ), NEG, np.float32)
def f_terr(ix, iz, y): terr[ix, iz] = np.maximum(terr[ix, iz], y)
for nm in ("Terrain", "Fleuve_Berges"):
    o = bpy.data.objects.get(nm)
    if o: raster(tris_of(o), TX0, TZ0, GH, HX, HZ, f_terr)
hole = terr < -1e8; print("terrain raster:", round(time.time() - t0, 1), "s | empty samples:", int(hole.sum()))
for _ in range(60):                                # fill the few holes from their neighbours
    if not hole.any(): break
    pad = np.pad(np.where(hole, np.nan, terr), 1, constant_values=np.nan)
    nb = np.stack([pad[:-2, 1:-1], pad[2:, 1:-1], pad[1:-1, :-2], pad[1:-1, 2:]]); avg = np.nanmean(np.where(np.isnan(nb), np.nan, nb), axis=0)
    fill = hole & ~np.isnan(avg); terr[fill] = avg[fill]; hole = terr < -1e8
terr[hole] = 8.0
h0 = terr.copy(); h1 = np.full((HX, HZ), NEG, np.float32)
def f_deck(ix, iz, y):
    low = y <= terr[ix, iz] + 3.2
    if low.any(): h0[ix[low], iz[low]] = np.maximum(h0[ix[low], iz[low]], y[low])
    hi = y > terr[ix, iz] + 0.6                      # ramps are in BOTH layers so the car never loses its deck on the way up
    if hi.any(): h1[ix[hi], iz[hi]] = np.maximum(h1[ix[hi], iz[hi]], y[hi])
for nm in ("Routes", "Terre_pleins", "Ponts", "Ponts_Rampes", "Ronds_Points"):
    o = bpy.data.objects.get(nm)
    if o:
        T = tris_of(o)
        if nm in ("Terre_pleins", "Ronds_Points"):                       # only the paved / walkable parts
            pass
        raster(T, TX0, TZ0, GH, HX, HZ, f_deck); print(nm, len(T), "tris |", round(time.time() - t0, 1), "s")
print("level-1 samples:", int((h1 > -1e8).sum()))
# ---- solid grid
solid = np.zeros((SX, SZ), bool)
def terr_at(ix, iz): return terr[np.minimum((ix*GS/GH + 0.5).astype(np.int32), HX - 1), np.minimum((iz*GS/GH + 0.5).astype(np.int32), HZ - 1)]
def f_solid(ix, iz, y):
    m = y - terr_at(ix, iz) > 2.2
    if m.any(): solid[ix[m], iz[m]] = True
NOTSOLID = {"Icosphere", "Ponts_Marquages", "Terrain", "Routes", "Marquages", "Bordures_RB", "Terre_pleins", "Parcs", "Ponts", "Ponts_Rampes", "Echangeurs", "Ronds_Points", "Lampadaires", "Ponts_Equipements", "Feux_Structure", "Passages_Pietons", "Panneaux",
            "Fleuve_Niger", "Fleuve_Berges", "Cite_Jardins", "Memorial_Jardins", "Cite_Cloture_Trait", "Batiments_Remplissage_dummy"}
nb = 0
for o in bpy.data.objects:
    if o.type != 'MESH' or o.hide_viewport or not len(o.data.polygons): continue
    n = o.name
    if n in NOTSOLID or n.startswith(("V0", "P0", "TL_", "Terrain_envelope", "Arbres_", "Foret_", "CICB_Arbres", "Memorial_Palmiers")) or n.endswith(("_ax", "_leg")): continue
    if any(c.name == "Trafic_Anime" for c in o.users_collection): continue
    raster(tris_of(o), TX0, TZ0, GS, SX, SZ, f_solid); nb += 1
riv = bpy.data.objects["Fleuve_Niger"]
water = np.zeros((SX, SZ), bool); roadlow = np.zeros((SX, SZ), bool)
def f_water(ix, iz, y): water[ix, iz] = True
raster(tris_of(riv), TX0, TZ0, GS, SX, SZ, f_water)
def f_roadlow(ix, iz, y):
    m = y <= terr_at(ix, iz) + 3.6
    if m.any(): roadlow[ix[m], iz[m]] = True
for nm in ("Routes", "Ponts", "Ponts_Rampes", "Echangeurs"):
    o = bpy.data.objects.get(nm)
    if o: raster(tris_of(o), TX0, TZ0, GS, SX, SZ, f_roadlow)
rl = roadlow.copy()
for dx in (-1, 0, 1):
    for dz in (-1, 0, 1): rl |= np.roll(np.roll(roadlow, dx, 0), dz, 1)
solid |= (water & ~rl)
fence = bpy.data.objects.get("Cite_Cloture_Trait")
if fence:
    me = fence.data; me.calc_loop_triangles(); co = np.empty(len(me.vertices)*3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3); tv = np.empty(len(me.loop_triangles)*3, np.int32); me.loop_triangles.foreach_get("vertices", tv); tv = tv.reshape(-1, 3); nf = 0
    for t in co[tv]:
        for a in np.linspace(0, 1, 6):
            for b in np.linspace(0, 1 - a, max(2, int(6*(1 - a)) + 1)):
                p = t[0] + a*(t[1] - t[0]) + b*(t[2] - t[0]); ix = int((p[0] - TX0)/GS); iz = int((-p[1] - TZ0)/GS)
                if 0 <= ix < SX and 0 <= iz < SZ and not roadlow[ix, iz]: solid[ix, iz] = True; nf += 1
    print("fence solid samples:", nf)
print("solid objects:", nb, "| solid cells:", int(solid.sum()), "of", solid.size, "|", round(time.time() - t0, 1), "s")
bpy.app.driver_namespace["game_grids"] = {"h0": h0, "h1": h1, "solid": solid}
