import json, math, random, gzip, struct, os
import numpy as np
BASE = "C:/Users/Kabakoo Apprenant.e/Documents/bamako_game/data/"; TR = "C:/Users/Kabakoo Apprenant.e/Documents/bamako_traffic/"
VL = {}; exec(open(TR + "veh_lib.py", encoding="utf-8").read(), VL)
Base = VL["Tpl"]
class Rec(Base):
    def __init__(self): super().__init__(); self.wheels = []
    def wheel(self, cx, cy, cz, r, w, outer, role_tire=2, role_rim=3, n=6): self.wheels.append((cx, cy, cz, r, w))
VL["Tpl"] = Rec
LIGHTF, LIGHTR, SIGN, BODY = VL["LIGHTF"], VL["LIGHTR"], VL["SIGN"], VL["BODY"]
def tri(faces):
    out = []
    for f in faces:
        for i in range(1, len(f) - 1): out.append((f[0], f[i], f[i + 1]))
    return out
rng = random.Random(11); models = {}
LENS = {"moto": 1.9, "sedan": 4.4, "taxi": 4.4, "sotrama": 5.3, "suv": 4.7, "pickup": 5.4, "truck": 7.2, "tricycle": 2.2}
for kind in ("sedan", "taxi", "suv", "pickup", "sotrama", "truck", "tricycle", "moto"):
    if kind in ("sedan", "taxi"): t = VL["sedan"](4.4)
    elif kind == "suv": t = VL["sedan"](4.7, suv=True)
    elif kind == "pickup": t = VL["pickup"]()
    elif kind == "sotrama": t = VL["sotrama"]()
    elif kind == "truck": t = VL["truck"]()
    elif kind == "tricycle": t = VL["tricycle"]()
    else: t = VL["moto"](rider=True, pillion=True)
    if kind == "taxi": t.box(-0.25, 0.25, -0.12, 0.12, 1.43, 1.55, SIGN)
    V = np.array(t.v, np.float32); cols = VL["colors_for"](kind if kind != "taxi" else "taxi", rng)
    groups = {"body": [], "detail": [], "lf": [], "lr": [], "sg": []}
    for f, r in zip(t.f, t.r):
        g = "body" if r == BODY else ("lf" if r == LIGHTF else ("lr" if r == LIGHTR else ("sg" if r == SIGN else "detail")))
        groups[g].append((f, r))
    m = {"len": LENS[kind]}
    for g, items in groups.items():
        if not items: continue
        pos = []; col = []
        for f, r in items:
            c = cols.get(int(r), (0.5, 0.5, 0.5)) if g == "detail" else (1.0, 1.0, 1.0)
            for a, b, c3 in tri([f]):
                for vi in (a, b, c3):
                    p = V[vi]; pos.extend([float(p[0]), float(p[2]), float(-p[1])])            # blender x fwd, y left, z up -> three x fwd, y up, z right
                    col.extend(c if g == "detail" else (1.0, 1.0, 1.0))
        m[g] = {"pos": [round(v, 3) for v in pos], "col": [round(v, 3) for v in col]}
    ws = []; xs = sorted({round(w[0], 3) for w in t.wheels}); front = xs[-1]
    for (cx, cy, cz, r, w) in t.wheels: ws.append({"x": round(cx, 3), "y": round(cz, 3), "z": round(-cy, 3), "r": round(r, 3), "w": round(w, 3), "front": abs(round(cx, 3) - front) < 1e-3})
    m["wheels"] = ws; m["wb"] = round(front - xs[0], 2) if len(xs) > 1 else 0.0; models[kind] = m
json.dump(models, open(BASE + "vehicles.json", "w"), separators=(",", ":"))
print("vehicle models:", {k: (len(v["body"]["pos"])//9 if "body" in v else 0, len(v["detail"]["pos"])//9 if "detail" in v else 0) for k, v in models.items()})
# ---------------- traffic graph (three coordinates: z = -y) ----------------
G = json.load(open(TR + "traffic_graph.json")); E = G["edges"]; N = G["nodes"]
RANK = {"trunk": 5, "primary": 4, "secondary": 3, "tertiary": 2, "residential": 1, "unclassified": 0}
pts = []; hs = []; meta = []; off = 0
for e in E:
    xy = np.array(e["xy"], np.float32).reshape(-1, 2); n = len(xy); pts.append(np.c_[xy[:, 0], -xy[:, 1]]); hs.append(np.clip(np.round(np.array(e["h"])*10), 0, 120).astype(np.uint8))
    meta.append([e["id"], e["from"], e["to"], round(e["len"], 1), e["limit"], e["lane"], e["nl"], e.get("par", -1), RANK[e["c"]], e["level"], int(e["bridge"]), e["road"], e["dir"], off, n]); off += n
P = np.concatenate(pts).astype(np.float32); H = np.concatenate(hs)
blob = struct.pack("<I", len(P)) + P.tobytes() + H.tobytes(); open(BASE + "graph_pts.bin.gz", "wb").write(gzip.compress(blob, 9))
json.dump({"nodes": [[round(n[0], 1), round(-n[1], 1), n[2]] for n in N], "edges": meta}, open(BASE + "graph.json", "w"), separators=(",", ":"))
S = json.load(open(TR + "signals.json")); out = []
for s in S:
    out.append({"node": s["node"], "x": round(s["x"], 2), "z": round(-s["y"], 2), "cycle": s["cycle"], "offset": s["offset"], "phases": s["phases"],
                "approaches": [{"edges": a["edges"], "phase": a["phase"], "stop": [a["stop"][0], -a["stop"][1]], "T": [a["T"][0], -a["T"][1]], "C": [a["C"][0], -a["C"][1]], "nl": a["nl"], "c": a["c"]} for a in s["approaches"]]})
json.dump(out, open(BASE + "signals.json", "w"), separators=(",", ":"))
for f in ("traffic_graph.json", "signs.json"):
    if os.path.exists(BASE + f): os.remove(BASE + f)
print("graph:", len(E), "edges,", len(P), "points | graph_pts.bin.gz", os.path.getsize(BASE + "graph_pts.bin.gz")//1000, "KB | graph.json", os.path.getsize(BASE + "graph.json")//1000, "KB | signals", len(out))
