# Red warning lights: every mesh island using a material called NIGHT_Balise* becomes one beacon (x, y, z in three.js coordinates) -> data/beacons.json
import bpy, json
from mathutils import Vector
out = []; OUT = "C:/Users/Kabakoo Apprenant.e/Documents/bamako_game/data/beacons.json"
for o in bpy.data.objects:
    if o.type != 'MESH' or not any(m and m.name.startswith("NIGHT_Balise") for m in o.data.materials): continue
    me = o.data; par = list(range(len(me.vertices)))
    def f(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    for e in me.edges: par[f(e.vertices[0])] = f(e.vertices[1])
    groups = {}
    for v in me.vertices: groups.setdefault(f(v.index), []).append(o.matrix_world @ v.co)
    for g in groups.values():
        c = sum(g, Vector()) / len(g); r = max((p - c).length for p in g); out.append([round(c.x, 2), round(c.z, 2), round(-c.y, 2), round(r, 2)])
json.dump(out, open(OUT, "w"), separators=(",", ":")); print("beacons:", len(out), out)
