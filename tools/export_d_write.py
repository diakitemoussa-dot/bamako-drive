import bpy, numpy as np, json, gzip, os, struct
TILE = 250.0; TX0 = -2400.0; TZ0 = -2800.0; NX = 20; NZ = 22; QS = 0.02
OUT = "C:/Users/Kabakoo Apprenant.e/Documents/bamako_game/data/tiles/"; os.makedirs(OUT, exist_ok=True)
cols = bpy.app.driver_namespace["game_cols"]; tiles = bpy.app.driver_namespace["game_tiles"]; trees = bpy.app.driver_namespace["game_trees"]; lamps = bpy.app.driver_namespace["game_lamps"]; G = bpy.app.driver_namespace["game_grids"]
h0, h1, solid = G["h0"], G["h1"], G["solid"]
def tile_of(x, z): return np.floor((x - TX0)/TILE).astype(np.int32), np.floor((z - TZ0)/TILE).astype(np.int32)
tix, tiz = tile_of(trees[:, 0], trees[:, 2]); tree_by = {}
for i in range(len(trees)): tree_by.setdefault((int(tix[i]), int(tiz[i])), []).append(i)
cix, ciz = tile_of(cols[:, 0], cols[:, 1]); col_by = {}
for i in range(len(cols)): col_by.setdefault((int(cix[i]), int(ciz[i])), []).append(i)
lix, liz = tile_of(lamps[:, 0], lamps[:, 2]); lamp_by = {}
for i in range(len(lamps)): lamp_by.setdefault((int(lix[i]), int(liz[i])), []).append(i)
def align(b, n=4): return b + b"\0"*((-len(b)) % n)
index = []; total = 0; tot_raw = 0
for ix in range(NX):
    for iz in range(NZ):
        key = (ix, iz); d = tiles.get(key); tr = tree_by.get(key, []); lp = lamp_by.get(key, []); cl = col_by.get(key, [])
        sub = h0[ix*100:ix*100 + 101, iz*100:iz*100 + 101]
        if d is None and not tr: continue
        ox, oz = TX0 + ix*TILE, TZ0 + iz*TILE; blobs = []; sec = {}
        def put(name, arr):
            b = align(np.ascontiguousarray(arr).tobytes()); off = sum(len(x) for x in blobs); blobs.append(b); sec[name] = off
        n = 0
        if d and d["pos"]:
            P = np.concatenate(d["pos"]).reshape(-1, 3).copy(); C = np.concatenate(d["col"]).reshape(-1, 4)
            q = np.empty((len(P), 3), np.int16); q[:, 0] = np.round((P[:, 0] - ox)/QS); q[:, 1] = np.round(P[:, 1]/QS); q[:, 2] = np.round((P[:, 2] - oz)/QS)
            put("pos", q); put("col", (C*255 + 0.5).astype(np.uint8)); n = len(P)
        nk = 0
        if d and d["kpos"]:
            P = np.concatenate(d["kpos"]).reshape(-1, 3); C = np.concatenate(d["kcol"]); V = np.concatenate(d["kv"]).reshape(-1)
            q = np.empty((len(P), 3), np.int16); q[:, 0] = np.round((P[:, 0] - ox)/QS); q[:, 1] = np.round(P[:, 1]/QS); q[:, 2] = np.round((P[:, 2] - oz)/QS)
            put("kpos", q); put("kcol", np.repeat((C*255 + 0.5).astype(np.uint8), 3, axis=0)[:, :3].copy() if False else (np.repeat(C, 3, axis=0)*255 + 0.5).astype(np.uint8)); put("kv", V.astype(np.float32)); nk = len(P)
        if tr:
            T = trees[tr].copy(); T[:, 0] -= ox; T[:, 2] -= oz; put("trees", T.astype(np.float32))
        if lp:
            L = lamps[lp].copy(); L[:, 0] -= ox; L[:, 2] -= oz; put("lamps", L.astype(np.float32))
        if cl:
            C = cols[cl].copy(); C[:, 0] -= ox; C[:, 1] -= oz; put("cols", C.astype(np.float32))
        put("h0", np.round(np.clip(sub, -600, 600)*50).astype(np.int16).T)                          # rows = z, cols = x
        sub1 = h1[ix*100:ix*100 + 101, iz*100:iz*100 + 101]; has1 = bool((sub1 > -1e8).any())
        if has1: put("h1", np.where(sub1 > -1e8, np.round(np.clip(sub1, -600, 600)*50), -32768).astype(np.int16).T)
        so = solid[ix*125:(ix + 1)*125, iz*125:(iz + 1)*125]
        put("solid", np.packbits(so.T.astype(np.uint8), axis=1))                                    # rows = z, bits along x
        head = {"ix": ix, "iz": iz, "ox": ox, "oz": oz, "qs": QS, "n": n, "nk": nk, "nt": len(tr), "nl": len(lp), "nc": len(cl), "h1": has1, "off": sec}
        hb = align(json.dumps(head, separators=(",", ":")).encode()); body = b"BKT1" + struct.pack("<I", len(hb)) + hb + b"".join(blobs); raw = len(body)
        gz = gzip.compress(body, 9); open(OUT + f"t_{ix}_{iz}.bin.gz", "wb").write(gz); total += len(gz); tot_raw += raw
        index.append({"ix": ix, "iz": iz, "n": n, "nk": nk, "nt": len(tr), "bytes": len(gz)})
import time as _t
man = {"v": int(_t.time()), "tile": TILE, "tx0": TX0, "tz0": TZ0, "nx": NX, "nz": NZ, "qs": QS, "gh": 2.5, "gs": 2.0, "tiles": index}
json.dump(man, open(OUT + "../manifest.json", "w"), separators=(",", ":"))
print("tiles written:", len(index), "| total", round(total/1e6, 1), "MB gz (raw", round(tot_raw/1e6, 1), "MB) | largest tile", max(t["bytes"] for t in index)//1000, "KB | trees", len(trees), "lamps", len(lamps))
