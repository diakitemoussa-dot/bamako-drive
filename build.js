// Builds ./dist : a self-contained static folder (no node_modules) you can upload to any web host (Netlify, GitHub Pages, Vercel, your own server).
const fs = require("fs"), path = require("path");
const OUT = path.join(__dirname, "dist"); fs.rmSync(OUT, { recursive: true, force: true });
const copy = (a, b) => { fs.mkdirSync(path.dirname(path.join(OUT, b)), { recursive: true }); fs.cpSync(path.join(__dirname, a), path.join(OUT, b), { recursive: true }); };
for (const f of ["css", "js", "data", "icons", "manifest.webmanifest", "sw.js"]) copy(f, f);
copy("node_modules/three/build/three.module.js", "vendor/three.module.js"); copy("node_modules/three/examples/jsm/objects/Sky.js", "vendor/addons/objects/Sky.js"); copy("node_modules/three/examples/jsm/controls/OrbitControls.js", "vendor/addons/controls/OrbitControls.js"); copy("node_modules/fflate/esm/browser.js", "vendor/fflate.js");
let html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, '<script type="importmap">{ "imports": { "three": "./vendor/three.module.js", "three/addons/": "./vendor/addons/", "fflate": "./vendor/fflate.js" } }</script>');
fs.writeFileSync(path.join(OUT, "index.html"), html);
fs.writeFileSync(path.join(OUT, "_headers"), "/data/*\n  Cache-Control: public, max-age=31536000, immutable\n/js/*\n  Cache-Control: no-cache\n");
const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log("dist ready:", (size(OUT)/1e6).toFixed(1), "MB (data", (size(path.join(OUT, "data"))/1e6).toFixed(1), "MB)");
