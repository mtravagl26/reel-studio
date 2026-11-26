// Added by By Mel Ross (0.38.7). The home page in a real browser: check a clip, pick the kind of reel, open the looks page,
// come back with "Back to the start", and the checked clip and the kind of reel are still there.
// Run: CHROME=/path/to/chrome node tests/test_home_ui.mjs   (skips without Chrome)
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createServer } from "node:net";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = join(ROOT, "skills/3-editing/reel-editor");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!existsSync(CHROME)) { console.log("SKIP: Google Chrome not found (set CHROME=/path/to/chrome)"); process.exit(0); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tmp = mkdtempSync(join(tmpdir(), "home-ui-")), home = join(tmp, "reels"), clip = join(tmp, "take.mp4");
mkdirSync(home, { recursive: true });
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=180x320:r=30:d=4", "-f", "lavfi", "-i", "sine=d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", clip]);
const b64 = readFileSync(clip).toString("base64");

const port = await new Promise((ok) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); }), base = `http://127.0.0.1:${port}`;
const env = { ...process.env, REELS_HOME: home, REEL_FRAMING_NO_FACES: "1" };
const server = spawn("node", [join(SKILL, "review/home-server.mjs"), "--port", String(port)], { env, stdio: "ignore" });
const profile = join(tmp, "chrome");
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--mute-audio", "about:blank"], { stdio: "ignore" });
let ws, id = 0; const pending = new Map();
const cdp = (method, params = {}) => new Promise((ok, fail) => { const i = ++id; pending.set(i, { ok, fail }); ws.send(JSON.stringify({ id: i, method, params })); });
async function js(expr) {
  const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function until(expr, what, ms = 30000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) { try { if (await js(expr)) return; } catch {} }
  throw new Error("timed out waiting for " + what);
}
async function open(p) { await cdp("Page.navigate", { url: base + p }); await sleep(300); await until(`document.readyState === "complete"`, "page load"); }

try {
  let devtools = null;
  for (let i = 0; i < 100 && !devtools; i++, await sleep(100)) { try { devtools = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch {} }
  if (!devtools) throw new Error("Chrome didn't open its control port");
  const targets = await (await fetch(`http://127.0.0.1:${devtools}/json/list`)).json();
  ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.fail(new Error(m.error.message)) : p.ok(m.result); } });
  await cdp("Page.enable");
  let up = false; for (let i = 0; i < 50 && !up; i++, await sleep(100)) { try { up = (await fetch(base + "/")).ok; } catch {} }
  if (!up) throw new Error("the home server didn't start");

  await open("/");
  // drop the clip, the way a drag and drop does
  await js(`(() => { const bin = atob(${JSON.stringify(b64)}), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([a], "take.mp4", { type: "video/mp4" }));
    document.querySelector("#drop").dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); })()`);
  await until(`/Good to edit|Retake/.test(document.querySelector("#verdict")?.textContent || "")`, "the clip check", 60000);
  const verdict = await js(`document.querySelector("#verdict").textContent`), headline = await js(`document.querySelector("#headline").textContent`);
  await js(`document.querySelector("#formats .style").click()`);
  await until(`!document.querySelector("#step3").hidden`, "steps 3 to 5 after picking the kind of reel");
  const kind = await js(`document.querySelector('#formats .style[aria-pressed="true"]').dataset.id`);

  // to the looks page, then back with its own link
  await js(`document.querySelector("#alllooks").click()`);
  await until(`location.pathname === "/looks" && document.readyState === "complete"`, "the looks page");
  await until(`!document.querySelector("#back").hidden`, "Back to the start on the looks page");
  await js(`document.querySelector("#back").click()`);
  await until(`location.pathname === "/" && document.readyState === "complete"`, "the home page again");

  await until(`!document.querySelector("#result").hidden && document.querySelector("#verdict").textContent === ${JSON.stringify(verdict)}`, "the checked clip still shown");
  assert.equal(await js(`document.querySelector("#headline").textContent`), headline);
  assert.equal(await js(`document.querySelector("#drop").hidden`), true, "no need to drop the clip again");
  assert.equal(await js(`document.querySelector('#formats .style[aria-pressed="true"]')?.dataset.id`), kind, "the kind of reel is still picked");
  assert.equal(await js(`document.querySelector("#step3").hidden`), false, "steps 3 to 5 are still open");
  assert.match(await js(`document.querySelector("#say").textContent`), /take/, "the request still names the clip");
  console.log("PASS: home page keeps the checked clip and the kind of reel across the looks page");
} finally {
  ws?.close(); chrome.kill(); server.kill();
  await sleep(300); rmSync(tmp, { recursive: true, force: true });
}
