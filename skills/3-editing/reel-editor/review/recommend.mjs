// Added by By Mel Ross (0.34.0): 3 recommended looks for a clip, each with its reason (scripts/recommend.py). Used by the home
// page (the last clip checked) and Touch-ups (the reel). Results are kept per clip, its last change and the reel style.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function recommender({ scripts, env }) {
  const cache = new Map();
  return async (src, style = "full") => {
    if (!src) throw new Error("There's no clip to look at yet. Check a clip first, at the top of the page.");
    style = style === "simple" ? "simple" : "full";
    let stamp = 0;
    try {
      const st = fs.statSync(src);
      stamp = st.isDirectory() ? Math.max(...["master.mp4", "master_transcript.json", "transcript.json"].map((n) => { try { return fs.statSync(path.join(src, n)).mtimeMs; } catch { return 0; } }), st.mtimeMs) : st.mtimeMs;
    } catch {}
    const key = `${src}|${stamp}|${style}`;
    if (!cache.has(key)) {
      cache.set(key, new Promise((ok, bad) => execFile("python3", [path.join(scripts, "recommend.py"), src, "--style", style], { env, timeout: 120000, maxBuffer: 1 << 20 }, (err, out, errOut) => {
        if (err) { cache.delete(key); return bad(new Error((errOut || err.message).trim().split("\n").pop())); }
        try { ok(JSON.parse(out)); } catch { cache.delete(key); bad(new Error("the recommendations could not be read")); }
      })));
    }
    return cache.get(key);
  };
}
