# Monuments texturés : les motifs procéduraux (fenêtres, rayures, briques, globe…) sont « cuits » en images,
# puis exportés avec leur géométrie dans data/landmarks.glb (chargé par le jeu par-dessus les tuiles).
# Les tuiles (export_a) n'exportent plus ces objets, sauf leurs vitres et lumières de nuit (classe ≠ 0).
# À lancer dans Blender (après export_a … d).
import bpy, bmesh, os
GAME = "C:/Users/Kabakoo Apprenant.e/Documents/bamako_game/"
TEX = GAME + "data/landmarks/"; os.makedirs(TEX, exist_ok=True)
LANDMARKS = ["Amitie_Hotel", "Assemblee_Nationale", "Azalai_Hotel", "BDM_Siege", "CHU_Gabriel_Toure", "CICB", "CICB_Fontaine", "CICB_Hall",
             "Cite_Administrative", "Gare_Bamako", "Libya_Hotel", "LM_Bibliotheque_Nationale", "LM_Cathedrale", "LM_Grand_Marche", "LM_Grande_Mosquee",
             "LM_Monument_Paix", "LM_Palais_Culture", "LM_Stade_Modibo_Keita", "Memorial_Keita", "Monument_Ilot", "Musee_National", "Radisson_Hotel",
             "Ecobank_Siege", "Tour_BCEAO_Reel", "Monument_Independance"]
ns = {}; exec(open(GAME + "tools/export_a_meshes.py", encoding="utf-8").read().split("tiles = collections.defaultdict")[0], ns)
sc = bpy.context.scene; prev_engine = sc.render.engine
try: sc.render.engine = 'CYCLES'
except TypeError: pass
sc.cycles.samples = 1; sc.render.bake.margin = 4; sc.render.image_settings.quality = 82
col = bpy.data.collections.get("_BAKE") or bpy.data.collections.new("_BAKE")
if col.name not in sc.collection.children: sc.collection.children.link(col)
for ob in list(col.objects): bpy.data.objects.remove(ob)
area = next(a for a in bpy.context.screen.areas if a.type == 'VIEW_3D'); region = next(r for r in area.regions if r.type == 'WINDOW')
copies = []
for n in LANDMARKS:
    o = bpy.data.objects.get(n)
    if o is None or o.type != 'MESH': continue
    me = o.data.copy(); me.name = n + "_bkmesh"
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if me.materials[f.material_index] is None or ns['mat_table'](me.materials[f.material_index])[0] != 0], context='FACES')
    bm.to_mesh(me); bm.free()
    c = bpy.data.objects.new(n + "_bk", me); c.matrix_world = o.matrix_world.copy(); col.objects.link(c)
    if "UVMap" in me.uv_layers: me.uv_layers["UVMap"].active_render = True
    uv = me.uv_layers.get("BakeUV") or me.uv_layers.new(name="BakeUV"); me.uv_layers.active = uv
    for x in bpy.context.selected_objects: x.select_set(False)
    c.select_set(True); bpy.context.view_layer.objects.active = c
    with bpy.context.temp_override(area=area, region=region, active_object=c, object=c, selected_objects=[c], selected_editable_objects=[c]):
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004, area_weight=0.0, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode='OBJECT')
    a = sum(p.area for p in me.polygons); r = 512 if a < 4000 else (1024 if a < 30000 else 2048)
    img = bpy.data.images.get(n + "_tex") or bpy.data.images.new(n + "_tex", r, r)
    if img.size[0] != r: img.scale(r, r)
    for m in me.materials:
        if not m: continue
        m.use_nodes = True; nd = m.node_tree.nodes.get("_bake") or m.node_tree.nodes.new("ShaderNodeTexImage"); nd.name = "_bake"; nd.image = img; m.node_tree.nodes.active = nd
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=4, use_clear=True)
    img.filepath_raw = TEX + n + ".jpg"; img.file_format = 'JPEG'; img.save()
    copies.append((c, img))
# matériaux simples (une image par monument), seule l'UV cuite est gardée
for c, img in copies:
    me = c.data; mat = bpy.data.materials.get("LMK_" + c.name) or bpy.data.materials.new("LMK_" + c.name)
    mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); tx = nt.nodes.new("ShaderNodeTexImage"); tx.image = img
    nt.links.new(tx.outputs["Color"], bsdf.inputs["Base Color"]); nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"]); bsdf.inputs["Roughness"].default_value = 0.9
    me.materials.clear(); me.materials.append(mat)
    for l in [l for l in me.uv_layers if l.name != "BakeUV"]: me.uv_layers.remove(l)
for x in bpy.context.selected_objects: x.select_set(False)
for c, _ in copies: c.select_set(True)
bpy.ops.export_scene.gltf(filepath=GAME + "data/landmarks.glb", export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_image_format='JPEG', export_texcoords=True, export_normals=True, export_materials='EXPORT', export_cameras=False, export_lights=False)
for c, _ in copies: bpy.data.objects.remove(c)
for m in [m for m in bpy.data.materials if m.name.startswith("LMK_")]: bpy.data.materials.remove(m)
for m in bpy.data.materials:
    if m.use_nodes and m.node_tree.nodes.get("_bake"): m.node_tree.nodes.remove(m.node_tree.nodes["_bake"])
bpy.data.collections.remove(col)
try: sc.render.engine = prev_engine
except TypeError: pass
print("landmarks.glb :", round(os.path.getsize(GAME + "data/landmarks.glb")/1e6, 1), "Mo |", len(copies), "monuments")
