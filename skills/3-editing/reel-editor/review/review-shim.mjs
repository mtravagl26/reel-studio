// Added by By Mel Ross. The Reel Review page's local stand-in for claude.ai storage, shared by serve.mjs (review only) and
// editor-server.mjs / studio-server.mjs (review and touch-ups on one link). The page calls window.claude.use("db"); this answers it
// from JSON files in <reel>/review_db/<path>.json.
export const DOCS = new Set(["reel/current", "review/current", "builds/latest"]);
export const WRITABLE = new Set(["review/current"]);   // the page only records decisions; Claude writes reel + builds as files
export const SHIM = `(() => {
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

// Added by By Mel Ross (0.8.1). Only the page this server sent may talk to it. Without this, any website open in the same browser
// could post to http://127.0.0.1:<port> and change the edit, and a look-alike address could read it. The request must be addressed
// to this computer (its own name or IP and this port), and a change (POST/PUT) must come from that same page.
import os from "node:os";
export function trusted(req, port, lan) {
  const host = String(req.headers.host || "").toLowerCase();
  const mine = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
  if (lan) {
    for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) mine.add(`${a.family === "IPv6" ? `[${a.address}]` : a.address}:${port}`.toLowerCase());
    const name = os.hostname().toLowerCase();
    mine.add(`${name}:${port}`); mine.add(`${name.replace(/\.local$/, "")}.local:${port}`);
  }
  if (!mine.has(host)) return false;
  if (req.method === "GET" || req.method === "HEAD") return true;
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;                       // not a browser (a script on this computer)
  try { return new URL(origin).host.toLowerCase() === host; } catch { return false; }
}
