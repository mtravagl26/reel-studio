#!/usr/bin/env node
// Added by By Mel Ross. Local stand-in for the Reel Review page's claude.ai storage, so the review page works when the
// session has no Artifact tools (other apps, agents, older Claude Code). Nothing leaves your computer or Wi-Fi.
// The page calls window.claude.use("db"); shim.js answers it with this server, which keeps each doc as a JSON file
// in <reel>/review_db/<path>.json (reel/current, review/current, builds/latest) and serves the reel folder's files.
// Usage: node serve.mjs <reel-folder> [--port 4790] [--lan]
//   default: http://127.0.0.1:4790/ on this Mac only
//   --lan:   also reachable from your phone/laptop on the same Wi-Fi; prints a URL with a one-off key (?k=...)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const REEL = path.resolve(args.find(a => !a.startsWith("--") && !/^\d+$/.test(a)) || ".");
const PORT = Number(args[args.indexOf("--port") + 1]) || 4790;
const LAN = args.includes("--lan");
const KEY = LAN ? crypto.randomBytes(9).toString("base64url") : null;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REVIEW = HERE;   // reel-review.html and core.js sit beside this file
const DB = path.join(REEL, "review_db");
const DOCS = new Set(["reel/current", "review/current", "builds/latest"]);
const WRITABLE = new Set(["review/current"]);   // the page only records decisions; Claude writes reel + builds as files
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".mp4": "video/mp4",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".otf": "font/otf", ".ttf": "font/ttf", ".woff2": "font/woff2" };
if (!fs.existsSync(REEL)) { console.error(`no reel folder: ${REEL}`); process.exit(1); }

const SHIM = `(() => {
  const err = code => Object.assign(new Error(code), { code });
  const get = async p => { const r = await fetch("/db/" + p, { cache: "no-store" });
    if (r.status === 204) return { exists: false, data: () => undefined, raw: "" };
    if (!r.ok) throw err("http-" + r.status); const raw = await r.text(); return { exists: true, data: () => JSON.parse(raw), raw }; };
  const doc = p => ({
    get: () => get(p),
    set: async body => { const r = await fetch("/db/" + p, { method: "PUT", body: JSON.stringify(body) }); if (!r.ok) throw err("http-" + r.status); },
    onSnapshot(cb, onErr) { let last = null, stop = false;
      const tick = async () => { try { const s = await get(p); if (s.raw !== last) { last = s.raw; cb(s); } } catch (e) { onErr && onErr(e); }
        if (!stop) setTimeout(tick, 2000); };
      tick(); return () => { stop = true; }; },
  });
  window.claude = { use: async cap => cap === "db" ? { doc } : null };
})();`;

function sendFile(req, res, file) {
  let st; try { st = fs.statSync(file); if (!st.isFile()) throw 0; } catch { res.writeHead(404).end(); return; }
  const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");   // video seeking (Safari insists on ranges)
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
    if (start > end) { res.writeHead(416, { "Content-Range": `bytes */${st.size}` }).end(); return; }
    res.writeHead(206, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${st.size}` });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": st.size, "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x"), p = decodeURIComponent(url.pathname);
  if (KEY) {   // the key arrives once in the link, then rides in a cookie so videos, images and fonts load too
    if (url.searchParams.get("k") === KEY) res.setHeader("Set-Cookie", `rk=${KEY}; HttpOnly; SameSite=Strict; Path=/`);
    else if (!(req.headers.cookie || "").split(/;\s*/).includes(`rk=${KEY}`)) { res.writeHead(403).end("missing or wrong key"); return; }
  }
  if (p === "/" || p === "/index.html") {
    const html = fs.readFileSync(path.join(REVIEW, "reel-review.html"), "utf8")
      .replace('<script src="core.js"></script>', '<script src="shim.js"></script><script src="core.js"></script>');
    res.writeHead(200, { "Content-Type": TYPES[".html"], "Cache-Control": "no-store" }).end(html); return;
  }
  if (p === "/shim.js") { res.writeHead(200, { "Content-Type": TYPES[".js"] }).end(SHIM); return; }
  if (p === "/core.js") return sendFile(req, res, path.join(REVIEW, "core.js"));
  if (p.startsWith("/db/")) {
    const doc = p.slice(4);
    if (!DOCS.has(doc)) { res.writeHead(404).end(); return; }
    const file = path.join(DB, doc + ".json");
    if (req.method === "GET") { if (!fs.existsSync(file)) { res.writeHead(204).end(); return; } return sendFile(req, res, file); }   // 204 = no doc yet
    if (req.method !== "PUT" || !WRITABLE.has(doc)) { res.writeHead(403).end(); return; }
    let body = ""; req.on("data", c => { body += c; if (body.length > 5e6) req.destroy(); });
    req.on("end", () => {
      try { JSON.parse(body); } catch { res.writeHead(400).end(); return; }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + ".tmp", body); fs.renameSync(file + ".tmp", file);   // atomic: Claude may read it any time
      res.writeHead(204).end();
    });
    return;
  }
  if (p.startsWith("/files/")) {
    const file = path.resolve(REEL, "." + p.slice(6));
    if (!file.startsWith(REEL + path.sep) || file.startsWith(DB + path.sep)) { res.writeHead(403).end(); return; }
    return sendFile(req, res, file);
  }
  res.writeHead(404).end();
}).listen(PORT, LAN ? "0.0.0.0" : "127.0.0.1", () => {
  console.log(`Reel review for ${path.basename(REEL)}: http://127.0.0.1:${PORT}/${KEY ? "?k=" + KEY : ""}`);
  if (LAN) for (const a of Object.values(os.networkInterfaces()).flat())
    if (a.family === "IPv4" && !a.internal) console.log(`same Wi-Fi: http://${a.address}:${PORT}/?k=${KEY}`);
});
