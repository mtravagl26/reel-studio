#!/usr/bin/env node
// Added by By Mel Ross. The reel editor page: a phone-friendly page where you edit a reel by tapping (caption words, keep/drop cuts, pills,
// stickers, sound effects, GIF/graphic/photo popups, front/behind layer for text) and a Re-render button rebuilds it.
// Everything is written to the files the pipeline already reads (edit.json, edl.json, brand.json), nothing leaves this computer.
// Usage: node editor-server.mjs <reel-folder> [--port 4792] [--lan] [--review-url <url>] [--cover-url <url>]
//   default: http://127.0.0.1:4792/ on this computer only
//   --lan:   also reachable from a phone/laptop on the same Wi-Fi; prints a URL with a one-off key (?k=...), same as review/serve.mjs
// Environment: REELS_HOME (default: the folder holding this reel, it must have brand.json). Child steps run with telemetry off.
// Plain Node, no dependencies. The cut/render steps are the skill's own scripts (cut.py, render.sh, qa.py).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { SHIM, DOCS, WRITABLE, trusted } from "./review-shim.mjs";
import { lookPreviews } from "./look-preview.mjs";
import { themePreviews, themeRoutes } from "./theme-preview.mjs";
import * as MUSIC from "./music.mjs";
import { fileURLToPath } from "node:url";
import * as core from "./editor-core.mjs";

const args = process.argv.slice(2);
const REEL = path.resolve(args.find((a, i) => !a.startsWith("--") && !(i > 0 && ["--port", "--review-url", "--cover-url"].includes(args[i - 1]))) || ".");
const PORT = Number(args[args.indexOf("--port") + 1]) || 4792;
const LAN = args.includes("--lan");
// Added by By Mel Ross: addresses of the other two Reel Studio pages, shown as links in the step bar (both optional).
const flag = (n) => { const i = args.indexOf(n); return i >= 0 && /^https?:\/\//.test(args[i + 1] || "") ? args[i + 1] : null; };
const LINKS = { review: flag("--review-url") || "/review", touchups: "/touchups", edit: "/edit", cover: flag("--cover-url"), caption: "/caption" };   // 0.28.0: edit = review + touch-ups on one page
const KEY = LAN ? crypto.randomBytes(9).toString("base64url") : null;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, "..");
const SCRIPTS = process.env.REEL_EDITOR_SCRIPTS || path.join(SKILL, "scripts");   // REEL_EDITOR_SCRIPTS: for tests (stand-ins for the cut and the render)
const HOME = path.resolve(process.env.REELS_HOME || path.dirname(REEL));
if (!fs.existsSync(REEL)) { console.error(`no reel folder: ${REEL}`); process.exit(1); }
if (!fs.existsSync(path.join(HOME, "brand.json"))) { console.error(`no brand.json in ${HOME}: set REELS_HOME to the reels workspace`); process.exit(1); }

const P = {
  edit: path.join(REEL, "edit.json"), edl: path.join(REEL, "edl.json"), tr: path.join(REEL, "master_transcript.json"),
  expected: path.join(REEL, "expected.txt"), master: path.join(REEL, "master.mp4"), final: path.join(REEL, "final.mp4"),
  brand: path.join(HOME, "brand.json"),
  dir: path.join(REEL, "editor"), state: path.join(REEL, "editor", "state.json"), meta: path.join(REEL, "editor", "render-meta.json"),
  job: path.join(REEL, "editor", "job.json"), log: path.join(REEL, "editor", "render.log"), hist: path.join(REEL, "editor", "history"),
  renders: path.join(REEL, "renders"), popups: path.join(REEL, "popups"),
};
// Reel Studio on one link (Added by By Mel Ross, 0.6.0): this server also serves the review page, so it can start before the reel is
// built. Touch-ups need edit.json + edl.json; until they exist the touch-ups page says so and points back to the review step.
const REVIEW_DB = path.join(REEL, "review_db");
const built = () => fs.existsSync(P.edit) && fs.existsSync(P.edl);
const hasReview = () => fs.existsSync(path.join(REVIEW_DB, "reel", "current.json"));

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4", ".webm": "video/webm", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".wav": "audio/wav", ".otf": "font/otf", ".ttf": "font/ttf", ".woff2": "font/woff2" };

// ---- small file helpers ---------------------------------------------------------------------------------------------------------------
const readJSON = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return dflt; } };
const writeJSON = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + ".tmp", JSON.stringify(o, null, 1) + "\n"); fs.renameSync(f + ".tmp", f); };
const writeText = (f, s) => { fs.writeFileSync(f + ".tmp", s); fs.renameSync(f + ".tmp", f); };
const sha = (...parts) => crypto.createHash("sha1").update(parts.join("\u0000")).digest("hex");
const exists = (f) => fs.existsSync(f);
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 23);
const run = (cmd, a, opts = {}) => spawnSync(cmd, a, { encoding: "utf8", ...opts });
const PRESET_SPEED = { natural: 1.0, tight: 1.1, fast: 1.15 };   // scripts/pacing.py

function childEnv() {
  const e = { ...process.env, REELS_HOME: HOME, HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1", REEL_PREVIEW: "1", REEL_NO_NICE: "1" };
  const venv = [path.resolve(SKILL, "../../../.favstash-studio/pyenv/bin"), path.join(os.homedir(), "Movies/Video Studio/.favstash-studio/pyenv/bin")].find(exists);
  if (venv) e.PATH = `${venv}:${e.PATH}`;
  return e;
}

// ---- state ----------------------------------------------------------------------------------------------------------------------------
const brandJSON = () => readJSON(P.brand, {});
const speedOf = (brand, edl) => Number(brand.speed) || PRESET_SPEED[brand.pacing || "natural"] || 1.0;
const durOf = (f) => { const r = run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]); const n = parseFloat(r.stdout); return Number.isFinite(n) ? n : null; };
let masterDur = { mtime: 0, dur: null };
function masterDuration() {
  try { const m = fs.statSync(P.master).mtimeMs; if (m !== masterDur.mtime) masterDur = { mtime: m, dur: durOf(P.master) }; } catch { masterDur = { mtime: 0, dur: null }; }
  return masterDur.dur;
}

// The clip as filmed, for the receipt (0.14.0). edl.json names it; its length is read once per file.
let srcDur = { key: "", dur: null };
function sourceDuration() {
  try {
    const src = path.resolve(REEL, String(readJSON(P.edl, {}).source || "")), key = src + fs.statSync(src).mtimeMs;
    if (key !== srcDur.key) srcDur = { key, dur: durOf(src) };
  } catch { srcDur = { key: "", dur: null }; }
  return srcDur.dur;
}
const receiptNow = (st, edit, brand) => core.receipt({ state: st, edit, srcDur: sourceDuration(),
  themeName: (listThemes().find((t) => t.id === (edit.theme || brand.theme)) || {}).name || null });

let notes = [];   // things the page should say once (state rebuilt, etc.)
function loadState() {
  const edl = readJSON(P.edl, {}), brand = brandJSON();
  const speed = speedOf(brand, edl), want = JSON.stringify([edl.keep, speed, Number(edl.xfade || 0)]);
  let st = readJSON(P.state, null);
  if (st && core.cutKey(st) !== want) {
    notes.push("The cuts in edl.json were changed outside this page, so the drop/keep history started over.");
    st = null;
  }
  if (!st) { st = core.initState(edl, speed); writeJSON(P.state, st); }
  return st;
}
const cutKeyNow = (st) => sha(core.cutKey(st));
const editHash = () => sha(fs.readFileSync(P.edit, "utf8"), fs.readFileSync(P.edl, "utf8"), JSON.stringify(brandJSON().text_default || null),
  ...(brandJSON().theme ? [`theme:${brandJSON().theme}`] : []));   // a brand-wide theme changes the look of this reel too (added only when one is set, so older reels keep their hash)

// ---- themes (Added by By Mel Ross, 0.9.0): the same folders scripts/theme.py reads, your own first
const THEME_OK = /^[a-z0-9][a-z0-9_-]{0,40}$/;
function listThemes() {
  const out = new Map();
  for (const dir of [path.join(SKILL, "themes"), path.join(HOME, "themes")]) {
    if (!exists(dir)) continue;
    for (const n of fs.readdirSync(dir).sort()) {
      if (!THEME_OK.test(n) || !exists(path.join(dir, n, "theme.json"))) continue;
      const t = readJSON(path.join(dir, n, "theme.json"), {});
      out.set(n, { id: n, name: String(t.name || n).slice(0, 40), summary: String(t.summary || "").slice(0, 200) });
    }
  }
  return [...out.values()];
}
// The Style Menu page (Added by By Mel Ross, 0.10.0): the looks from assets/style-menu.json, the themes, and this reel's picks.
const MENU_FILE = path.join(SKILL, "assets", "style-menu.json"), PICKS_FILE = path.join(REEL, "style-picks.json");
const USABLE_LOOK = new Set(["built", "partial", "cut-choice"]);
function menuLooks() {
  const looks = (readJSON(MENU_FILE, {}).looks) || {};
  return Object.entries(looks).map(([id, l]) => ({ id, name: l.name, group: l.group, status: l.status, missing: l.missing || null, needs: l.needs || null, does: l.does || null, recipe: l.recipe || null }));
}
const menuExtras = () => (readJSON(path.join(SKILL, "assets", "style-extras.json"), {}).extras) || [];   // 0.10.1: animations and moving extras
function stylePicks() { const p = readJSON(PICKS_FILE, {}); return { ids: Array.isArray(p.ids) ? p.ids : [], extras: Array.isArray(p.extras) ? p.extras : [], theme: typeof p.theme === "string" ? p.theme : "", at: p.at && typeof p.at === "object" ? p.at : {} }; }
// Added by By Mel Ross (0.27.0): the lines of this reel, so a picked look can be put on a line ("Put it here"). Cut times when
// the reel is cut (edit.json captions), raw-clip times before that (review_reel.json). "when" says which.
function lookLines() {
  const ed = readJSON(P.edit, {}), caps = Array.isArray(ed.captions) ? ed.captions : [];
  if (caps.length && exists(P.master)) return { when: "cut", lines: caps.filter((c) => c && Array.isArray(c.words) && c.words.length).map((c) => ({ t: +(+c.start).toFixed(2), text: c.words.map((w) => w.text).join(" ").slice(0, 80) })) };
  const rr = readJSON(path.join(REEL, "review_reel.json"), null);
  if (rr && Array.isArray(rr.captions) && Array.isArray(rr.words))
    return { when: "raw", lines: rr.captions.filter((c) => Array.isArray(c.w) && c.w.length && rr.words[c.w[0]]).map((c) => ({ t: +(+rr.words[c.w[0]].s).toFixed(2), text: c.w.map((i) => (rr.words[i] || {}).text || "").join(" ").slice(0, 80) })) };
  return { when: null, lines: [] };
}
const LOOKP = lookPreviews({ scripts: SCRIPTS, home: HOME, env: childEnv(), tag: path.basename(REEL).replace(/[^\w.-]+/g, "_") });
const THEMEP = themePreviews({ scripts: SCRIPTS, home: HOME, env: childEnv(), tag: path.basename(REEL).replace(/[^\w.-]+/g, "_") });   // 0.33.0
function setStylePicks(body) {
  const ok = new Set(menuLooks().filter((l) => USABLE_LOOK.has(l.status)).map((l) => l.id));
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].filter((i) => ok.has(i)).slice(0, 40);
  const theme = String(body.theme || "");
  if (theme && !listThemes().some((t) => t.id === theme)) throw new Error("unknown theme");
  const okx = new Set(menuExtras().map((x) => x.id));
  const extras = [...new Set((Array.isArray(body.extras) ? body.extras : []).map(String))].filter((i) => okx.has(i));
  const at = {};   // 0.27.0: "Put it here": a picked look's line, as a time
  for (const [k, v] of Object.entries(body.at && typeof body.at === "object" ? body.at : {})) if (ids.includes(k) && Number.isFinite(+v) && +v >= 0 && +v < 36000) at[k] = +(+v).toFixed(2);
  writeJSON(PICKS_FILE, { ids, extras, theme, at });
  return { ids, extras, theme, at };
}
function stylePage() {
  const data = { reel: path.basename(REEL), looks: menuLooks(), extras: menuExtras(), themes: listThemes(), picks: stylePicks(), canSave: true,
    preview: true, previewUrl: "/api/look-preview", ...lookLines() };   // 0.27.0: "Show me on my clip" and "Put it here"
  return fs.readFileSync(path.join(HERE, "style-menu.html"), "utf8").replace("/*MENU*/null", () => JSON.stringify(data).replace(/</g, "\\u003c"));
}
// Added by By Mel Ross (0.16.0): the color box. 3 colors (main, pop, light) for this reel only (edit.json "colors") or for every
// reel (brand.json "colors"). An empty set for this reel goes back to the brand's colors.
const HEX = /^#[0-9a-fA-F]{6}$/;
function setColors(body) {
  requireIdle();
  const scope = body.scope === "all" ? "all" : "reel", got = {};
  for (const k of ["main", "pop", "light"]) { const v = body.colors?.[k]; if (v == null || v === "") continue; if (!HEX.test(String(v))) throw new Error("a color must look like #B9C8A5"); got[k] = String(v).toUpperCase(); }
  snapshot("colors", null, true);
  const edit = readJSON(P.edit, {}), brand = brandJSON();
  if (scope === "reel") { if (Object.keys(got).length) edit.colors = got; else delete edit.colors; }
  else { if (!Object.keys(got).length) throw new Error("pick at least 1 color"); brand.colors = { ...(brand.colors || {}), ...got }; delete edit.colors; writeJSON(P.brand, brand); }
  writeJSON(P.edit, edit);
}
// Added by By Mel Ross (0.23.0): the highlighted caption word: its text color and an optional box behind it. For this reel
// (edit.json "caption_highlight") or every reel (brand.json "caption_highlight"). An empty set for this reel goes back to the usual.
function cleanHighlight(h) {
  const out = {};
  if (h && h.words != null && h.words !== "") { if (!HEX.test(String(h.words))) throw new Error("a color must look like #B9C8A5"); out.words = String(h.words).toUpperCase(); }
  if (h && h.text != null && h.text !== "") { if (!HEX.test(String(h.text))) throw new Error("a color must look like #B9C8A5"); out.text = String(h.text).toUpperCase(); }
  // 0.27.0: a box behind all the words ("none" = no box) and the caption size, 60 to 160
  if (h && h.box != null && h.box !== "") { if (h.box !== "none" && !HEX.test(String(h.box))) throw new Error("a color must look like #B9C8A5"); out.box = h.box === "none" ? "none" : String(h.box).toUpperCase(); }
  if (h && h.size != null && h.size !== "") { const n = Math.round(+h.size); if (!(n >= 60 && n <= 160)) throw new Error("the caption size goes from 60 to 160"); out.size = n; }
  if (h && h.bg != null && h.bg !== "") { if (h.bg !== "none" && !HEX.test(String(h.bg))) throw new Error("a color must look like #B9C8A5"); out.bg = h.bg === "none" ? "none" : String(h.bg).toUpperCase(); }
  return out;
}
function setHighlight(body) {
  requireIdle();
  const scope = body.scope === "all" ? "all" : "reel", got = cleanHighlight(body.highlight);
  snapshot("highlighted word", null, true);
  const edit = readJSON(P.edit, {}), brand = brandJSON();
  delete edit.caption_colors; delete edit.caption_style;   // the hand-written forms of the same setting: the page's pick replaces them
  if (scope === "reel") { if (Object.keys(got).length) edit.caption_highlight = got; else delete edit.caption_highlight; }
  else { if (!Object.keys(got).length) throw new Error("pick a color first"); brand.caption_highlight = { ...(brand.caption_highlight || {}), ...got }; delete edit.caption_highlight; writeJSON(P.brand, brand); }
  writeJSON(P.edit, edit);
}
// What the highlighted word looks like before any pick: the theme's choice when a theme sets one, else the brand's.
function highlightBase(edit, brand) {
  const c = brand.colors || {}, pop = edit.colors?.pop || c.pop || "#B9C8A5", main = edit.colors?.main || c.main || "#141414";
  let text = c.caption_accent || pop, words = c.caption || "#FFFFFF", box = brand.captions?.bg || "none", size = +brand.captions?.size || 96;
  const tok = (v, d) => v === "@pop" ? pop : v === "@main" ? main : v === "@light" ? (edit.colors?.light || c.light || "#FFFFFF") : HEX.test(String(v || "")) ? v : d;
  const old = edit.caption_colors && typeof edit.caption_colors === "object" ? edit.caption_colors : {};
  const name = edit.theme || brand.theme;
  if (name && name !== "none" && THEME_OK.test(name)) {
    for (const dir of [path.join(HOME, "themes"), path.join(SKILL, "themes")]) {
      const t = readJSON(path.join(dir, name, "theme.json"), null), v = t?.brand?.colors?.caption_accent;
      if (!t) continue;
      text = tok(v, text); words = tok(t?.brand?.colors?.caption, words);
      if (t?.brand?.captions?.bg) box = t.brand.captions.bg; if (+t?.brand?.captions?.size) size = +t.brand.captions.size;
      break;
    }
  }
  if (HEX.test(String(old.caption_accent || ""))) text = old.caption_accent;   // written by hand before the pages had this
  if (HEX.test(String(old.caption || ""))) words = old.caption;
  const cs = edit.caption_style && typeof edit.caption_style === "object" ? edit.caption_style : {};   // older hand-written form, one reel
  if (cs.bg) box = cs.bg; if (+cs.size >= 60 && +cs.size <= 160) size = +cs.size;
  if (box !== "none" && !HEX.test(String(box))) box = String(box);   // a theme's see-through box (rgba) is shown as it is
  return { words: String(words).toUpperCase(), text: String(text).toUpperCase(), bg: "none", box: HEX.test(String(box)) ? String(box).toUpperCase() : box, size: Math.round(size) };
}
// Added by By Mel Ross (0.19.0): sound effects on or off, for this reel (edit.json "sfx") or every reel (brand.json "sfx").
function setSfx(body) {
  requireIdle();
  const on = body.on !== false, scope = body.scope === "all" ? "all" : "reel";
  snapshot("sfx", null, true);
  const edit = readJSON(P.edit, {}), brand = brandJSON();
  if (scope === "all") { brand.sfx = on ? (brand.sfx && brand.sfx !== "none" ? brand.sfx : "subtle") : "none"; delete edit.sfx; writeJSON(P.brand, brand); }
  else if (on === ((brand.sfx ?? "subtle") !== "none")) delete edit.sfx; else edit.sfx = on ? "subtle" : "none";
  writeJSON(P.edit, edit);
}
// Added by By Mel Ross (0.25.0): how loud the sound effects are, for this reel (edit.json "mix.effects") or every reel (brand.json).
const SFX_VOL = { quieter: -6, normal: 0, louder: 4 };
function setSfxVolume(body) {
  requireIdle();
  if (!(body.level in SFX_VOL)) throw new Error("pick quieter, normal or louder");
  const v = SFX_VOL[body.level], scope = body.scope === "all" ? "all" : "reel";
  snapshot("sound effects volume", null, true);
  const edit = readJSON(P.edit, {}), brand = brandJSON();
  if (scope === "all") { brand.mix = { ...(brand.mix || {}), effects: v }; if (edit.mix) delete edit.mix.effects; writeJSON(P.brand, brand); }
  else if (v === (brand.mix?.effects ?? 0)) { if (edit.mix) delete edit.mix.effects; }
  else edit.mix = { ...(edit.mix || {}), effects: v };
  if (edit.mix && !Object.keys(edit.mix).length) delete edit.mix;
  writeJSON(P.edit, edit);
}
// Added by By Mel Ross (0.26.0): where captions sit. "captions-high" (above the head, text graphics in the lower third) or
// "captions-low". For this reel (edit.json "layout") or every reel (brand.json "layout").
function setLayout(body) {
  requireIdle();
  const v = body.layout === "captions-high" ? "captions-high" : "captions-low", scope = body.scope === "all" ? "all" : "reel";
  snapshot("caption spot", null, true);
  const edit = readJSON(P.edit, {}), brand = brandJSON();
  if (scope === "all") { brand.layout = v; delete edit.layout; writeJSON(P.brand, brand); }
  else if (v === (brand.layout || "captions-low")) delete edit.layout; else edit.layout = v;
  writeJSON(P.edit, edit);
}
// Added by By Mel Ross (0.29.0): show captions earlier, for word times that run late. 0 to 0.5 s, for this reel (edit.json
// "caption_lead") or every reel (brand.json).
function setCaptionLead(body) {
  requireIdle();
  const v = Math.round(Math.min(0.5, Math.max(0, Number(body.lead) || 0)) * 100) / 100, scope = body.scope === "all" ? "all" : "reel";
  snapshot("caption timing", null, true);
  const edit = readJSON(P.edit, {}), brand = brandJSON();
  if (scope === "all") { if (v) brand.caption_lead = v; else delete brand.caption_lead; delete edit.caption_lead; writeJSON(P.brand, brand); }
  else if (v === (Number(brand.caption_lead) || 0)) delete edit.caption_lead; else edit.caption_lead = v;
  writeJSON(P.edit, edit);
}
// Added by By Mel Ross (0.28.0): add a look from the Style Menu at the playhead. The look's recipe card(s) go in as they are
// (they come from assets/style-menu.json, not from the page), moved so the first starts at t; several cards keep their spacing.
const ADDABLE = (l) => ["built", "partial"].includes(l.status) && l.group !== "Captions" && l.recipe && ["hook", "layout"].includes(l.recipe.slot) && (l.recipe.card || l.recipe.cards) && !l.recipe.needs_photos;
function addableLooks() { return menuLooks().filter(ADDABLE).map((l) => ({ id: l.id, name: l.name, group: l.group, does: l.does })); }
function addLook(body) {
  requireIdle();
  const look = menuLooks().find((l) => l.id === String(body.id || ""));
  if (!look || !ADDABLE(look)) throw new Error("that look can't be added here");
  const dur = masterDuration() || 600, t = Math.max(0, Math.min(+body.t || 0, dur - 0.5));
  const src = JSON.parse(JSON.stringify(look.recipe.cards || [look.recipe.card])), t0 = Math.min(...src.map((c) => +c.start || 0));
  const edit = readJSON(P.edit, {}); edit.cards = edit.cards || [];
  snapshot("add look " + look.id, null, false);
  for (const c of src) {
    const len = Math.max(0.8, (+c.end || (+c.start || 0) + 3) - (+c.start || 0));
    c.start = +(t + ((+c.start || 0) - t0)).toFixed(2); c.end = +Math.min(c.start + len, dur).toFixed(2);
    edit.cards.push({ id: core.genId(), ...c, look: look.id });
  }
  edit.cards.sort((a, b) => a.start - b.start);
  writeJSON(P.edit, edit);
  return { added: src.length, name: look.name };
}
// Added by By Mel Ross (0.28.0): background music for this reel: a track from ~/reels/music or none, and how loud it sits.
const MUSIC_LVL = { softer: -20, normal: -14, louder: -10 };
function setMusic(body) {
  requireIdle();
  const edit = readJSON(P.edit, {});
  snapshot("background music", null, true);
  if ("track" in body && body.scope !== "all") {
    const t = String(body.track || "");
    if (!t) edit.music = "none";
    else { if (!MUSIC.trackPath(HOME, t)) throw new Error("that track isn't in your music folder"); edit.music = path.join(MUSIC.musicDir(HOME), t).replace(os.homedir(), "~"); }
  }
  if ("start" in body) { const s = Math.round(+body.start * 10) / 10; if (!(s >= 0 && s <= 600)) throw new Error("start the track between 0 and 600 seconds"); if (s) edit.music_start = s; else delete edit.music_start; }
  if (body.scope === "all") {   // this track for every reel (brand.json); this reel follows it
    const brand = brandJSON(), t = String(body.track ?? "");
    if (t && !MUSIC.trackPath(HOME, t)) throw new Error("that track isn't in your music folder");
    if (t) brand.music = path.join(MUSIC.musicDir(HOME), t).replace(os.homedir(), "~"); else delete brand.music;
    writeJSON(P.brand, brand); delete edit.music;
  }
  if ("level" in body) { if (!(body.level in MUSIC_LVL)) throw new Error("pick softer, normal or louder"); edit.mix = { ...(edit.mix || {}), music: MUSIC_LVL[body.level] }; }
  writeJSON(P.edit, edit);
}
function musicNow(edit, brand) {
  const m = edit.music || brand.music || "";
  const abs = m && m !== "none" ? path.resolve(REEL, String(m).replace(/^~(?=\/)/, os.homedir())) : "", root = MUSIC.musicDir(HOME) + path.sep;
  const name = abs ? (abs.startsWith(root) ? abs.slice(root.length).split(path.sep).join("/") : path.basename(abs)) : "";
  const lv = edit.mix?.music ?? brand.mix?.music ?? -14;
  return { track: name, start: +(edit.music_start ?? brand.music_start ?? 0) || 0, everyReel: brand.music ? path.basename(String(brand.music)) : "", mine: !!edit.music, missing: !!name && !MUSIC.trackPath(HOME, name) && !fs.existsSync(path.resolve(REEL, String(m).replace(/^~(?=\/)/, os.homedir()))), level: lv <= -17 ? "softer" : lv >= -11 ? "louder" : "normal", tracks: MUSIC.tracks(HOME), dir: MUSIC.musicDir(HOME).replace(os.homedir(), "~") };
}
const volName = (v) => (v <= -3 ? "quieter" : v >= 2 ? "louder" : "normal");
function setTheme(body) {
  requireIdle();
  const name = String(body.name || ""), scope = body.scope === "reel" ? "reel" : "all";
  if (name && !listThemes().some((t) => t.id === name)) throw new Error("unknown theme");
  snapshot("theme", null, true);
  const edit = readJSON(P.edit, {}), brand = brandJSON();
  if (scope === "reel") { if (name) edit.theme = name; else edit.theme = "none"; }
  else { delete edit.theme; if (name) brand.theme = name; else delete brand.theme; writeJSON(P.brand, brand); }
  writeJSON(P.edit, edit);
}

// ---- GIPHY (Added by By Mel Ross, 0.9.0): the person's own key, kept where the ElevenLabs key is. The page searches GIPHY itself;
// this only fetches the one GIF they tapped into the reel's popups folder, and notes where it came from.
function giphyKey() {
  if (process.env.GIPHY_API_KEY) return process.env.GIPHY_API_KEY.trim();
  try { for (const line of fs.readFileSync(path.join(os.homedir(), ".config/reels/.env"), "utf8").split("\n")) if (line.startsWith("GIPHY_API_KEY=")) return line.split("=").slice(1).join("=").trim(); } catch { /* no file */ }
  return "";
}
// Added by By Mel Ross (0.15.0): the page saves the key, so nobody edits a hidden file. The key is tried on one search first, then
// written to ~/.config/reels/.env (other lines in that file are kept; only the person can read the file).
const ENV_FILE = () => path.join(os.homedir(), ".config/reels/.env");
async function giphySaveKey(body) {
  const key = String(body.key || "").trim().replace(/^GIPHY_API_KEY=/, "").replace(/^["']|["']$/g, "");
  if (!key) throw new Error("paste your GIPHY key in the box first");
  if (!/^[A-Za-z0-9]{16,64}$/.test(key)) throw new Error("that doesn't look like a GIPHY key: it is one run of letters and numbers, about 32 long, with no spaces");
  let tested = false;
  if (process.env.REEL_GIPHY_NO_CHECK !== "1") {
    let r = null;
    try { r = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=hello&limit=1&rating=g`, { signal: AbortSignal.timeout(8000) }); } catch { /* offline: save it untested */ }
    if (r && (r.status === 401 || r.status === 403)) throw new Error("GIPHY did not accept that key. Copy it again from developers.giphy.com, and check it is an API key (not an SDK key)");
    tested = !!(r && r.ok);
  }
  const f = ENV_FILE(); fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
  let lines = []; try { lines = fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("GIPHY_API_KEY=")); } catch { /* new file */ }
  lines.push(`GIPHY_API_KEY=${key}`);
  fs.writeFileSync(f + ".tmp", lines.join("\n") + "\n", { mode: 0o600 }); fs.renameSync(f + ".tmp", f); fs.chmodSync(f, 0o600);
  if (process.env.GIPHY_API_KEY) process.env.GIPHY_API_KEY = key;   // a key set when the link started would otherwise hide the new one
  return { tested };
}
async function giphyAdd(body) {
  requireIdle();
  const key = giphyKey(); if (!key) throw new Error("no GIPHY key on this computer yet");
  const id = String(body.id || ""); if (!/^[A-Za-z0-9]{6,40}$/.test(id)) throw new Error("that does not look like a GIPHY id");
  const meta = await fetch(`https://api.giphy.com/v1/gifs/${id}?api_key=${encodeURIComponent(key)}`);
  if (!meta.ok) throw new Error(meta.status === 429 ? "GIPHY's hourly limit is used up for this key: try again later" : `GIPHY said no (${meta.status})`);
  const d = (await meta.json()).data || {};
  const url = String(d.images?.original?.url || "");
  if (!/^https:\/\/[\w-]+\.giphy\.com\//.test(url)) throw new Error("GIPHY did not give a usable file for that one");
  const file = await fetch(url);
  if (!file.ok) throw new Error(`could not download it (${file.status})`);
  if (Number(file.headers.get("content-length") || 0) > 20e6) throw new Error("that GIF is over 20 MB: pick a smaller one");
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 20e6) throw new Error("that GIF is over 20 MB: pick a smaller one");
  if (buf.subarray(0, 3).toString("latin1") !== "GIF") throw new Error("GIPHY sent something that is not a GIF");
  const up = saveUpload(buf, `${String(d.title || "giphy").slice(0, 40) || "giphy"}.gif`);
  const log = path.join(P.popups, "sources.json"), all = readJSON(log, {});
  all[up.src] = { from: "GIPHY", id, page: String(d.url || ""), title: String(d.title || ""), by: String(d.username || ""), added: new Date().toISOString() };
  writeJSON(log, all);
  return up;
}

/** What the current video on disk was made from. First time here: trust final.mp4 when its length matches the cuts. */
function loadMeta(st) {
  let m = readJSON(P.meta, null);
  if (m) return m;
  const total = core.reelLength(st), md = masterDuration();
  const cutsMatch = md != null && Math.abs(md - total) < 0.25;
  m = { cut_key: cutsMatch ? cutKeyNow(st) : null, edit_hash: exists(P.final) ? editHash() : null, version: 0, at: new Date().toISOString(), assumed: true };
  writeJSON(P.meta, m);
  if (!cutsMatch) notes.push("master.mp4 does not match the cuts in edl.json: the next render will cut the video again.");
  return m;
}

// ---- history (every save keeps what it replaced) --------------------------------------------------------------------------------------
const SNAP_FILES = () => [["edit.json", P.edit], ["edl.json", P.edl], ["master_transcript.json", P.tr], ["expected.txt", P.expected], ["state.json", P.state]];
let lastSnap = null;
function snapshot(label, key, withBrand) {
  if (key && lastSnap && lastSnap.key === key && Date.now() - lastSnap.at < 30000 && (!withBrand || lastSnap.withBrand)) { lastSnap.at = Date.now(); return; }
  const dir = path.join(P.hist, `${stamp()}-${label.replace(/[^\w-]+/g, "-").slice(0, 40)}`);
  fs.mkdirSync(dir, { recursive: true });
  const files = SNAP_FILES(); if (withBrand) files.push(["brand.json", P.brand]);
  const meta = { label, at: new Date().toISOString(), had: {}, brand: !!withBrand };
  for (const [n, f] of files) { meta.had[n] = exists(f); if (exists(f)) fs.copyFileSync(f, path.join(dir, n)); }
  writeJSON(path.join(dir, "meta.json"), meta);
  lastSnap = { key, at: Date.now(), withBrand: !!withBrand };
}
const history = () => (exists(P.hist) ? fs.readdirSync(P.hist).filter((n) => exists(path.join(P.hist, n, "meta.json"))).sort() : []);
function undo() {
  const names = history(); if (!names.length) throw new Error("nothing to undo");
  const dir = path.join(P.hist, names[names.length - 1]), meta = readJSON(path.join(dir, "meta.json"), {});
  const files = { "edit.json": P.edit, "edl.json": P.edl, "master_transcript.json": P.tr, "expected.txt": P.expected, "state.json": P.state, "brand.json": P.brand };
  for (const [n, f] of Object.entries(files)) {
    if (n === "brand.json" && !meta.brand) continue;
    if (meta.had?.[n]) fs.copyFileSync(path.join(dir, n), f); else if (n in (meta.had || {})) fs.rmSync(f, { force: true });
  }
  fs.mkdirSync(path.join(P.hist, "undone"), { recursive: true });
  fs.renameSync(dir, path.join(P.hist, "undone", path.basename(dir)));
  lastSnap = null;
  return meta.label;
}

// ---- popup media ----------------------------------------------------------------------------------------------------------------------
const mediaInfo = new Map();
function probeMedia(rel) {
  const f = path.join(REEL, rel);
  let st; try { st = fs.statSync(f); } catch { return null; }
  const c = mediaInfo.get(rel); if (c && c.m === st.mtimeMs) return c.info;
  if (/\.svg$/i.test(rel)) {   // ffprobe can't always read an SVG, so its size comes from the file itself
    let info = null; try { if (st.size <= 5e6) info = svgSize(fs.readFileSync(f, "utf8")); } catch { /* unreadable */ }
    if (info) info = { ...info, animated: false, video: false };
    mediaInfo.set(rel, { m: st.mtimeMs, info }); return info;
  }
  const r = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,nb_frames,codec_name", "-of", "json", f]);
  let info = null;
  try { const s = JSON.parse(r.stdout).streams[0]; if (s.width > 0 && s.height > 0) info = { w: s.width, h: s.height, animated: /\.gif$/i.test(rel) && Number(s.nb_frames || 0) > 1, video: /\.(mp4|mov|m4v|webm)$/i.test(rel) }; } catch { /* not an image */ }
  mediaInfo.set(rel, { m: st.mtimeMs, info });
  return info;
}
// An SVG's size in pixels: its width and height, or its viewBox. null when the text is not an SVG.
function svgSize(text) {
  const m = /<svg\b[^>]*>/i.exec(String(text).replace(/<!--[\s\S]*?-->/g, "")); if (!m) return null;
  const at = (n) => (new RegExp(`\\s${n}\\s*=\\s*["']([^"']*)["']`, "i").exec(m[0]) || [])[1];
  const px = (v) => { const k = /^\s*([\d.]+)\s*(px)?\s*$/i.exec(v || ""); return k ? Number(k[1]) : 0; };
  let w = px(at("width")), h = px(at("height"));
  const vb = String(at("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { if (!w && !h) { w = vb[2]; h = vb[3]; } else if (!w) w = h * vb[2] / vb[3]; else if (!h) h = w * vb[3] / vb[2]; }
  if (!(w > 0) || !(h > 0)) { w = 512; h = 512; }
  const k = Math.max(w, h) < 64 ? 64 / Math.max(w, h) : 1;   // a 24 px icon still gets a usable starting size
  return { w: Math.max(Math.round(w * k), 1), h: Math.max(Math.round(h * k), 1) };
}
// Take out anything in an SVG that could run or reach the internet: scripts, embedded web pages, on-click handlers, outside links.
function cleanSvg(text) {
  return String(text)
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "").replace(/<script\b[^>]*\/>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/<(iframe|object|embed)\b[\s\S]*?(<\/\1\s*>|\/>)/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(xlink:href|href)\s*=\s*("\s*(?!#|data:image\/)[^"]*"|'\s*(?!#|data:image\/)[^']*')/gi, "");
}
function saveUpload(buf, rawName) {
  fs.mkdirSync(P.popups, { recursive: true });
  const ext = path.extname(rawName).toLowerCase();
  const base = path.basename(rawName, path.extname(rawName)).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "popup";
  const id = `${Date.now().toString(36)}-${base}`;
  const isVideo = [".mp4", ".mov", ".m4v", ".webm"].includes(ext);   // Added by By Mel Ross (0.13.0): a video clip or screen recording
  if (!isVideo && ![".gif", ".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif", ".svg"].includes(ext)) throw new Error("use a picture (gif, png, jpg, webp, heic, svg) or a video clip (mp4, mov)");
  let out = `${id}${ext === ".jpeg" ? ".jpg" : ext}`;
  if (ext === ".svg") {   // Added by By Mel Ross (0.15.0): an SVG stays an SVG, so it is sharp at any size. Anything that could run is taken out first.
    if (buf.length > 5e6) throw new Error("that SVG is over 5 MB: export a smaller one, or send it as a PNG");
    const clean = cleanSvg(buf.toString("utf8"));
    if (!svgSize(clean)) throw new Error("that file is not an SVG picture this Mac can read");
    buf = Buffer.from(clean);
  }
  fs.writeFileSync(path.join(P.popups, out), buf);
  if (isVideo) {
    // Keep a small upright copy for the page and the build: 30 fps, at most 1080 wide, no sound, at most 3 minutes. A phone clip
    // filmed sideways is turned upright here, so its size is right everywhere after. The original stays in popups/originals.
    const mp4 = `${id}.clip.mp4`;
    const r = run("ffmpeg", ["-v", "error", "-y", "-i", path.join(P.popups, out), "-t", "180", "-vf", "fps=30,scale='min(1080,iw)':-2,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-g", "30", "-an", "-movflags", "+faststart", path.join(P.popups, mp4)], { timeout: 240000 });   // audit 3: 4 minutes at most
    if (r.status !== 0 || !exists(path.join(P.popups, mp4))) { fs.rmSync(path.join(P.popups, out), { force: true }); fs.rmSync(path.join(P.popups, mp4), { force: true }); throw new Error("that video could not be read"); }
    fs.mkdirSync(path.join(P.popups, "originals"), { recursive: true });
    fs.renameSync(path.join(P.popups, out), path.join(P.popups, "originals", out));
    out = mp4;
  }
  if (ext === ".heic" || ext === ".heif") {   // iPhone photo: macOS sips makes a JPG; the original stays in popups/originals
    const jpg = `${id}.jpg`;
    const r = run("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "92", path.join(P.popups, out), "--out", path.join(P.popups, jpg)]);
    if (r.status !== 0 || !exists(path.join(P.popups, jpg))) { fs.rmSync(path.join(P.popups, out), { force: true }); throw new Error("this Mac could not convert the HEIC photo (sips failed); send it as a JPG"); }
    fs.mkdirSync(path.join(P.popups, "originals"), { recursive: true });
    fs.renameSync(path.join(P.popups, out), path.join(P.popups, "originals", out));
    out = jpg;
  }
  const info = probeMedia(`popups/${out}`);
  if (!info) { fs.rmSync(path.join(P.popups, out), { force: true }); throw new Error("that file is not a picture this Mac can read"); }
  return { src: `popups/${out}`, ...info };
}

// ---- the page's view of the reel ------------------------------------------------------------------------------------------------------
function sfxNames() {
  const mf = readJSON(path.join(SKILL, "assets", "sfx-manifest.json"), { effects: [] });
  return mf.effects.map((e) => ({ name: e.name, category: e.category, description: e.description }));
}
function textOf(words) { return words.map((w) => w.text).join(" "); }
function listRenders() {
  return fs.readdirSync(P.renders).filter((n) => /^v\d+\.json$/.test(n)).sort().map((n) => readJSON(path.join(P.renders, n), null)).filter(Boolean);
}
function view() {
  const st = loadState(), meta = loadMeta(st), edit = readJSON(P.edit, {}), brand = brandJSON();
  const lay = core.layout(st), tr = readJSON(P.tr, []);
  const joins = readJSON(path.join(REEL, "joins.json"), { joins: [] }).joins || [];
  const total = core.reelLength(st);
  const pieces = lay.map((L, k) => {
    const p = st.pieces[k], caps = (edit.captions || []).filter((c) => c.words.some((w) => w.t >= L.start - 1e-6 && w.t < L.end - 1e-6));
    const words = L.kept ? caps.flatMap((c) => c.words).filter((w) => w.t >= L.start - 1e-6 && w.t < L.end - 1e-6) : (p.removed?.captions || []).flatMap((c) => c.words);
    const gapBefore = k > 0 ? +(L.a - lay[k - 1].b).toFixed(2) : null;
    const j = joins.find((x) => Math.abs(x.in - L.a) < 0.05);
    return { ...L, text: textOf(words).slice(0, 160), gapBefore, gapLabel: j?.label || null };
  });
  const media = {};
  for (const c of edit.cards || []) if (c.type === "popup" || c.src) { const s = Array.isArray(c.src) ? c.src[0] : c.src; if (s) { const i = probeMedia(s); if (i) media[s] = i; } }
  const files = exists(P.popups) ? fs.readdirSync(P.popups).filter((n) => /\.(gif|png|jpe?g|webp|svg|mp4|webm)$/i.test(n)).map((n) => ({ src: `popups/${n}`, ...(probeMedia(`popups/${n}`) || {}) })) : [];
  for (const f of files) if (f.w) media[f.src] = { w: f.w, h: f.h, animated: f.animated, video: f.video };
  const renders = listRenders();
  const job = readJSON(P.job, { state: "idle" });
  const cutsStale = meta.cut_key !== cutKeyNow(st);
  const out = {
    reel: path.basename(REEL), speed: st.speed, total, masterDur: masterDuration(), edit: { captions: edit.captions || [], cards: edit.cards || [], sfx_events: edit.sfx_events || [], punch: edit.punch || [] },
    pieces, media, popups: files, sfxNames: sfxNames(), notes, renders, job, receipt: receiptNow(st, edit, brand),
    textDefault: brand.text_default || { layer: "front", position: "above" }, hasTextDefault: !!brand.text_default,
    themes: listThemes(), theme: { reel: edit.theme || null, all: brand.theme || null }, giphy: !!giphyKey(),
    sfxOn: (edit.sfx ?? brand.sfx ?? "subtle") !== "none", sfxAll: (brand.sfx ?? "subtle") !== "none",
    music: musicNow(edit, brand), addLooks: addableLooks(),
    layout: edit.layout || brand.layout || "captions-low", layoutAll: brand.layout || "captions-low",
    captionLead: Number(edit.caption_lead ?? brand.caption_lead) || 0, captionLeadAll: Number(brand.caption_lead) || 0,
    sfxVol: volName(edit.mix?.effects ?? brand.mix?.effects ?? 0), sfxVolAll: volName(brand.mix?.effects ?? 0), hasFinal: exists(P.final),
    colors: { reel: edit.colors || null, all: { main: brand.colors?.main || "#141414", pop: brand.colors?.pop || "#B9C8A5", light: brand.colors?.light || "#FFFFFF" } },
    highlight: (() => { let all = {}, reel = null; try { all = cleanHighlight(brand.caption_highlight); } catch {} try { reel = edit.caption_highlight ? cleanHighlight(edit.caption_highlight) : null; } catch {} return { reel, all, base: highlightBase(edit, brand), handwritten: !!(edit.caption_colors || edit.caption_style) }; })(),
    hasMaster: exists(P.master), cutsStale, dirty: meta.edit_hash !== editHash(), canUndo: history().length > 0, undoLabel: history().slice(-1)[0]?.replace(/^[\d_-]+?-(?=[A-Za-z])/, "") || null,
    video: renders.length ? renders[renders.length - 1].phone : null, prepping, links: LINKS, built: true,
  };
  notes = [];
  return out;
}

// ---- operations -----------------------------------------------------------------------------------------------------------------------
function requireIdle() { if (job.state === "running" || job.state === "queued") throw new Error("A render is running: wait until it finishes (or the edit would change under it)."); }

function addVocab(from, to) {
  const brand = brandJSON(); brand.vocabulary = brand.vocabulary || {};
  const key = from.toLowerCase().replace(/[^\w' ]/g, "").trim(), val = to.replace(/^[^\w$%&+#@]+|[^\w$%&+#@]+$/g, "");
  if (!key || !val) return;
  brand.vocabulary.corrections = { ...(brand.vocabulary.corrections || {}), [key]: val };
  const terms = brand.vocabulary.terms || [];
  if (!terms.some((t) => t.toLowerCase() === val.toLowerCase())) { terms.push(val); brand.vocabulary.terms = terms; }
  writeJSON(P.brand, brand);
}

function doOp(body) {
  requireIdle();
  const op = body.op || {}, edit = readJSON(P.edit, {}), st = loadState();
  const dur = core.reelLength(st);
  if (op.op === "piece") {
    const tr = readJSON(P.tr, []), zoom = Number(brandJSON().zoom?.scale) || 1.04;
    snapshot(`${op.kept ? "keep" : "drop"}-${op.id}`, null);
    const res = op.kept ? core.restorePiece(edit, tr, st, op.id) : core.dropPiece(edit, tr, st, op.id, { zoomScale: zoom });
    writeJSON(P.edit, res.edit); writeJSON(P.state, res.state);
    if (exists(P.tr)) writeJSON(P.tr, res.transcript);
    const edl = readJSON(P.edl, {}); edl.keep = core.keptSpans(res.state); writeJSON(P.edl, edl);
    if (exists(P.tr)) writeText(P.expected, core.expectedText(res.transcript));
    return { report: res.report || [] };
  }
  const withBrand = op.op === "caption_word" && op.always;
  snapshot(op.op, body.key || null, withBrand);
  const { edit: next, info } = core.applyOp(edit, op, { dur });
  writeJSON(P.edit, next);
  if (withBrand && info.before && info.after && info.before !== info.after) addVocab(info.before, info.after);
  return { info };
}

function setTextDefault(body) {
  requireIdle();
  const layer = body.layer, position = body.position || "above";
  if (!["front", "behind", "both"].includes(layer)) throw new Error("layer must be front, behind or both");
  if (position !== "above") throw new Error("position can only be 'above' for now");
  snapshot("text-default", null, true);
  const brand = brandJSON(); brand.text_default = { layer, position }; writeJSON(P.brand, brand);
}

// ---- render job -----------------------------------------------------------------------------------------------------------------------
let job = readJSON(P.job, { state: "idle" });
if (job.state === "running" || job.state === "queued") { job = { ...job, state: "failed", error: "The page was restarted while this render was running; start it again.", finishedAt: new Date().toISOString() }; writeJSON(P.job, job); }
let child = null, prepping = false;
const setJob = (patch) => { job = { ...job, ...patch }; writeJSON(P.job, job); };

function step(name, cmd, a, env) {
  return new Promise((resolve) => {
    const t0 = Date.now(), out = [];
    fs.appendFileSync(P.log, `\n===== ${name} (${new Date().toLocaleTimeString()}) =====\n$ ${cmd} ${a.join(" ")}\n`);
    child = spawn(cmd, a, { cwd: REEL, env });
    const eat = (d) => { const s = d.toString(); fs.appendFileSync(P.log, s.replace(/\r/g, "\n")); out.push(s); if (out.length > 400) out.splice(0, 200); };
    child.stdout.on("data", eat); child.stderr.on("data", eat);
    child.on("error", (e) => resolve({ code: 1, out: String(e), secs: 0 }));
    child.on("close", (code) => { child = null; resolve({ code, out: out.join(""), secs: Math.round((Date.now() - t0) / 1000) }); });
  });
}
const tailReason = (txt) => {   // the last readable lines of a failed step: no progress noise, no traceback carets or source lines
  const lines = txt.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^\[initSession|^frame=|^\[HyperFrames\]|^[\^~\s]+$|^File "|^Traceback|^subprocess\./.test(l));
  const errs = lines.filter((l) => /error|failed|no such file|not found|exception|invalid/i.test(l));
  return (errs.length ? errs : lines).slice(-4).join(" | ").slice(0, 500);
};

async function runRender(opts = {}) {
  const st = loadState(), meta = loadMeta(st), env = childEnv(), steps = [];
  const needCut = meta.cut_key !== cutKeyNow(st) || !exists(P.master);
  // 0.25.0: sound only. The picture in final.mp4 is kept; the sound list is rebuilt and the voice, music and effects are mixed
  // again from master.mp4. About 20 seconds instead of a full render. Used when only sound settings changed.
  const soundOnly = !!opts.soundOnly && !needCut && exists(P.final);
  fs.writeFileSync(P.log, `render started ${new Date().toISOString()}\n`);
  const version = Math.max(0, ...listRenders().map((r) => r.v), meta.version || 0) + 1;
  setJob({ state: "running", step: needCut ? "cut" : "render", version, startedAt: new Date().toISOString(), finishedAt: null, error: null, steps: [], notes: [], qa: null, sync: null });
  const fail = (name, r) => { setJob({ state: "failed", step: name, finishedAt: new Date().toISOString(), error: `${name} failed: ${tailReason(r.out)}`, steps }); };
  try {
    const editBefore = fs.readFileSync(P.edit, "utf8");
    if (needCut) {
      const r = await step("cut", "python3", [path.join(SCRIPTS, "cut.py"), REEL], env); steps.push({ name: "cut", secs: r.secs, ok: r.code === 0 }); setJob({ steps });
      if (r.code !== 0) return fail("cut", r);
    }
    let r;
    if (soundOnly) {
      setJob({ step: "sound" });
      const b = await step("sound list", "python3", [path.join(SCRIPTS, "build_reel.py"), REEL], env);
      if (b.code !== 0) return fail("sound list", b);
      r = await step("sound", "python3", [path.join(SCRIPTS, "mix_audio.py"), REEL, "--video", "final.mp4", "--out", "final_ln.mp4"], env);
      steps.push({ name: "sound", secs: b.secs + r.secs, ok: r.code === 0 }); setJob({ steps });
      if (r.code !== 0) return fail("sound", r);
      fs.renameSync(path.join(REEL, "final_ln.mp4"), P.final);
      r = { ...r, out: b.out + "\n" + r.out };
    } else {
      setJob({ step: "render" });
      r = await step("render", "bash", [path.join(SCRIPTS, "render.sh"), REEL], env); steps.push({ name: "render", secs: r.secs, ok: r.code === 0 }); setJob({ steps });
      if (r.code !== 0) return fail("render", r);
    }
    const buildNotes = r.out.split(/\r?\n/).filter((l) => /^(note|warning):/.test(l.trim())).map((l) => l.trim());
    const mixLine = (r.out.match(/^mix: .*$/m) || [""])[0];
    setJob({ step: "checks", notes: buildNotes, mix: mixLine });
    const q = await step("qa", "python3", [path.join(SCRIPTS, "qa.py"), REEL], env);
    steps.push({ name: "qa", secs: q.secs, ok: q.code === 0 }); setJob({ steps });
    const qaPass = /^PASS/m.test(q.out);
    let sync = null;
    try { sync = core.syncCheck(readJSON(P.edit, {}).captions, readJSON(path.join(REEL, "qa_transcript", "transcript.json"), [])); } catch { /* optional */ }
    setJob({ step: "copies", qa: { pass: qaPass, lines: q.out.split(/\r?\n/).filter((l) => /^(size|length|loudness|peak|cover|words|PASS|FAIL)/.test(l)) }, sync });
    const v = String(version).padStart(3, "0"), full = path.join(P.renders, `v${v}.mp4`), phone = path.join(P.renders, `v${v}-phone.mp4`);
    const cp = run("cp", ["-c", P.final, full]); if (cp.status !== 0) fs.copyFileSync(P.final, full);   // APFS clone: no extra disk, and the next render can't touch it
    const tag = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];
    const f = await step("phone copy", "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", full, "-vf", "scale='min(1080,iw)':-2,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv",
      "-c:v", "libx264", "-preset", "medium", "-crf", "26", "-pix_fmt", "yuv420p", ...tag, "-tag:v", "avc1", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", phone], env);
    if (f.code !== 0) return fail("phone copy", f);
    const rec = { v: version, at: new Date().toISOString(), full: `renders/v${v}.mp4`, phone: `renders/v${v}-phone.mp4`, len: durOf(full), notes: buildNotes, qa: job.qa, mix: mixLine,
      sync, recut: needCut, ...(soundOnly ? { soundOnly: true } : {}), what: `${soundOnly ? "sound only, " : ""}${(readJSON(P.edit, {}).cards || []).filter((c) => !c.off).length} cards, ${core.keptSpans(st).length} pieces` };
    writeJSON(path.join(P.renders, `v${v}.json`), rec);
    fs.writeFileSync(path.join(P.renders, `v${v}-edit.json`), editBefore); fs.copyFileSync(P.edl, path.join(P.renders, `v${v}-edl.json`));
    writeJSON(P.meta, { cut_key: cutKeyNow(st), edit_hash: editHash(), version, at: rec.at });
    writeLatestBuild(rec);
    if (reviewBuild.state === "rendering") reviewBuild = { ...reviewBuild, state: "done" };
    setJob({ state: "done", step: "done", finishedAt: new Date().toISOString(), result: rec, steps });
  } catch (e) {
    setJob({ state: "failed", error: String(e.message || e), finishedAt: new Date().toISOString() });
  }
}
function startRender(opts = {}) {
  if (job.state === "running" || job.state === "queued") throw new Error("A render is already running.");
  if (opts.soundOnly && !exists(P.final)) throw new Error("There's no finished reel yet: render it once first.");
  if (opts.soundOnly) { const st = loadState(); if (loadMeta(st).cut_key !== cutKeyNow(st) || !exists(P.master)) throw new Error("The cuts changed since the last render, so the picture has to be made again: press Re-render."); }
  lastSnap = null;
  setJob({ state: "queued", step: "queued", steps: [], error: null });
  runRender(opts).catch((e) => setJob({ state: "failed", error: String(e.message || e), finishedAt: new Date().toISOString() }));   // 0.18.0: a surprise here must not stop the server
}

// ---- build from the review page (Added by By Mel Ross, 0.18.0) -----------------------------------------------------------------------
// "Build preview" used to save a request and send the person back to chat. Now the page starts the build: the decisions are
// imported (review_sync.py import), then the usual cut, render and checks run, the same steps as Re-render on the touch-ups
// page. Requests only Claude can act on (a graphic to change or add, typed notes) are listed on the page before it starts.
let reviewBuild = { state: "idle", told: [], error: null };
function startReviewBuild() {
  if (!hasReview()) throw new Error("No reel is loaded on the review page yet.");
  if (job.state === "running" || job.state === "queued" || reviewBuild.state === "importing") throw new Error("A build is already running.");
  if (liveChild) { try { liveChild.kill("SIGTERM"); } catch { /* gone */ } }
  const decisions = path.join(REVIEW_DB, "review", "current.json");
  let file = decisions;
  if (!exists(decisions)) { file = path.join(REEL, "editor", "no-decisions.json"); writeJSON(file, {}); }   // nothing tapped: the plan as proposed
  reviewBuild = { state: "importing", told: [], error: null, at: new Date().toISOString() };
  const out = [];
  const c = spawn("python3", [path.join(SCRIPTS, "review_sync.py"), "import", REEL, file], { cwd: REEL, env: childEnv() });
  c.stdout.on("data", (d) => out.push(d.toString())); c.stderr.on("data", (d) => out.push(d.toString()));
  const fin = (code) => {
    if (reviewBuild.state !== "importing") return;
    const text = out.join("");
    if (code !== 0) { reviewBuild = { ...reviewBuild, state: "failed", error: "Your choices could not be read: " + (tailReason(text) || "unknown reason") }; return; }
    const told = text.split(/\r?\n/).filter((l) => /^(TOUCH-UP NOT KEPT|CHANGE REQUESTED|GRAPHIC WANTED|GRAPHICS AMOUNT|NOTE|REVISION|PLACE IT|BRAND CHANGE REQUESTED)/.test(l)).map((l) => l.slice(0, 300));
    reviewBuild = { ...reviewBuild, state: "rendering", told };
    try { initBuilt(); startRender(); } catch (e) { reviewBuild = { ...reviewBuild, state: "failed", error: String(e.message || e) }; }
  };
  c.on("error", () => fin(1)); c.on("close", fin);
}
// The review page reads builds/latest to show the preview and to tell whether it is out of date. Written after every render.
function writeLatestBuild(rec) {
  try {
    if (!hasReview()) return;
    const h = readJSON(P.edit, {}).hash; if (!h) return;
    writeJSON(path.join(REVIEW_DB, "builds", "latest.json"), { url: `/files/${rec.phone}`, hash: h, at: rec.at, cutDur: rec.len ?? null, by: "page" });
  } catch { /* the preview state just stays as it was */ }
}

// ---- caption step (Added by By Mel Ross, 0.20.0) ----------------------------------------------------------------------------------------
// Step 4: the post caption for Instagram. Claude writes 3 drafts into <reel>/caption.json (scripts/caption.py has the shape and the
// limits); this page shows them, takes edits, and writes the chosen one to <reel>/caption.txt, which delivery copies beside the video.
const CAP_LIMITS = { total: 2200, hook: 125, hashtagsMax: 5, hashtagsMin: 3 };
const CAP_IDS = ["short", "medium", "long"];
const CAP_TONES = { mine: "My usual voice", funny: "Funny", witty: "Witty", sarcastic: "Sarcastic", warm: "Warm", bold: "Bold", serious: "Serious", corporate: "Corporate" };
const CAP_ASKS = ["keyword", "follow", "save", "share", "none"];
const capFile = () => path.join(REEL, "caption.json");
const capTags = (list) => { const out = []; for (const t of Array.isArray(list) ? list : String(list || "").split(/[\s,]+/)) { const x = "#" + String(t).replace(/[^\p{L}\p{N}_]/gu, ""); if (x.length > 1 && !out.some((y) => y.toLowerCase() === x.toLowerCase())) out.push(x.slice(0, 60)); } return out.slice(0, CAP_LIMITS.hashtagsMax); };
function capClean(d) {
  const str = (v, n) => String(v ?? "").replace(/\r/g, "").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").slice(0, n).trim();
  const kw = str(d?.keyword, 20).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const byId = new Map((Array.isArray(d?.drafts) ? d.drafts : []).filter((x) => x && typeof x === "object").map((x) => [x.id, x]));
  const drafts = CAP_IDS.filter((id) => byId.has(id)).map((id) => { const x = byId.get(id); return { id, hook: str(x.hook, 300).replace(/\n+/g, " "), body: str(x.body, 2200), cta: str(x.cta, 300), hashtags: capTags(x.hashtags) }; });
  const lvl = (v) => ([0, 1, 2, 3].includes(Number(v)) ? Number(v) : 0), tone = (v) => (Object.hasOwn(CAP_TONES, v) ? v : "mine");
  const out = { platform: "instagram", tone: tone(d?.tone), emoji: lvl(d?.emoji), ask: CAP_ASKS.includes(d?.ask) ? d.ask : "keyword", keyword: kw, gift: str(d?.gift, 120), more: str(d?.more, 80), drafts, chosen: CAP_IDS.includes(d?.chosen) && byId.has(d.chosen) ? d.chosen : null };
  if (d?.written && typeof d.written === "object") out.written = { tone: tone(d.written.tone), emoji: lvl(d.written.emoji) };
  return out;
}
function capCta(d, x) {
  if (x.cta) return x.cta;
  if (d.ask === "none") return ""; if (d.ask === "follow") return d.more ? `Follow for more ${d.more}.` : "Follow for more.";
  if (d.ask === "save") return "Save this so you can find it later."; if (d.ask === "share") return "Send this to someone who needs it.";
  if (d.keyword && d.gift) return `Comment ${d.keyword} and I'll send you ${d.gift}.`; return d.keyword ? `Comment ${d.keyword} and I'll send it to you.` : "";
}
// 0.28.0: a music track that needs credit (a line in ~/reels/music/CREDITS.txt: "calm/track.mp3: Title Kevin MacLeod (incompetech.com) ...")
// gets its credit line in the caption, before the hashtags.
function musicCredit() {
  try {
    const m = musicNow(readJSON(P.edit, {}), brandJSON()).track; if (!m) return "";
    const lines = fs.readFileSync(path.join(MUSIC.musicDir(HOME), "CREDITS.txt"), "utf8").split("\n");
    const hit = lines.find((l) => { const k = l.split(":")[0].trim(); return k && (k === m || k === path.basename(m)); });
    return hit ? "Music: " + hit.slice(hit.indexOf(":") + 1).trim().slice(0, 200) : "";
  } catch { return ""; }
}
const capText = (d, x) => [x.hook, x.body, capCta(d, x), musicCredit(), x.hashtags.join(" ")].filter(Boolean).join("\n\n");
function capView() {
  let d = null; try { d = capClean(JSON.parse(fs.readFileSync(capFile(), "utf8"))); } catch { /* none yet */ }
  let said = ""; try { said = (readJSON(P.edit, {}).captions || []).flatMap((c) => (c.words || []).map((w) => w.text)).join(" ").slice(0, 600); } catch { /* not built */ }
  return { reel: path.basename(REEL), credit: musicCredit(), caption: d && d.drafts.length ? d : null, keyword: d?.keyword || "", gift: d?.gift || "", limits: CAP_LIMITS, said, links: LINKS,
    settings: { tone: d?.tone || "mine", emoji: d?.emoji || 0, ask: d?.ask || "keyword", more: d?.more || "" }, tones: CAP_TONES, written: d?.written || null,
    ask: `Write the Instagram captions for the reel "${path.basename(REEL)}" and give me the Caption page link.` };
}
function capSave(body) {
  const d = capClean(body);
  if (!d.drafts.length) {   // no drafts yet: only the keyword and what they get are kept, for Claude to write from
    let old = {}; try { old = JSON.parse(fs.readFileSync(capFile(), "utf8")); } catch { /* new */ }
    writeJSON(capFile(), { ...capClean(old), keyword: d.keyword, gift: d.gift, tone: d.tone, emoji: d.emoji, ask: d.ask, more: d.more }); return capView();
  }
  for (const x of d.drafts) if (capText(d, x).length > CAP_LIMITS.total) throw new Error(`The ${x.id} caption is ${capText(d, x).length} characters. Instagram holds ${CAP_LIMITS.total}.`);
  writeJSON(capFile(), d);
  const pick = d.drafts.find((x) => x.id === d.chosen);
  if (pick) fs.writeFileSync(path.join(REEL, "caption.txt"), capText(d, pick) + "\n"); else fs.rmSync(path.join(REEL, "caption.txt"), { force: true });
  return capView();
}

// ---- live preview (Added by By Mel Ross, 0.17.0) -----------------------------------------------------------------------------------------
// The reel is a web page before it is a video. build_reel.py writes that page in seconds; a render takes minutes. The touch-ups
// page shows the built page over its player, in step with it, so a change to a graphic is seen right away with the real fonts,
// colors and motion. It is built into <reel>/proj_live (never the folder a render reads), then swapped in whole.
const LIVE = path.join(REEL, "proj_live");
let live = { state: exists(path.join(LIVE, "index.html")) ? "ready" : "none", n: 0, at: null, secs: 0, error: null, notes: [], key: null };
let liveChild = null, liveAgain = false;
const liveKey = () => { try { return crypto.createHash("sha1").update(fs.readFileSync(P.edit)).update(fs.readFileSync(P.brand)).update(String(fs.statSync(P.master).mtimeMs)).digest("hex"); } catch { return null; } };
function startLive(force) {
  if (!built()) throw new Error("This reel is not built yet.");
  if (!exists(P.master)) throw new Error("The live preview needs the cut video, and this reel has none yet. Press Re-render once.");
  if (job.state === "running" || job.state === "queued") throw new Error("A render is running. The live preview comes back when it finishes.");
  const key = liveKey();
  if (!force && live.state === "ready" && live.key && live.key === key) return live;
  if (liveChild) { liveAgain = true; return live; }
  const tmpDir = LIVE + ".new"; fs.rmSync(tmpDir, { recursive: true, force: true });
  live = { ...live, state: "building", error: null };
  const t0 = Date.now(), out = [];
  liveChild = spawn("python3", [path.join(SCRIPTS, "build_reel.py"), REEL], { cwd: REEL, env: { ...childEnv(), REEL_PROJ_DIR: tmpDir } });
  const eat = (d) => { out.push(d.toString()); if (out.length > 400) out.splice(0, 200); };
  liveChild.stdout.on("data", eat); liveChild.stderr.on("data", eat);
  const done = (code) => {
    if (!liveChild) return; liveChild = null;
    const text = out.join("");
    if (code === 0 && exists(path.join(tmpDir, "index.html"))) {
      fs.rmSync(LIVE, { recursive: true, force: true }); fs.renameSync(tmpDir, LIVE);
      live = { state: "ready", n: live.n + 1, at: new Date().toISOString(), secs: Math.round((Date.now() - t0) / 100) / 10, error: null, key,
        notes: text.split(/\r?\n/).filter((l) => /^(note|warning):/.test(l)).map((l) => l.replace(/^(note|warning):\s*/, "")).slice(0, 8) };
    } else { fs.rmSync(tmpDir, { recursive: true, force: true }); live = { ...live, state: "failed", error: tailReason(text) || "the preview could not be built" }; }
    if (liveAgain) { liveAgain = false; try { startLive(); } catch { /* a render started meanwhile */ } }
  };
  liveChild.on("error", () => done(1)); liveChild.on("close", done);
  return live;
}
// What the preview page gets added to it: nothing plays by itself. The touch-ups page calls reelLive.sync(time, playing) on
// every frame and this moves the animation and every video to that moment. The page's own player stays the clock and the sound.
const LIVE_DRIVER = `<style>html,body{background:transparent!important}</style><script>(function(){
  var tl=function(){return window.__timelines&&window.__timelines.main},vids=function(){return [].slice.call(document.querySelectorAll("video"))};
  vids().forEach(function(v){v.muted=true;v.preload="auto"});
  window.reelLive={ready:function(){return !!tl()},sync:function(t,playing){
    var m=tl();if(!m)return;m.seek(Math.max(0,t),false);
    vids().forEach(function(v){
      var s=+(v.dataset.start||0),d=+(v.dataset.duration||1e9),ms=+(v.dataset.mediaStart||0),on=t>=s-0.05&&t<s+d;
      if(!on){if(!v.paused)v.pause();return}
      var want=ms+Math.max(0,t-s);
      if(Math.abs(v.currentTime-want)>(playing?0.3:0.04)){try{v.currentTime=want}catch(e){}}
      if(playing&&v.paused){var p=v.play();if(p&&p.catch)p.catch(function(){})}else if(!playing&&!v.paused)v.pause();
    });}};
})();</script>`;

// the video the page shows before any render: a phone copy of the existing final.mp4, made once.
// 0.16.0: also when final.mp4 was rendered outside this page (from the command line) after the last render the page knows:
// the player used to stay empty, or show an older video. The page checks each time it loads the reel.
function prepareBaseline() {
  if (prepping || child || job.state === "running" || job.state === "queued" || !exists(P.final)) return;
  const all = listRenders(); let version = 0, extra = { baseline: true, what: "the video as it was when this page first opened" };
  const fm = fs.statSync(P.final).mtimeMs;
  if (Date.now() - fm < 8000) return;   // still being written
  if (all.length) {
    const newest = Math.max(...fs.readdirSync(P.renders).filter((n) => /^v\d+\.json$/.test(n)).map((n) => fs.statSync(path.join(P.renders, n)).mtimeMs));
    if (fm <= newest + 5000) return;
    version = Math.max(...all.map((r) => r.v)) + 1; extra = { outside: true, what: "rendered outside this page (from Claude or the command line)" };
  }
  prepping = true;
  const v = String(version).padStart(3, "0");
  const phone = path.join(P.renders, `v${v}-phone.mp4`), tag = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];
  fs.mkdirSync(P.renders, { recursive: true });
  const c = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", P.final, "-vf", "scale='min(1080,iw)':-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", ...tag,
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", phone], { env: childEnv() });
  c.on("close", (code) => {
    prepping = false;
    if (code === 0) writeJSON(path.join(P.renders, `v${v}.json`), { v: version, at: new Date().toISOString(), phone: `renders/v${v}-phone.mp4`, full: "final.mp4", ...extra });
  });
}

// ---- http -----------------------------------------------------------------------------------------------------------------------------
function sendFile(req, res, file) {
  let st; try { st = fs.statSync(file); if (!st.isFile()) throw 0; } catch { res.writeHead(404).end(); return; }
  const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
  if (type === "image/svg+xml") {   // an SVG opened on its own gets no scripts and no outside requests
    res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox", "X-Content-Type-Options": "nosniff" });
    fs.createReadStream(file).pipe(res); return;
  }
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");   // video seeking (Safari insists on ranges)
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
    if (start > end) { res.writeHead(416, { "Content-Range": `bytes */${st.size}` }).end(); return; }
    res.writeHead(206, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Cache-Control": "no-store" });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": st.size, "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  }
}
const json = (res, code, o) => { const s = JSON.stringify(o); res.writeHead(code, { "Content-Type": TYPES[".json"], "Cache-Control": "no-store" }).end(s); };
const readBody = (req, limit) => new Promise((resolve, reject) => {
  const parts = []; let n = 0;
  req.on("data", (c) => { n += c.length; if (n > limit) { reject(new Error("file too big")); req.destroy(); } else parts.push(c); });
  req.on("end", () => resolve(Buffer.concat(parts))); req.on("error", reject);
});

const server = http.createServer(async (req, res) => {
  try {
    if (!trusted(req, PORT, LAN)) { res.writeHead(403).end("this page only answers requests sent from its own address"); return; }
    const url = new URL(req.url, "http://x"), p = decodeURIComponent(url.pathname);
    if (KEY) {   // the key arrives once in the link, then rides in a cookie so videos, images and the API work too
      if (url.searchParams.get("k") === KEY) res.setHeader("Set-Cookie", `rk=${KEY}; HttpOnly; SameSite=Strict; Path=/`);
      else if (!(req.headers.cookie || "").split(/;\s*/).includes(`rk=${KEY}`)) { res.writeHead(403).end("missing or wrong key"); return; }
    }
    initBuilt();   // the reel may have been built since this server started
    // 0.28.0: one link, one page. /edit holds the review page (the cut, before the first build) and the touch-ups page
    // (after it) as 2 tabs, and opens on the one that fits. /review and /touchups still work on their own.
    if (p === "/" || p === "/index.html" || p === "/edit") return sendFile(req, res, path.join(HERE, "edit.html"));
    if (p === "/favicon.ico") { res.writeHead(204); return res.end(); }   // no icon: answer quietly so the page shows no failed request
    if (p === "/touchups") return sendFile(req, res, path.join(HERE, "editor.html"));
    if (p === "/caption") return sendFile(req, res, path.join(HERE, "caption.html"));   // 0.20.0: step 4
    if (p === "/api/caption" && req.method === "GET") return json(res, 200, { ok: true, ...capView() });
    if (p === "/api/caption" && req.method === "POST") {
      try { return json(res, 200, { ok: true, ...capSave(JSON.parse((await readBody(req, 2e5)).toString() || "{}")) }); }
      catch (e) { return json(res, 400, { ok: false, error: String(e.message || e) }); }
    }
    if (p === "/review") {
      const links = `<script>window.REEL_STUDIO_LINKS=${JSON.stringify({ touchups: LINKS.touchups, edit: LINKS.edit, cover: LINKS.cover, caption: LINKS.caption }).replace(/</g, "\\u003c")}</script>`;
      const html = fs.readFileSync(path.join(HERE, "reel-review.html"), "utf8")
        .replace('<script src="core.js"></script>', links + '<script src="shim.js"></script><script src="core.js"></script>');
      res.writeHead(200, { "Content-Type": TYPES[".html"], "Cache-Control": "no-store" }).end(html); return;
    }
    if (await themeRoutes(THEMEP, req, res, p, () => REEL, json)) return;   // 0.33.0: every theme on this reel
    if (p === "/api/look-preview" && req.method === "GET") return json(res, 200, { ok: true, ...LOOKP.state() });   // 0.27.0
    if (p === "/api/look-preview" && req.method === "POST") {
      try { LOOKP.start(REEL, JSON.parse((await readBody(req, 1e5)).toString() || "{}")); return json(res, 200, { ok: true, ...LOOKP.state() }); }
      catch (e) { return json(res, 400, { ok: false, error: String(e.message || e) }); }
    }
    if (p === "/look-preview.jpg") { const f = LOOKP.image(); if (!f) { res.writeHead(404).end(); return; } res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store" }); fs.createReadStream(f).pipe(res); return; }
    if (p === "/styles") { res.writeHead(200, { "Content-Type": TYPES[".html"], "Cache-Control": "no-store" }).end(stylePage()); return; }
    if (p === "/api/style-picks") {   // works before the reel is built: looks are picked first
      if (req.method === "GET") return json(res, 200, stylePicks());
      if (req.method === "POST") {
        try { return json(res, 200, { ok: true, picks: setStylePicks(JSON.parse((await readBody(req, 1e5)).toString() || "{}")) }); }
        catch (e) { return json(res, 400, { ok: false, error: e.message }); }
      }
    }
    if (p === "/shim.js") { res.writeHead(200, { "Content-Type": TYPES[".js"] }).end(SHIM); return; }
    if (p === "/core.js") return sendFile(req, res, path.join(HERE, "core.js"));
    if (p === "/review.js" || p === "/editor.js") return sendFile(req, res, path.join(HERE, p.slice(1)));   // 0.30.0: the pages' code
    if (p === "/core.mjs") return sendFile(req, res, path.join(HERE, "editor-core.mjs"));
    if (p === "/api/stage" && req.method === "GET") return json(res, 200, { reel: path.basename(REEL), built: built(), review: hasReview() });
    if (p.startsWith("/db/")) {   // the review page's decisions, same files and rules as serve.mjs
      const doc = p.slice(4);
      if (!DOCS.has(doc)) { res.writeHead(404).end(); return; }
      const file = path.join(REVIEW_DB, doc + ".json");
      if (req.method === "GET") { if (!exists(file)) { res.writeHead(204).end(); return; } return sendFile(req, res, file); }
      if (req.method !== "PUT" || !WRITABLE.has(doc)) { res.writeHead(403).end(); return; }
      const body = (await readBody(req, 5e6)).toString();
      try { JSON.parse(body); } catch { res.writeHead(400).end(); return; }
      fs.mkdirSync(path.dirname(file), { recursive: true }); writeText(file, body);
      res.writeHead(204).end(); return;
    }
    if (p === "/api/state" && req.method === "GET" && built()) { try { prepareBaseline(); } catch { /* the player just stays as it is */ } }
    if (p === "/api/state" && req.method === "GET") return json(res, 200, built() ? view() : { built: false, reel: path.basename(REEL), review: hasReview(), links: LINKS });
    if (req.method === "GET" && p === "/api/review-giphy-key") return json(res, 200, { key: giphyKey() || null });   // 0.10.2: GIPHY on the review page, before the build
    if (p === "/api/review-build" && req.method === "GET") {   // 0.18.0: works before the first build too
      if (reviewBuild.state === "rendering" && job.state === "failed") reviewBuild = { ...reviewBuild, state: "failed", error: job.error || "the render failed" };
      return json(res, 200, { ok: true, build: reviewBuild, job: { state: job.state, step: job.step, steps: job.steps || [], startedAt: job.startedAt || null } });
    }
    if (p === "/api/review-build" && req.method === "POST") {
      try { startReviewBuild(); return json(res, 200, { ok: true, build: reviewBuild }); }
      catch (e) { return json(res, 400, { ok: false, error: String(e.message || e) }); }
    }
    if (req.method === "POST" && p === "/api/giphy-key-save") {   // 0.15.0: both pages can save the key (works before the build)
      try { const r = await giphySaveKey(JSON.parse((await readBody(req, 1e4)).toString() || "{}")); return json(res, 200, { ok: true, ...r, ...(built() ? { state: view() } : {}) }); }
      catch (e) { return json(res, 400, { ok: false, error: String(e.message || e) }); }
    }
    if (req.method === "POST" && p === "/api/review-giphy") {
      try {
        fs.mkdirSync(P.popups, { recursive: true });
        return json(res, 200, { ok: true, upload: await giphyAdd(JSON.parse((await readBody(req, 1e5)).toString() || "{}")) });
      } catch (e) { return json(res, 400, { ok: false, error: String(e.message || e) }); }
    }
    if (req.method === "POST" && p === "/api/review-upload") {   // Added by By Mel Ross (0.10.2): their own picture for a graphic, from the review page (works before the build)
      try {
        const buf = await readBody(req, 600e6); if (!buf.length) throw new Error("empty file");
        fs.mkdirSync(P.popups, { recursive: true });
        return json(res, 200, { ok: true, upload: saveUpload(buf, url.searchParams.get("name") || "picture.png") });
      } catch (e) { return json(res, 400, { ok: false, error: String(e.message || e) }); }
    }
    if (p.startsWith("/api/") && !built()) return json(res, 409, { ok: false, error: "This reel is not built yet. Finish the review step first." });
    if (p === "/api/giphy-key" && req.method === "GET") return json(res, giphyKey() ? 200 : 404, { key: giphyKey() });
    if (p === "/api/job" && req.method === "GET") return json(res, 200, { job, canUndo: history().length > 0 });
    if (req.method === "POST" && p.startsWith("/api/")) {
      try {
        if (p === "/api/op") { const b = JSON.parse((await readBody(req, 2e6)).toString() || "{}"); return json(res, 200, { ok: true, ...doOp(b), state: view() }); }
        if (p === "/api/undo") { requireIdle(); const what = undo(); return json(res, 200, { ok: true, undid: what, state: view() }); }
        if (p === "/api/render") { startRender(); return json(res, 200, { ok: true, job }); }
        if (p === "/api/look-add") { const b = JSON.parse((await readBody(req, 1e4)).toString() || "{}"); const r = addLook(b); return json(res, 200, { ok: true, ...r, state: view() }); }   // 0.28.0
        if (p === "/api/music") { const b = JSON.parse((await readBody(req, 1e4)).toString() || "{}"); setMusic(b); return json(res, 200, { ok: true, state: view() }); }   // 0.28.0
        if (p === "/api/music-upload") { const name = await MUSIC.upload(HOME, req, url.searchParams.get("name")); return json(res, 200, { ok: true, name }); }
        if (p === "/api/caption-lead") { const b = JSON.parse((await readBody(req, 1e4)).toString() || "{}"); setCaptionLead(b); return json(res, 200, { ok: true, state: view() }); }
        if (p === "/api/layout") { const b = JSON.parse((await readBody(req, 1e4)).toString() || "{}"); setLayout(b); return json(res, 200, { ok: true, state: view() }); }
        if (p === "/api/remix") { startRender({ soundOnly: true }); return json(res, 200, { ok: true, job }); }   // 0.25.0: sound only
        if (p === "/api/sfx-volume") { const b = JSON.parse((await readBody(req, 1e4)).toString() || "{}"); setSfxVolume(b); return json(res, 200, { ok: true, state: view() }); }
        if (p === "/api/live") { const b = JSON.parse((await readBody(req, 1e4)).toString() || "{}"); return json(res, 200, { ok: true, live: startLive(!!b.force) }); }
        if (p === "/api/sfx") { const b = JSON.parse((await readBody(req, 1e4)).toString() || "{}"); setSfx(b); return json(res, 200, { ok: true, state: view() }); }
        if (p === "/api/colors") { const b = JSON.parse((await readBody(req, 1e5)).toString() || "{}"); setColors(b); return json(res, 200, { ok: true, state: view() }); }
        if (p === "/api/caption-highlight") { const b = JSON.parse((await readBody(req, 1e5)).toString() || "{}"); setHighlight(b); return json(res, 200, { ok: true, state: view() }); }
        if (p === "/api/theme") { const b = JSON.parse((await readBody(req, 1e5)).toString() || "{}"); setTheme(b); return json(res, 200, { ok: true, state: view() }); }
        if (p === "/api/giphy-add") { const b = JSON.parse((await readBody(req, 1e5)).toString() || "{}"); const up = await giphyAdd(b); return json(res, 200, { ok: true, upload: up, state: view() }); }
        if (p === "/api/text-default") { const b = JSON.parse((await readBody(req, 1e5)).toString() || "{}"); setTextDefault(b); return json(res, 200, { ok: true, state: view() }); }
        if (p === "/api/upload") {
          const buf = await readBody(req, 600e6);
          if (!buf.length) throw new Error("empty file");
          const up = saveUpload(buf, url.searchParams.get("name") || "popup.png");
          return json(res, 200, { ok: true, upload: up, state: view() });
        }
      } catch (e) { return json(res, 400, { ok: false, error: String(e.message || e) }); }
      res.writeHead(404).end(); return;
    }
    if (p === "/api/live" && req.method === "GET") return json(res, 200, { ok: true, live });
    if (req.method === "GET" && p.startsWith("/music/")) return MUSIC.serveTrack(HOME, p.slice(7), res);   // 0.28.0: hear a track
    if (p.startsWith("/live/")) {   // the built page and its files, for the live preview
      const file = path.resolve(LIVE, "." + p.slice(5)), rel = path.relative(LIVE, file);
      if (rel.startsWith("..") || path.isAbsolute(rel)) { res.writeHead(403).end(); return; }
      if (rel === "index.html") {
        let html; try { html = fs.readFileSync(file, "utf8"); } catch { res.writeHead(404).end(); return; }
        html = html.includes("</body>") ? html.replace("</body>", LIVE_DRIVER + "</body>") : html + LIVE_DRIVER;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); res.end(html); return;
      }
      return sendFile(req, res, file);
    }
    if (p.startsWith("/sfx/")) {   // Added by By Mel Ross (0.10.2): sound previews for both pages, straight from the effects library
      const name = decodeURIComponent(p.slice(5)).replace(/\.wav$/, "");
      if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(name)) { res.writeHead(404).end(); return; }
      const engine = process.env.REEL_ENGINE || path.join(SKILL, "engine");
      return sendFile(req, res, path.join(engine, "sfx", name + ".wav"));
    }
    if (p === "/api/strip.jpg" || p === "/api/wave.png") {   // Added by By Mel Ross (0.14.0): the timeline's film strip and waveform
      // Made from the render the page is watching (v=<number>), once, and kept in editor/timeline/. px = pixels per second.
      const r = listRenders().find((x) => String(x.v) === url.searchParams.get("v")) || listRenders().slice(-1)[0];
      const src = r && path.join(REEL, r.phone);
      if (!src || !exists(src)) { res.writeHead(404).end(); return; }
      const px = 56, dur = Math.min(durOf(src) || 0, 600), dir = path.join(P.dir, "timeline"), strip = p.endsWith(".jpg");
      if (dur <= 0) { res.writeHead(404).end(); return; }
      const out = path.join(dir, `v${r.v}-${strip ? "strip.jpg" : "wave.png"}`);
      if (!exists(out) || fs.statSync(out).mtimeMs < fs.statSync(src).mtimeMs) {
        fs.mkdirSync(dir, { recursive: true });
        const n = Math.max(Math.ceil((dur * px) / 36), 1);            // one 36 x 64 frame every 36 px
        const args = strip
          ? ["-v", "error", "-y", "-i", src, "-vf", `fps=${px}/36,scale=36:64:force_original_aspect_ratio=increase,crop=36:64,tile=${n}x1`, "-frames:v", "1", "-q:v", "5", out]
          : ["-v", "error", "-y", "-i", src, "-filter_complex", `aformat=channel_layouts=mono,showwavespic=s=${Math.max(Math.round(dur * px), 2)}x48:colors=0x0d2b2d`, "-frames:v", "1", out];
        if (run("ffmpeg", args).status !== 0 || !exists(out)) { res.writeHead(404).end(); return; }
      }
      return sendFile(req, res, out);
    }
    if (p.startsWith("/files/")) {
      const file = path.resolve(REEL, "." + p.slice(6));
      const rel = path.relative(REEL, file);
      if (rel.startsWith("..") || path.isAbsolute(rel) || /^(editor\/history|review_db|\.)/.test(rel)) { res.writeHead(403).end(); return; }
      return sendFile(req, res, file);
    }
    res.writeHead(404).end();
  } catch (e) { res.writeHead(500).end(String(e.message || e)); }
});

const quit = () => { if (child) child.kill("SIGTERM"); process.exit(0); };
process.on("SIGINT", quit); process.on("SIGTERM", quit);

let inited = false;
function initBuilt() {
  if (inited || !built()) return;
  inited = true;
  fs.mkdirSync(P.dir, { recursive: true }); fs.mkdirSync(P.renders, { recursive: true }); fs.mkdirSync(P.popups, { recursive: true });
  // give every card and sound an id (kept in edit.json, ignored by the build); the first time, keep the file as it was
  const e = readJSON(P.edit, {});
  if (core.ensureIds(e)) {
    const keep = path.join(P.dir, "edit.json.before-editor");
    if (!exists(keep)) fs.copyFileSync(P.edit, keep);
    writeJSON(P.edit, e);
  }
  loadMeta(loadState());
  prepareBaseline();
}
initBuilt();
server.listen(PORT, LAN ? "0.0.0.0" : "127.0.0.1", () => {
  console.log(`Reel Studio for ${path.basename(REEL)}: http://127.0.0.1:${PORT}/${KEY ? "?k=" + KEY : ""}`);
  if (LAN) for (const a of Object.values(os.networkInterfaces()).flat())
    if (a.family === "IPv4" && !a.internal) console.log(`same Wi-Fi: http://${a.address}:${PORT}/?k=${KEY}`);
});
