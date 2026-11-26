// Added by By Mel Ross (0.33.0): "See them on my clip" next to the themes. Runs scripts/theme_preview.py (one still per
// theme on the person's own footage, the same moment for each) and hands each still to the page as soon as it's made.
// Used by the reel link (editor-server.mjs, the reel's own footage) and the home page (home-server.mjs, the last clip checked).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const NAME = /^([a-z0-9][a-z0-9-]{0,40}|-)$/;

export function themePreviews({ scripts, home, env, tag }) {
  let job = { state: "idle", error: null, notes: [], stills: {}, order: [] };
  const dir = path.join(home, ".look-previews");
  return {
    // stills: theme id ("" = the plain brand) -> the address of its picture
    state: () => ({ state: job.state, error: job.error, notes: job.notes, stills: Object.fromEntries(job.order.map((n) => [n === "-" ? "" : n, `/theme-preview/${n}.jpg?v=${job.v}`])) }),
    still(name) { return NAME.test(name) && job.stills[name] && fs.existsSync(job.stills[name]) ? job.stills[name] : null; },
    start(src) {
      if (job.state === "running") throw new Error("The stills are already being made. They take about a minute.");
      if (!src) throw new Error("There's no clip to show the themes on yet. Check a clip first, at the top of the page.");
      fs.mkdirSync(dir, { recursive: true });
      const out = path.join(dir, `${tag}-themes-${Date.now()}`);
      job = { state: "running", error: null, notes: [], stills: {}, order: [], v: Date.now() };
      const c = spawn("python3", [path.join(scripts, "theme_preview.py"), src, "--out", out], { env, stdio: ["ignore", "pipe", "pipe"] });
      let buf = "", err = "";
      const line = (l) => {
        const m = l.match(/^still: (\S+) (.+\.jpg)$/);
        if (m && NAME.test(m[1])) { job.stills[m[1]] = m[2]; job.order.push(m[1]); }
        else if (l.startsWith("note:")) job.notes.push(l.replace(/^note:\s*/, ""));
      };
      c.stdout.on("data", (d) => { buf += d; const ls = buf.split("\n"); buf = ls.pop(); ls.forEach(line); });
      c.stderr.on("data", (d) => { err += d; });
      c.on("close", (code) => {
        if (buf) line(buf);
        job = code === 0 ? { ...job, state: "done" } : { ...job, state: job.order.length ? "done" : "failed", error: job.order.length ? null : (err.trim().split("\n").filter(Boolean).pop() || "the stills could not be made").slice(0, 400) };
        // keep the last 3 sets
        try { const all = fs.readdirSync(dir).filter((n) => n.startsWith(tag + "-themes-")).sort(); for (const n of all.slice(0, -3)) fs.rmSync(path.join(dir, n), { recursive: true, force: true }); } catch {}
      });
    },
  };
}

// The 3 routes, the same on both servers. Returns true when it answered.
export async function themeRoutes(TP, req, res, p, src, json) {
  if (p === "/api/theme-previews" && req.method === "GET") { json(res, 200, { ok: true, ...TP.state() }); return true; }
  if (p === "/api/theme-previews" && req.method === "POST") {
    try { TP.start(src()); json(res, 200, { ok: true, ...TP.state() }); } catch (e) { json(res, 400, { ok: false, error: e.message }); }
    return true;
  }
  const m = p.match(/^\/theme-preview\/([a-z0-9-]+)\.jpg$/);
  if (m && req.method === "GET") {
    const f = TP.still(m[1]);
    if (!f) { res.writeHead(404).end(); return true; }
    res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store" });
    fs.createReadStream(f).pipe(res);
    return true;
  }
  return false;
}
