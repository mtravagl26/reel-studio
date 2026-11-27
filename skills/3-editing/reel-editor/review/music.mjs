// Added by By Mel Ross (0.28.0): background music. Tracks are the person's own files in ~/reels/music (downloaded from a
// free music library, see references/music.md). Unmess Reels ships no music: the libraries' licenses don't allow handing
// their tracks out. Both servers list the folder, play a track for a preview, and take a new track from the page.
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

export const AUDIO = new Set([".mp3", ".m4a", ".wav", ".aac", ".ogg", ".flac"]);
const TYPES = { ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".aac": "audio/aac", ".ogg": "audio/ogg", ".flac": "audio/flac" };
const MAX = 40 * 1024 * 1024;

export function musicDir(home) { return path.join(home, "music"); }

// Tracks in the folder, and one level of subfolders, which are moods ("calm/soft piano.mp3"). Mood "" = no folder.
export function tracks(home) {
  const out = [], root = musicDir(home);
  const add = (rel) => { try { out.push({ name: rel, mood: rel.includes("/") ? rel.split("/")[0] : "", mb: +(fs.statSync(path.join(root, rel)).size / 1048576).toFixed(1) }); } catch {} };
  let top = []; try { top = fs.readdirSync(root, { withFileTypes: true }); } catch { return []; }
  for (const d of top) {
    if (d.name.startsWith(".")) continue;
    if (d.isFile() && AUDIO.has(path.extname(d.name).toLowerCase())) add(d.name);
    else if (d.isDirectory()) { let sub = []; try { sub = fs.readdirSync(path.join(root, d.name)); } catch {} for (const n of sub) if (!n.startsWith(".") && AUDIO.has(path.extname(n).toLowerCase())) add(d.name + "/" + n); }
  }
  return out.sort((a, b) => a.mood.localeCompare(b.mood) || a.name.localeCompare(b.name)).slice(0, 300);
}

// A track named on the page: only a plain file name that exists in the music folder.
export function trackPath(home, name) {
  const parts = String(name || "").split("/");
  if (parts.length > 2 || parts.some((p) => !p || p !== path.basename(p) || p.startsWith(".") || p === "..")) return null;
  if (!AUDIO.has(path.extname(parts[parts.length - 1]).toLowerCase())) return null;
  const f = path.join(musicDir(home), ...parts);
  return fs.existsSync(f) && fs.statSync(f).isFile() ? f : null;
}

// GET /music/<name>: play a track on the page (a preview before picking it)
export function serveTrack(home, name, res) {
  const f = trackPath(home, name);
  if (!f) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f).toLowerCase()] || "application/octet-stream", "Content-Length": fs.statSync(f).size, "Cache-Control": "no-store" });
  fs.createReadStream(f).pipe(res);
}

// POST /api/music-upload?name=<file name>: a new track into the music folder (40 MB at most; a name already there gets a number)
export async function upload(home, req, rawName) {
  let base = path.basename(String(rawName || "")).replace(/[^\w .()'&-]+/g, "_").replace(/^\.+/, "").slice(0, 80);
  const ext = path.extname(base).toLowerCase();
  if (!AUDIO.has(ext)) throw new Error("That isn't a music file. Use an MP3, M4A, WAV, AAC, OGG or FLAC file.");
  if (Number(req.headers["content-length"] || 0) > MAX) throw new Error("That file is too big. Music tracks up to 40 MB.");
  fs.mkdirSync(musicDir(home), { recursive: true });
  const tmp = path.join(musicDir(home), `.upload-${process.pid}-${Date.now()}.part`);
  try {
    let seen = 0; req.on("data", (c) => { seen += c.length; if (seen > MAX) req.destroy(new Error("That file is too big. Music tracks up to 40 MB.")); });
    await pipeline(req, fs.createWriteStream(tmp));
    if (!fs.statSync(tmp).size) throw new Error("The file arrived empty. Try again.");
    const stem = base.slice(0, -ext.length) || "track";
    let name = stem + ext;
    for (let k = 2; fs.existsSync(path.join(musicDir(home), name)); k++) name = `${stem} ${k}${ext}`;
    fs.renameSync(tmp, path.join(musicDir(home), name));
    return name;
  } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
}

// Starter tracks: 3 soft beds made on this computer by scripts/make_music_bed.py (original synthesis, nothing to license),
// one per mood, so the music picker is never empty on day one. About 15 seconds each; one run at a time.
let making = null;
export function makeStarters(home, scripts) {
  if (making) return making;
  const moods = [["calm", "calm bed"], ["warm", "warm bed"], ["bright", "bright bed"]];
  making = (async () => {
    const made = [];
    for (const [mood, name] of moods) {
      const out = path.join(musicDir(home), mood, name + ".wav");
      if (fs.existsSync(out)) continue;
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await new Promise((ok, bad) => { const c = spawn("python3", [path.join(scripts, "make_music_bed.py"), out, "--mood", mood, "--seconds", "32"], { stdio: "ignore" }); c.on("close", (code) => (code === 0 ? ok() : bad(new Error("the starter track couldn't be made")))); });
      made.push(mood + "/" + name + ".wav");
    }
    return made;
  })().finally(() => { making = null; });
  return making;
}
