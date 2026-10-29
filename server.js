// Static server for the Bamako driving game. Works on the PC and, on the same Wi-Fi, on phones/tablets (iOS, Android).
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os"), zlib = require("zlib");
const ROOT = process.env.ROOT ? require("path").resolve(process.env.ROOT) : __dirname, PORT = parseInt(process.env.PORT || "8080", 10);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".bin": "application/octet-stream", ".gz": "application/octet-stream", ".ico": "image/x-icon", ".wav": "audio/wav", ".mp3": "audio/mpeg" };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
  const f = path.join(ROOT, path.normalize(p).replace(/^(\.\.[\/\\])+/, ""));
  if (!f.startsWith(ROOT) || f.includes(path.sep + "tools" + path.sep)) { res.writeHead(403); return res.end("forbidden"); }
  fs.stat(f, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end("not found"); }
    const ext = path.extname(f).toLowerCase(), h = { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": f.includes(path.sep + "tiles" + path.sep) || f.includes("node_modules") ? "public, max-age=86400" : "no-cache" };
    const accept = req.headers["accept-encoding"] || "";
    if ([".json", ".js", ".html", ".mjs", ".css", ".svg", ".webmanifest"].includes(ext) && /\bgzip\b/.test(accept) && st.size > 1024) {
      h["Content-Encoding"] = "gzip"; res.writeHead(200, h); fs.createReadStream(f).pipe(zlib.createGzip({ level: 6 })).pipe(res);
    } else { h["Content-Length"] = st.size; res.writeHead(200, h); fs.createReadStream(f).pipe(res); }
  });
}).listen(PORT, "0.0.0.0", () => {
  console.log("\n  BAMAKO DRIVE - server ready\n");
  console.log("  On this computer :  http://localhost:" + PORT);
  for (const [n, list] of Object.entries(os.networkInterfaces())) for (const a of list) if (a.family === "IPv4" && !a.internal) console.log("  On your phone    :  http://" + a.address + ":" + PORT + "   (same Wi-Fi)  [" + n + "]");
  console.log("\n  Ctrl+C to stop.\n");
});
