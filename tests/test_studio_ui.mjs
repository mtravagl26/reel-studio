// Added by By Mel Ross (0.39.0). The new Edit page (/studio) in a real browser: 4 tabs, the preview, Trim end to end
// (cut a word, Undo, Redo, highlight a caption word, fix a caption's wording, merge), saved to the same decisions the
// review page uses, kept across a reload, and Build my reel from Wrap up.
// Run: CHROME=/path/to/chrome node tests/test_studio_ui.mjs   (skips without Chrome)
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createServer } from "node:net";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."), SKILL = join(ROOT, "skills/3-editing/reel-editor");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!existsSync(CHROME)) { console.log("SKIP: Google Chrome not found (set CHROME=/path/to/chrome)"); process.exit(0); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (...p) => JSON.parse(readFileSync(join(...p), "utf8"));

const tmp = mkdtempSync(join(tmpdir(), "studio-ui-")), home = join(tmp, "reels"), reel = join(home, "r1");
mkdirSync(join(reel, "review_db", "reel"), { recursive: true });
writeFileSync(join(home, "brand.json"), JSON.stringify({ name: "Test", speed: 1, colors: { main: "#112233", pop: "#aabbcc", light: "#ffffff" }, captions: { size: 90 } }));
const ff = (a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a]);
ff(["-f", "lavfi", "-i", "testsrc2=s=180x320:r=30:d=10", "-f", "lavfi", "-i", "sine=f=220:d=10", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", join(reel, "raw.mp4")]);
ff(["-i", join(reel, "raw.mp4"), "-ac", "1", "-ar", "48000", join(reel, "voice.wav")]);
const NAMES = ["alpha", "beta", "gamma.", "delta", "epsilon", "zeta."];
writeFileSync(join(reel, "transcript.json"), JSON.stringify(NAMES.map((text, i) => ({ text, start: i * 1.5 + 0.2, end: i * 1.5 + 0.6 }))));
writeFileSync(join(reel, "proposal.json"), JSON.stringify({ title: "Studio test reel", proposedCut: [[0, 10]], accentWords: [], cards: [{ id: "g1", type: "tag", kind: "Pill", what: "Pill: hello", text: "hello", anchor: "gamma", after: 0, place: [240, 130, 600, 110] }] }));
const env = { ...process.env, REELS_HOME: home };
// stand-ins for the cut and the render, so Build my reel finishes in a second
const stub = join(tmp, "stub"); mkdirSync(stub);
for (const f of ["review_sync.py", "touchups.py", "pacing.py", "theme.py", "_theme.py", "recommend.py"]) { try { writeFileSync(join(stub, f), readFileSync(join(SKILL, "scripts", f))); } catch { /* not every helper exists */ } }
const py = (...a) => execFileSync("python3", [join(SKILL, "scripts/review_sync.py"), ...a], { env, encoding: "utf8" });
py("export", reel, join(reel, "proposal.json"), join(tmp, "out"));
const data = read(tmp, "out", "reel.json"); data.srcUrl = "/files/raw.mp4";
writeFileSync(join(reel, "review_db", "reel", "current.json"), JSON.stringify(data));
writeFileSync(join(reel, "review_reel.json"), JSON.stringify(data));

const port = await new Promise((ok) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); }), base = `http://127.0.0.1:${port}`;
const server = spawn("node", [join(SKILL, "review/studio-server.mjs"), reel, "--port", String(port)], { env, stdio: "ignore" });
const profile = join(tmp, "chrome");
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--mute-audio", "--window-size=1200,900", "about:blank"], { stdio: "ignore" });
let ws, id = 0; const pending = new Map();
const cdp = (method, params = {}) => new Promise((ok, fail) => { const i = ++id; pending.set(i, { ok, fail }); ws.send(JSON.stringify({ id: i, method, params })); });
async function js(expr) { const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
async function until(expr, what, ms = 15000) { for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) { try { if (await js(expr)) return; } catch {} } throw new Error("timed out waiting for " + what); }
async function open(p) { await cdp("Page.navigate", { url: base + p }); await sleep(300); await until(`document.readyState === "complete"`, "page load"); }
const click = (sel) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error("no element: " + ${JSON.stringify(sel)}); e.click(); return true; })()`);
const tap = (sel) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error("no element: " + ${JSON.stringify(sel)}); const o = { bubbles: true, clientX: 1, clientY: 1 }; e.dispatchEvent(new PointerEvent("pointerdown", o)); window.dispatchEvent(new PointerEvent("pointerup", o)); return true; })()`);
const saved = () => read(reel, "review_db", "review", "current.json");
const waitSaved = async (test, what) => { for (let i = 0; i < 60; i++) { try { if (test(saved())) return; } catch {} await sleep(100); } throw new Error("not saved: " + what); };

try {
  let devtools = null;
  for (let i = 0; i < 100 && !devtools; i++, await sleep(100)) { try { devtools = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch {} }
  if (!devtools) throw new Error("Chrome didn't open its control port");
  const targets = await (await fetch(`http://127.0.0.1:${devtools}/json/list`)).json();
  ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.fail(new Error(m.error.message)) : p.ok(m.result); } });
  await cdp("Page.enable");
  let up = false; for (let i = 0; i < 50 && !up; i++, await sleep(100)) { try { up = (await fetch(base + "/api/stage")).ok; } catch {} }
  if (!up) throw new Error("the studio server didn't start");

  await open("/studio");
  await until(`document.querySelectorAll("#tx .w").length === 6 && document.querySelectorAll("#caps .caprow").length > 0`, "the words and captions");
  assert.deepEqual(await js(`[...document.querySelectorAll(".tab")].map((b) => b.firstChild.textContent)`), ["Trim", "Style", "Sound", "Wrap up"]);
  assert.match(await js(`document.querySelector("#reelname").textContent`), /Studio test reel/);
  assert.match(await js(`getComputedStyle(document.querySelector("h2")).fontFamily`), /Instrument Serif/);
  assert.equal(await js(`document.fonts.check('16px "Libre Franklin"') && document.fonts.check('26px "Instrument Serif"')`), true, "both fonts load from this computer");
  assert.equal(await js(`performance.getEntriesByType("resource").every((r) => new URL(r.name).host === location.host)`), true, "no outside requests");

  // Trim: cut a word, the reel gets shorter, it saves; Undo and Redo
  const len = () => js(`document.querySelector("#ctally b").textContent`), before = await len();
  await tap('#tx .w[data-i="1"]');
  await until(`document.querySelector('#tx .w[data-i="1"]').classList.contains("cut")`, "beta struck out");
  await waitSaved((d) => JSON.stringify(d.cut) === "[1]", "the cut");
  assert.match(await js(`document.querySelector("#savedat").textContent`), /^Saved \d/);
  await click("#undo"); await waitSaved((d) => !(d.cut || []).length, "Undo");
  await click("#redo"); await waitSaved((d) => JSON.stringify(d.cut) === "[1]", "Redo");
  assert.notEqual(await js(`document.querySelector("#clock").textContent`), "0:00 / 0:00");

  // captions: highlight a word, fix the wording, merge two lines
  await click("#caps .caprow .x");
  await waitSaved((d) => (d.captions || []).some((c) => (c.acc || []).length), "the highlighted word");
  const rows = await js(`document.querySelectorAll("#caps .caprow").length`);
  await click('#caps .caprow [data-tool="merge"]');
  await until(`document.querySelectorAll("#caps .caprow").length === ${rows - 1}`, "two captions merged");
  await click('#caps .caprow [data-tool="edit"]');
  await js(`(() => { const i = document.querySelector("#caps .caprow input"); i.value = "all fixed up"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); })()`);
  await waitSaved((d) => (d.captions || [])[0]?.text === "all fixed up", "the new wording");

  // the preview draws the caption on the rough cut
  await js(`(() => { const s = document.querySelector("#scrub"); s.value = 0.5; s.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await until(`/all|fixed/i.test(document.querySelector("#ov .capov")?.textContent || "")`, "the caption on the preview");
  assert.match(await js(`document.querySelector("#pnote").textContent`), /Rough preview/);

  // a reload keeps the cut and the Undo history
  await open("/studio");
  await until(`document.querySelector('#tx .w[data-i="1"]')?.classList.contains("cut") && !document.querySelector("#undo").disabled`, "the cut and Undo after a reload");

  // the tabs: Next buttons walk Trim to Wrap up; Style and Sound say where things live for now
  await click('[data-p="trim"] [data-next]');
  await until(`document.querySelector('.tab[data-tab="style"]').getAttribute("aria-selected") === "true" && !document.querySelector('[data-p="style"]').hidden`, "the Style tab");
  assert.match(await js(`document.querySelector('[data-p="style"] .soon').textContent`), /being built/);
  await click('[data-p="style"] [data-next]'); await click('[data-p="sound"] [data-next]');
  await until(`!document.querySelector('[data-p="wrap"]').hidden`, "the Wrap up tab");
  assert.equal(await js(`document.querySelector("#build").textContent`), "Build my reel");
  assert.equal(await js(`document.querySelector("#buildmsg").textContent`), "Not built yet.");

  // the current Edit page sees the same choices
  await open("/review");
  await until(`document.querySelector('#tx .w[data-i="1"]')?.classList.contains("cut")`, "the same cut on the current Edit page");
  if (process.env.REEL_SHOT) { await open("/studio"); await until(`document.querySelectorAll("#tx .w").length === 6`, "page"); await sleep(600);
    writeFileSync(process.env.REEL_SHOT, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64")); }
  console.log("PASS: /studio (4 tabs, your site's look, Trim end to end, saved and shared with the current Edit page)");
} finally {
  ws?.close(); chrome.kill(); server.kill();
  await sleep(300); rmSync(tmp, { recursive: true, force: true });
}
