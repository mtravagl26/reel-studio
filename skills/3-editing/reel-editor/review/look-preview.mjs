// Added by By Mel Ross (0.27.0): "Show me on my clip" in the looks gallery. Runs scripts/look_preview.py (stills of the
// picked looks on the person's own footage) one at a time, and keeps the last picture to show. Used by the reel link
// (editor-server.mjs, the reel's own footage) and the home page (home-server.mjs, the last clip checked there).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ID = /^[HCL]\d{1,2}$/, THEME = /^[a-z0-9][a-z0-9-]{0,40}$/;

export function lookPreviews({ scripts, home, env, tag }) {
  let job = { state: "idle", error: null, notes: [], image: null, ids: [], theme: "" };
  const dir = path.join(home, ".look-previews");
  return {
    state: () => ({ state: job.state, error: job.error, notes: job.notes, ids: job.ids, theme: job.theme, has: !!job.image, at: job.at || null }),
    image: () => job.image,
    start(src, body) {
      if (job.state === "running") throw new Error("Stills are already being made. They take about 30 seconds.");
      if (!src) throw new Error("There's no clip to show the looks on yet. Check a clip first, at the top of the page.");
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].filter((i) => ID.test(i)).slice(0, 8);
      const theme = THEME.test(String(body.theme || "")) ? String(body.theme) : "";
      if (!ids.length && !theme) throw new Error("Add at least 1 look or a theme first.");
      const at = Object.entries(body.at && typeof body.at === "object" ? body.at : {}).filter(([k, v]) => ids.includes(k) && Number.isFinite(+v) && +v >= 0).map(([k, v]) => `${k}=${(+v).toFixed(2)}`);
      fs.mkdirSync(dir, { recursive: true });
      const out = path.join(dir, `${tag}-${Date.now()}`);
      const args = [path.join(scripts, "look_preview.py"), src, "--out", out, "--ids", ids.join(",")];
      if (theme) args.push("--theme", theme);
      if (at.length) args.push("--at", at.join(","));
      job = { state: "running", error: null, notes: [], image: null, ids, theme, startedAt: Date.now() };
      const c = spawn("python3", args, { env, stdio: ["ignore", "pipe", "pipe"] });
      let log = "";
      c.stdout.on("data", (d) => { log += d; }); c.stderr.on("data", (d) => { log += d; });
      c.on("close", (code) => {
        const lines = log.trim().split("\n"), last = lines[lines.length - 1] || "";
        if (code === 0 && last.endsWith(".jpg") && fs.existsSync(last)) {
          job = { ...job, state: "done", image: last, notes: lines.filter((l) => l.startsWith("note:")).map((l) => l.replace(/^note:\s*(Option A:\s*)?/, "")) };
        } else job = { ...job, state: "failed", error: (log.trim().split("\n").filter(Boolean).pop() || "the stills could not be made").slice(0, 400) };
        // keep the last 6 previews; older ones are removed
        try { const all = fs.readdirSync(dir).filter((n) => n.startsWith(tag + "-")).sort(); for (const n of all.slice(0, -6)) fs.rmSync(path.join(dir, n), { recursive: true, force: true }); } catch {}
      });
    },
  };
}
