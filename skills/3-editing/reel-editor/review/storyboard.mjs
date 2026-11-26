// Added by By Mel Ross (0.35.0): the storyboard, after each render. scripts/scenes.py splits the newest render into scenes with
// one still each and flags what needs a look; the Storyboard tab shows them and keeps a note per scene for Claude in
// editor/storyboard/vNNN/notes.json. Claude reads those notes (and sheet.jpg) the same way it reads the review page.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export function storyboard({ REEL, SKILL, listRenders, childEnv }) {
  const making = new Map();   // render tag -> true while scenes.py runs
  const errors = new Map();
  const latest = () => {
    let r; try { r = listRenders().slice(-1)[0]; } catch { return null; }
    if (!r || !r.phone) return null;
    const tag = (path.basename(r.phone).match(/^v\d+/) || [])[0];
    return tag ? { r, tag, dir: path.join(REEL, "editor", "storyboard", tag), video: path.join(REEL, r.phone) } : null;
  };
  const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
  const notesOf = (dir) => readJSON(path.join(dir, "notes.json"), { scenes: {}, done: false });
  const fresh = (L) => { const f = path.join(L.dir, "scenes.json"); try { return fs.statSync(f).mtimeMs >= fs.statSync(L.video).mtimeMs; } catch { return false; } };
  function make(L) {
    if (making.get(L.tag) || !fs.existsSync(L.video)) return;
    making.set(L.tag, true); errors.delete(L.tag);
    const c = spawn("python3", [path.join(SKILL, "scripts", "scenes.py"), REEL, "--video", path.relative(REEL, L.video), "--out", path.relative(REEL, L.dir)], { cwd: REEL, env: childEnv() });
    let err = "";
    c.stderr.on("data", (d) => { err += d; });
    c.on("close", (code) => { making.delete(L.tag); if (code !== 0) errors.set(L.tag, err.trim().split("\n").slice(-1)[0] || "the storyboard couldn't be made"); });
    c.on("error", (e) => { making.delete(L.tag); errors.set(L.tag, String(e.message || e)); });
  }
  function view() {
    const L = latest();
    if (!L) return { none: true };
    if (!fresh(L)) { if (!errors.has(L.tag)) make(L); return { making: !errors.has(L.tag), error: errors.get(L.tag) || null, v: L.r.v }; }
    const sb = readJSON(path.join(L.dir, "scenes.json"), null);
    if (!sb) return { making: false, error: "the storyboard file can't be read", v: L.r.v };
    const base = "/files/" + path.relative(REEL, L.dir).split(path.sep).join("/") + "/";
    return { v: L.r.v, tag: L.tag, at: L.r.at, video: "/files/" + L.r.phone, base, length: sb.length, sheet: sb.sheet ? base + sb.sheet : null, scenes: sb.scenes, notes: notesOf(L.dir) };
  }
  function save(body) {
    const L = latest();
    if (!L || String(body.v) !== String(L.r.v)) throw new Error("this storyboard is for an older render: reload the page");
    const sb = readJSON(path.join(L.dir, "scenes.json"), null);
    if (!sb) throw new Error("no storyboard yet");
    const notes = notesOf(L.dir);
    if (body.done != null) notes.done = !!body.done;
    if (body.n != null) {
      const sc = sb.scenes.find((x) => x.n === Number(body.n));
      if (!sc) throw new Error("no such scene");
      const cur = notes.scenes[sc.n] || {};
      if (body.note != null) cur.note = String(body.note).replace(/\r/g, "").slice(0, 600);
      if (body.ok != null) cur.ok = !!body.ok;
      Object.assign(cur, { start: sc.start, end: sc.end, said: sc.said, cards: sc.cards.map((c) => c.label) });
      if (!cur.note && !cur.ok) delete notes.scenes[sc.n]; else notes.scenes[sc.n] = cur;
      notes.done = false;   // a new note means Claude hasn't seen it yet
    }
    notes.render = L.tag; notes.at = new Date().toISOString();
    fs.mkdirSync(L.dir, { recursive: true });
    fs.writeFileSync(path.join(L.dir, "notes.json"), JSON.stringify(notes, null, 1));
    return { notes };
  }
  const done = () => { const L = latest(); return !!(L && notesOf(L.dir).done); };
  return { view, save, done, make: () => { const L = latest(); if (L && !fresh(L)) make(L); } };
}
