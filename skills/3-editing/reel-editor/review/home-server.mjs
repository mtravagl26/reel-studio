#!/usr/bin/env node
// Added by By Mel Ross (0.12.0). The Reel Studio home page: check a clip before editing, pick the kind of reel, copy the request.
// It runs with no reel folder, so it is the first link a person gets. The per-reel pages (review, looks, touch-ups) are still
// served by studio-server.mjs once a reel exists.
//
// Usage: node home-server.mjs [--port 4790]
//   GET  /                     the page (home.html) with the formats and the person's reels
//   POST /api/check?name=x.mp4 the clip as the request body. Saved to ~/reels/inbox/, checked by scripts/framing_check.py
//   GET  /frame/<name>.jpg     the still the check was drawn on
// This computer only: it listens on 127.0.0.1 and refuses requests from other sites (review-shim.mjs trusted()).
// Nothing is sent anywhere. REELS_HOME is honoured.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { trusted } from "./review-shim.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), SKILL = path.dirname(HERE);
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt; };
const PORT = Number(arg("--port", 4790));
const HOME = (process.env.REELS_HOME || path.join(os.homedir(), "reels")).replace(/^~(?=$|\/)/, os.homedir());
const INBOX = path.join(HOME, "inbox");
const VIDEO = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv"]);
const MAX_BYTES = 4e9;                                             // a long 4K clip is a few GB; past that something is wrong
const readJSON = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return dflt; } };
const json = (res, code, body) => res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify(body));

/** A safe file name in the inbox: the person's own name kept readable, anything odd dropped, never overwriting another clip. */
function inboxName(raw) {
  const ext = path.extname(String(raw || "")).toLowerCase();
  if (!VIDEO.has(ext)) throw new Error("That file isn't a video this editor reads. Use .mp4 or .mov.");
  const stem = path.basename(String(raw), path.extname(String(raw))).normalize("NFKD").replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "clip";
  let name = stem + ext;
  for (let n = 2; fs.existsSync(path.join(INBOX, name)); n++) name = `${stem}-${n}${ext}`;
  return name;
}

function runCheck(file, frame) {
  return new Promise((resolve, reject) => {
    const p = spawn("python3", [path.join(SKILL, "scripts", "framing_check.py"), file, "--json", "--frame", frame], { env: { ...process.env, REELS_HOME: HOME } });
    let out = "", err = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => { try { if (code !== 0) throw new Error(err.trim().split("\n").pop() || "the check stopped"); resolve(JSON.parse(out.trim().split("\n").pop())); } catch (e) { reject(e); } });
  });
}

/** The person's reels: folders in ~/reels that hold a raw clip or an edit. Names and state only. */
function reels() {
  let dirs = []; try { dirs = fs.readdirSync(HOME, { withFileTypes: true }); } catch { return []; }
  const skip = new Set(["inbox", "themes", "kits", "fonts", "assets", "out", "node_modules"]);
  return dirs.filter((d) => d.isDirectory() && !d.name.startsWith(".") && !skip.has(d.name)).map((d) => {
    const dir = path.join(HOME, d.name), has = (f) => fs.existsSync(path.join(dir, f));
    if (!has("edit.json") && !has("edl.json") && !has("transcript.json")) return null;
    return { name: d.name, state: has("final.mp4") ? "built" : has("edit.json") ? "in progress" : "cut being reviewed", when: fs.statSync(dir).mtimeMs };
  }).filter(Boolean).sort((a, b) => b.when - a.when).slice(0, 12);
}

function page() {
  const formats = (readJSON(path.join(SKILL, "assets", "formats.json"), {}).formats || []).filter((f) => f.status === "ready");
  const data = { formats, reels: reels(), inbox: INBOX.replace(os.homedir(), "~"), brand: fs.existsSync(path.join(HOME, "brand.json")) };
  return fs.readFileSync(path.join(HERE, "home.html"), "utf8").replace("/*HOME*/null", () => JSON.stringify(data).replace(/</g, "\\u003c"));
}

const server = http.createServer(async (req, res) => {
  try {
    if (!trusted(req, PORT, false)) { res.writeHead(403, { "Content-Type": "text/plain" }).end("This page only answers the browser on this computer."); return; }
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`), p = url.pathname;
    if (req.method === "GET" && p === "/") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(page()); return; }
    if (req.method === "GET" && p === "/favicon.ico") { res.writeHead(204).end(); return; }
    if (req.method === "GET" && p.startsWith("/frame/")) {
      const name = decodeURIComponent(p.slice(7));
      if (!/^[A-Za-z0-9 _-]{1,70}\.jpg$/.test(name)) { res.writeHead(404).end(); return; }
      const file = path.join(INBOX, ".frames", name);
      if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
      res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store" }); fs.createReadStream(file).pipe(res); return;
    }
    if (req.method === "POST" && p === "/api/check") {
      let name;
      try { name = inboxName(url.searchParams.get("name")); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
      if (Number(req.headers["content-length"] || 0) > MAX_BYTES) return json(res, 413, { ok: false, error: "That file is too big to check here." });
      fs.mkdirSync(path.join(INBOX, ".frames"), { recursive: true });
      const file = path.join(INBOX, name), tmp = file + ".part";
      try {
        let seen = 0; req.on("data", (c) => { seen += c.length; if (seen > MAX_BYTES) req.destroy(new Error("too big")); });
        await pipeline(req, fs.createWriteStream(tmp));              // straight to disk: a 4K clip never sits in memory
        if (!fs.statSync(tmp).size) throw new Error("The file arrived empty. Try again.");
        fs.renameSync(tmp, file);
        const frame = path.basename(name, path.extname(name)) + ".jpg";
        const result = await runCheck(file, path.join(INBOX, ".frames", frame));
        return json(res, 200, { ok: true, saved: path.join(INBOX, name).replace(os.homedir(), "~"), frame: "/frame/" + encodeURIComponent(frame), result });
      } catch (e) {
        fs.rmSync(tmp, { force: true });
        return json(res, 400, { ok: false, error: /can't read a video/.test(e.message) ? "That file couldn't be read as a video." : String(e.message || e) });
      }
    }
    res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
  } catch (e) { try { json(res, 500, { ok: false, error: String(e.message || e) }); } catch {} }
});
server.on("error", (e) => { console.error(e.code === "EADDRINUSE" ? `Port ${PORT} is in use. Reel Studio home may already be open: http://127.0.0.1:${PORT}/  (or pass --port)` : String(e)); process.exit(1); });
server.listen(PORT, "127.0.0.1", () => console.log(`Reel Studio home: http://127.0.0.1:${PORT}/\nClips checked here are kept in ${INBOX}`));
