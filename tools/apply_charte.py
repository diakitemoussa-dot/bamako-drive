import struct, zlib, os
B = "C:/Users/Kabakoo Apprenant.e/Documents/bamako_game/"
def rd(p): return open(B + p, encoding="utf-8").read()
def wr(p, s): open(B + p, "w", encoding="utf-8").write(s)
c = rd("css/game.css")
R = [
 (":root { --accent:#ffb020; --panel:rgba(12,16,26,.82); --txt:#f2f4f8; --dim:#9aa6bb;", ":root { --plum:#55415D; --cream:#F8F3EA; --gold:#F9D58B; --lilac:#C3A5C7; --plum-d:#3b2c42; --accent:var(--gold); --panel:rgba(85,65,93,.90); --txt:var(--cream); --dim:var(--lilac);"),
 ("background:#06080d; color:var(--txt); font-family:system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif;", "background:#2b2030; color:var(--txt); font-family:Lato, 'Open Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;"),
 ("radial-gradient(ellipse at 50% 30%, rgba(30,40,60,.55), rgba(5,7,12,.93))", "radial-gradient(ellipse at 50% 30%, rgba(85,65,93,.45), rgba(43,32,48,.94))"),
 ("border:1px solid rgba(255,255,255,.12); border-radius:18px;", "border:1px solid rgba(195,165,199,.35); border-radius:22px;"),
 ("h1 { margin:0 0 4px; font-size:clamp(26px, 6vw, 44px); letter-spacing:.12em; font-weight:800; } h1 span { color:var(--accent); }", "h1 { margin:0 0 4px; font-family:Rubik, Lato, sans-serif; font-size:clamp(26px, 6vw, 44px); letter-spacing:.1em; font-weight:700; color:var(--cream); } h1 span { color:var(--gold); }"),
 ("h2 { margin:0 0 14px; }", "h2 { margin:0 0 14px; font-family:Rubik, Lato, sans-serif; }"),
 (".chips button { background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.14); border-radius:10px;", ".chips button { background:rgba(248,243,234,.09); border:1px solid rgba(195,165,199,.45); border-radius:14px;"),
 (".chips button.on { background:var(--accent); color:#1a1200; border-color:var(--accent); font-weight:700; }", ".chips button.on { background:var(--gold); color:var(--plum); border-color:var(--gold); font-weight:700; }"),
 ("border-radius:12px; border:0; background:var(--accent); color:#1a1200; font-weight:800; font-size:17px; letter-spacing:.05em;", "border-radius:16px; border:0; background:var(--gold); color:var(--plum); font-family:Rubik, Lato, sans-serif; font-weight:700; font-size:17px; letter-spacing:.06em;"),
 ("#toMenu, #fsBtn { background:rgba(255,255,255,.1); color:var(--txt);", "#toMenu, #fsBtn { background:rgba(248,243,234,.12); color:var(--cream);"),
 ("#loadBar { height:5px; background:rgba(255,255,255,.1); border-radius:4px;", "#loadBar { height:6px; background:rgba(248,243,234,.15); border-radius:6px;"),
 ("#loadFill { display:block; height:100%; width:0; background:var(--accent);", "#loadFill { display:block; height:100%; width:0; background:linear-gradient(90deg,var(--lilac),var(--gold));"),
 ("border:2px solid rgba(255,255,255,.35); background:rgba(10,14,22,.55);", "border:3px solid var(--lilac); background:rgba(59,44,66,.7);"),
 ("font-size:12px; background:var(--panel); border-radius:8px;", "font-size:12px; background:var(--panel); border-radius:12px;"),
 ("#clockTime { font-size:26px; font-weight:700; }", "#clockTime { font-family:Rubik, Lato, sans-serif; font-size:26px; font-weight:600; color:var(--cream); }"),
 ("#speedVal { font-size:54px; font-weight:800; line-height:1; }", "#speedVal { font-family:Rubik, Lato, sans-serif; font-size:54px; font-weight:700; line-height:1; color:var(--cream); }"),
 ("background:rgba(255,255,255,.2); border-radius:3px; margin:6px 0 0 auto;", "background:rgba(248,243,234,.22); border-radius:4px; margin:6px 0 0 auto;"),
 ("background:linear-gradient(90deg,#5fe28a,#ffd24a,#ff5a3a); }", "background:linear-gradient(90deg,var(--lilac),var(--gold)); }"),
 ("#gear { margin-top:2px; font-size:16px; font-weight:700; color:var(--accent); }", "#gear { margin-top:2px; font-family:Rubik, Lato, sans-serif; font-size:16px; font-weight:600; color:var(--gold); }"),
 ("background:var(--panel); border-radius:10px; padding:5px 10px; } #scoreVal { font-size:20px; font-weight:800; display:block; }", "background:var(--panel); border-radius:14px; padding:5px 12px; } #scoreVal { font-family:Rubik, Lato, sans-serif; font-size:20px; font-weight:700; display:block; color:var(--gold); }"),
 ("padding:6px 14px; border-radius:10px; background:rgba(0,0,0,.35); } #toast.show { opacity:1; } #toast.bad { color:#ff7d6a; } #toast.good { color:#8cf0a8; }", "padding:7px 16px; border-radius:16px; background:rgba(85,65,93,.85); color:var(--cream); font-family:Rubik, Lato, sans-serif; } #toast.show { opacity:1; } #toast.bad { color:var(--cream); border:2px solid var(--lilac); } #toast.good { color:var(--gold); }"),
 ("background:rgba(0,0,0,.45); padding:2px 8px; border-radius:6px; }", "background:rgba(59,44,66,.7); padding:2px 8px; border-radius:8px; }"),
 ("border-radius:18px; border:2px solid rgba(255,255,255,.4); background:rgba(40,46,60,.55); font-weight:800; letter-spacing:.06em; touch-action:none; } .pedal.gas { width:min(19vh, 110px); height:min(30vh, 160px); background:rgba(40,160,80,.55); }", "border-radius:24px; border:2px solid var(--lilac); background:rgba(85,65,93,.62); color:var(--cream); font-family:Rubik, Lato, sans-serif; font-weight:700; letter-spacing:.06em; touch-action:none; } .pedal.gas { width:min(19vh, 110px); height:min(30vh, 160px); background:rgba(249,213,139,.74); color:var(--plum); border-color:var(--gold); }"),
 ("background:rgba(15,20,30,.55); border:1px solid rgba(255,255,255,.28); border-radius:10px;", "background:rgba(85,65,93,.74); border:1px solid var(--lilac); border-radius:14px; color:var(--cream);"),
 ("#rotate { position:fixed; inset:0; z-index:30; background:#06080d;", "#rotate { position:fixed; inset:0; z-index:30; background:var(--plum); color:var(--cream); font-family:Rubik, Lato, sans-serif;"),
 ("box-shadow:0 -10px 18px rgba(12,16,26,.95);", "box-shadow:0 -10px 18px rgba(85,65,93,.95);"),
]
miss = 0
for a, b in R:
    if a in c: c = c.replace(a, b)
    else: miss += 1; print("not found:", a[:70])
wr("css/game.css", c)
h = rd("index.html")
h = h.replace('<meta name="theme-color" content="#0b0f17">', '<meta name="theme-color" content="#55415D">')
h = h.replace('<link rel="stylesheet" href="css/game.css">', '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Open+Sans:wght@400;600&family=Rubik:wght@500;600;700&display=swap" rel="stylesheet">\n<link rel="stylesheet" href="css/game.css">')
h = h.replace("Tourne le téléphone en mode paysage.", "Tourne ton téléphone en mode paysage.").replace("Volant par inclinaison du téléphone", "Volant par inclinaison de ton téléphone")
wr("index.html", h)
m = rd("manifest.webmanifest").replace("#06080d", "#55415D").replace("#0b0f17", "#55415D"); wr("manifest.webmanifest", m)
wr("icons/icon.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#55415D"/><circle cx="256" cy="256" r="196" fill="#C3A5C7" opacity=".22"/><path d="M96 330h320l-34-92q-8-22-32-22H162q-24 0-32 22z" fill="#F9D58B"/><rect x="84" y="318" width="344" height="70" rx="30" fill="#F9D58B"/><circle cx="168" cy="394" r="38" fill="#3b2c42"/><circle cx="344" cy="394" r="38" fill="#3b2c42"/><path d="M170 232h172l20 56H150z" fill="#55415D" opacity=".85"/><text x="256" y="150" font-family="Arial" font-weight="700" font-size="66" text-anchor="middle" fill="#F8F3EA">BAMAKO</text></svg>')
def png(path, n):
    w = h_ = n; raw = b""; cx = cy = n/2
    for y in range(h_):
        row = b"\x00"
        for x in range(w):
            col = (85, 65, 93)
            if (x-cx)**2 + (y-cy)**2 < (n*0.38)**2: col = (110, 90, 118)
            inside = (w*0.12 < x < w*0.88 and h_*0.5 < y < h_*0.74); top = (w*0.27 < x < w*0.73 and h_*0.38 < y <= h_*0.5)
            wheel = ((x-w*0.33)**2 + (y-h_*0.77)**2 < (w*0.08)**2) or ((x-w*0.67)**2 + (y-h_*0.77)**2 < (w*0.08)**2)
            if inside or top: col = (249, 213, 139)
            if wheel: col = (59, 44, 66)
            row += bytes(col)
        raw += row
    def ch(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", w, h_, 8, 2, 0, 0, 0)) + ch(b"IDAT", zlib.compress(raw, 9)) + ch(b"IEND", b""))
png(B + "icons/icon-192.png", 192); png(B + "icons/icon-512.png", 512)
# canvas colours in JS (minimap) + sprite tints
j = rd("js/main.js")
j = j.replace("g.fillStyle = '#10151f'; g.fillRect(0, 0, W, W);", "g.fillStyle = '#3b2c42'; g.fillRect(0, 0, W, W);")
j = j.replace("g.fillStyle = 'rgba(255,255,255,.75)'; for (const p of traffic.nearPositions(260))", "g.fillStyle = 'rgba(248,243,234,.85)'; for (const p of traffic.nearPositions(260))")
j = j.replace("g.fillStyle = '#ffb020'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 2; g.stroke();", "g.fillStyle = '#F9D58B'; g.fill(); g.strokeStyle = '#55415D'; g.lineWidth = 3; g.stroke();")
j = j.replace("$('speedVal').style.color = over ? '#ff7d6a' : '';", "$('speedVal').style.color = over ? '#F9D58B' : '';")
j = j.replace("penalty(n, why) { state.score = Math.max(0, state.score - n); $('scoreVal').textContent = Math.round(state.score); toast(why + '  -' + n, 'bad'); }", "penalty(n, why) { state.score = Math.max(0, state.score - n); $('scoreVal').textContent = Math.round(state.score); toast('⚠ ' + why + '  -' + n, 'bad'); }")
wr("js/main.js", j)
g = rd("js/graph.js")
g = g.replace("[[0, 1.2, '#5a6275'], [1, 1.2, '#5a6275'], [2, 1.8, '#8d97ad'], [3, 2.4, '#b9c2d6'], [4, 3.4, '#e6c06a'], [5, 4.0, '#ffd070']]", "[[0, 1.2, '#6b5575'], [1, 1.2, '#6b5575'], [2, 1.8, '#8e739a'], [3, 2.4, '#C3A5C7'], [4, 3.4, '#F8F3EA'], [5, 4.0, '#F9D58B']]")
wr("js/graph.js", g)
print("done, replacements not found:", miss)
