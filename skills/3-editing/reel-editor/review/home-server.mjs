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
import { lookPreviews } from "./look-preview.mjs";
import { themePreviews, themeRoutes } from "./theme-preview.mjs";
import { recommender } from "./recommend.mjs";
import * as MUSIC from "./music.mjs";

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

// Added by By Mel Ross (0.26.0): looks on the home page. A first-time user picks a theme or looks before the first edit, and
// the picks go into the request to Claude. The looks gallery is the same page as the reel link's /styles; picks are kept in
// ~/reels/.home-picks.json, so they stay picked for the next reel too.
const THEME_OK = /^[a-z0-9][a-z0-9-]{0,40}$/, PICKS = path.join(HOME, ".home-picks.json"), USABLE = new Set(["built", "partial", "cut-choice"]);
function themes() {
  const out = new Map();
  for (const dir of [path.join(SKILL, "themes"), path.join(HOME, "themes")]) {
    let names = []; try { names = fs.readdirSync(dir).sort(); } catch { continue; }
    for (const n of names) { const t = THEME_OK.test(n) && readJSON(path.join(dir, n, "theme.json"), null); if (t) out.set(n, { id: n, name: String(t.name || n).slice(0, 40), summary: String(t.summary || "").slice(0, 200) }); }
  }
  return [...out.values()];
}
const looks = () => Object.entries(readJSON(path.join(SKILL, "assets", "style-menu.json"), {}).looks || {}).map(([id, l]) => ({ id, name: l.name, group: l.group, status: l.status, missing: l.missing || null, needs: l.needs || null, does: l.does || null, recipe: l.recipe || null }));
const extras = () => readJSON(path.join(SKILL, "assets", "style-extras.json"), {}).extras || [];
function picks() { const p = readJSON(PICKS, {}); return { ids: Array.isArray(p.ids) ? p.ids : [], extras: Array.isArray(p.extras) ? p.extras : [], theme: typeof p.theme === "string" ? p.theme : "", music: typeof p.music === "string" ? p.music : "" }; }
function setPicks(body) {
  const ok = new Set(looks().filter((l) => USABLE.has(l.status)).map((l) => l.id)), okx = new Set(extras().map((x) => x.id));
  const theme = String(body.theme || ""); if (theme && !themes().some((t) => t.id === theme)) throw new Error("unknown theme");
  const music = String(body.music || ""); if (music && !MUSIC.trackPath(HOME, music)) throw new Error("that track isn't in your music folder");   // 0.28.0
  const out = { ids: [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].filter((i) => ok.has(i)).slice(0, 40),
    extras: [...new Set((Array.isArray(body.extras) ? body.extras : []).map(String))].filter((i) => okx.has(i)), theme, at: {}, music };
  fs.mkdirSync(HOME, { recursive: true }); fs.writeFileSync(PICKS, JSON.stringify(out)); return out;
}
// 0.27.0: "Show me on my clip" uses the last clip checked on this page
function lastClip() {
  try { return fs.readdirSync(INBOX).filter((n) => VIDEO.has(path.extname(n).toLowerCase())).map((n) => path.join(INBOX, n)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null; } catch { return null; }
}
const LOOKP = lookPreviews({ scripts: path.join(SKILL, "scripts"), home: HOME, env: { ...process.env, REELS_HOME: HOME, HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1" }, tag: "home" });
const RECOMMEND = recommender({ scripts: path.join(SKILL, "scripts"), env: { ...process.env, REELS_HOME: HOME } });   // 0.34.0
const THEMEP = themePreviews({ scripts: path.join(SKILL, "scripts"), home: HOME, env: { ...process.env, REELS_HOME: HOME, HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1" }, tag: "home" });   // 0.33.0
function looksPage() {
  const data = { reel: null, looks: looks(), extras: extras(), themes: themes(), picks: picks(), canSave: true, saveUrl: "/api/home-picks", back: "Back to the start",
    preview: true, previewUrl: "/api/look-preview", previewClip: lastClip() ? path.basename(lastClip()) : null, when: null, lines: [] };
  return fs.readFileSync(path.join(HERE, "style-menu.html"), "utf8").replace("/*MENU*/null", () => JSON.stringify(data).replace(/</g, "\\u003c"));
}

function page() {
  const formats = (readJSON(path.join(SKILL, "assets", "formats.json"), {}).formats || []).filter((f) => f.status === "ready");
  // audit 3: every checked clip is kept, and nothing ever removed them. The page now says how much is there.
  let kept = { count: 0, bytes: 0 };
  try { for (const n of fs.readdirSync(INBOX)) if (VIDEO.has(path.extname(n).toLowerCase())) { kept.count++; kept.bytes += fs.statSync(path.join(INBOX, n)).size; } } catch {}
  const all = looks(), names = Object.fromEntries(all.map((l) => [l.id, l.name]));
  const data = { formats, reels: reels(), inbox: INBOX.replace(os.homedir(), "~"), kept, brand: fs.existsSync(path.join(HOME, "brand.json")),
    themes: themes(), picks: picks(), lookNames: names, music: MUSIC.tracks(HOME), musicDir: MUSIC.musicDir(HOME).replace(os.homedir(), "~"), lookCount: all.filter((l) => USABLE.has(l.status)).length };
  return fs.readFileSync(path.join(HERE, "home.html"), "utf8").replace("/*HOME*/null", () => JSON.stringify(data).replace(/</g, "\\u003c"));
}

const server = http.createServer(async (req, res) => {
  try {
    if (!trusted(req, PORT, false)) { res.writeHead(403, { "Content-Type": "text/plain" }).end("This page only answers the browser on this computer."); return; }
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`), p = url.pathname;
    if (req.method === "GET" && p === "/") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(page()); return; }
    if (req.method === "GET" && p === "/looks") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(looksPage()); return; }
    if (await themeRoutes(THEMEP, req, res, p, lastClip, json)) return;   // 0.33.0: every theme on my clip
    if (p === "/api/recommend" && req.method === "GET") {   // 0.34.0: 3 looks for this clip, with reasons
      try { return json(res, 200, { ok: true, ...(await RECOMMEND(lastClip(), url.searchParams.get("style"))) }); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
    }
    if (p === "/api/look-preview" && req.method === "GET") return json(res, 200, { ok: true, ...LOOKP.state() });   // 0.27.0
    if (p === "/api/look-preview" && req.method === "POST") {
      let body = ""; for await (const c of req) { body += c; if (body.length > 1e5) return json(res, 413, { ok: false, error: "too big" }); }
      try { LOOKP.start(lastClip(), JSON.parse(body || "{}")); return json(res, 200, { ok: true, ...LOOKP.state() }); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
    }
    if (req.method === "GET" && p === "/look-preview.jpg") { const f = LOOKP.image(); if (!f) { res.writeHead(404).end(); return; } res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store" }); fs.createReadStream(f).pipe(res); return; }
    if (req.method === "GET" && p.startsWith("/music/")) { let n = ""; try { n = decodeURIComponent(p.slice(7)); } catch {} return MUSIC.serveTrack(HOME, n, res); }   // 0.28.0
    if (req.method === "POST" && p === "/api/music-starters") {   // 0.28.0: 3 soft beds made here, nothing to license
      try { const made = await MUSIC.makeStarters(HOME, path.join(SKILL, "scripts")); return json(res, 200, { ok: true, made, music: MUSIC.tracks(HOME) }); }
      catch (e) { return json(res, 500, { ok: false, error: String(e.message || e) }); }
    }
    if (req.method === "POST" && p === "/api/music-upload") {
      try { const name = await MUSIC.upload(HOME, req, url.searchParams.get("name")); return json(res, 200, { ok: true, name, music: MUSIC.tracks(HOME) }); }
      catch (e) { return json(res, 400, { ok: false, error: String(e.message || e) }); }
    }
    if (req.method === "POST" && p === "/api/home-picks") {
      let body = ""; for await (const c of req) { body += c; if (body.length > 1e5) return json(res, 413, { ok: false, error: "too big" }); }
      try { return json(res, 200, { ok: true, picks: setPicks(JSON.parse(body || "{}")) }); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
    }
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
      // audit 3: two uploads of the same name at once used to share one .part file, and one of them failed. Each upload now
      // writes to its own temporary file, and the final name is chosen when the file is complete.
      const tmp = path.join(INBOX, `.upload-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.part`);
      try {
        let seen = 0; req.on("data", (c) => { seen += c.length; if (seen > MAX_BYTES) req.destroy(new Error("too big")); });
        await pipeline(req, fs.createWriteStream(tmp));              // straight to disk: a 4K clip never sits in memory
        if (!fs.statSync(tmp).size) throw new Error("The file arrived empty. Try again.");
        name = inboxName(url.searchParams.get("name")); const file = path.join(INBOX, name);
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
