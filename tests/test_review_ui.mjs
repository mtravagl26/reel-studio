// Added by By Mel Ross (0.9.0). The Reel Studio pages in a real browser, on one link: the review page (tap a word to cut it, tabs,
// the theme picker, decisions saved to disk), then the touch-ups page once the reel is built (step bar, theme picker, adding text,
// pictures that circle the head, and the GIPHY box staying off without a key).
// Run by hand, like test_thumbnail_ui.mjs (it is not part of `npm test` or CI): node tests/test_review_ui.mjs   (needs Node 22+, python3, ffmpeg and Google Chrome; set CHROME=/path/to/chrome if it's elsewhere)
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, copyFileSync } from "node:fs";
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
const read = (...p) => JSON.parse(readFileSync(join(...p), "utf8"));

// ---------- a throwaway reel, exported for the review page ----------
const tmp = mkdtempSync(join(tmpdir(), "review-ui-")), home = join(tmp, "reels"), reel = join(home, "r1");
mkdirSync(join(reel, "review_db", "reel"), { recursive: true });
writeFileSync(join(home, "brand.json"), JSON.stringify({ name: "Test", speed: 1, colors: { main: "#112233", pop: "#aabbcc", light: "#ffffff" }, captions: { mode: "word", size: 90 } }));
const ff = (a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a]);
ff(["-f", "lavfi", "-i", "testsrc2=s=180x320:r=30:d=10", "-f", "lavfi", "-i", "sine=f=220:d=10", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", join(reel, "raw.mp4")]);
ff(["-i", join(reel, "raw.mp4"), "-ac", "1", "-ar", "48000", join(reel, "voice.wav")]);
const NAMES = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];
writeFileSync(join(reel, "transcript.json"), JSON.stringify(NAMES.map((text, i) => ({ text, start: i * 1.5 + 0.2, end: i * 1.5 + 0.6 }))));
writeFileSync(join(reel, "proposal.json"), JSON.stringify({ title: "UI test reel", proposedCut: [[0, 10]], accentWords: [],
  cards: [{ id: "g1", type: "tag", kind: "Pill", what: "Pill: hello", text: "hello", anchor: "gamma", after: 0, place: [240, 130, 600, 110] }] }));
const env = { ...process.env, REELS_HOME: home }; delete env.GIPHY_API_KEY;
// 0.33.0: the theme stills use a stand-in for the snapshot (it only needs a picture)
mkdirSync(join(tmp, "bin"), { recursive: true });
writeFileSync(join(tmp, "bin", "snap.sh"), `#!/bin/sh\nffmpeg -v error -y -f lavfi -i color=c=gray:s=108x192 -frames:v 1 "$3"\n`, { mode: 0o755 });
env.REEL_SNAPSHOT = join(tmp, "bin", "snap.sh");
const py = (...a) => execFileSync("python3", [join(SKILL, "scripts/review_sync.py"), ...a], { env, encoding: "utf8" });
py("export", reel, join(reel, "proposal.json"), join(tmp, "out"));
const data = read(tmp, "out", "reel.json"); data.srcUrl = "/files/raw.mp4";
writeFileSync(join(reel, "review_db", "reel", "current.json"), JSON.stringify(data));
writeFileSync(join(reel, "review_reel.json"), JSON.stringify(data));

// ---------- the studio server + headless Chrome ----------
const port = await new Promise((ok) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); }), base = `http://127.0.0.1:${port}`;
const server = spawn("node", [join(SKILL, "review/studio-server.mjs"), reel, "--port", String(port)], { env, stdio: "ignore" });
const profile = join(tmp, "chrome");
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--mute-audio", "about:blank"], { stdio: "ignore" });
let ws, id = 0; const pending = new Map();
function cdp(method, params = {}) { return new Promise((ok, fail) => { const i = ++id; pending.set(i, { ok, fail }); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function js(expr) {
  const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function until(expr, what, ms = 15000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) { try { if (await js(expr)) return; } catch {} }
  throw new Error("timed out waiting for " + what);
}
async function open(p) { await cdp("Page.navigate", { url: base + p }); await sleep(300); await until(`document.readyState === "complete"`, "page load"); }
const click = (sel) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error("no element: " + ${JSON.stringify(sel)}); e.click(); return true; })()`);
const text = (sel) => js(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
const decisions = () => read(reel, "review_db", "review", "current.json");

try {
  let devtools = null;
  for (let i = 0; i < 100 && !devtools; i++, await sleep(100)) { try { devtools = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch {} }
  if (!devtools) throw new Error("Chrome started but did not open its control port: run this on a computer with a normal Chrome install");
  const targets = await (await fetch(`http://127.0.0.1:${devtools}/json/list`)).json();
  ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.fail(new Error(m.error.message)) : p.ok(m.result); } });
  await cdp("Page.enable");
  let up = false; for (let i = 0; i < 50 && !up; i++, await sleep(100)) { try { up = (await fetch(base + "/api/stage")).ok; } catch {} }
  if (!up) throw new Error("the studio server didn't start on port " + port);

  // ---- 1 Review: the one link opens the review page while the reel is not built
  // 0.28.0: the one link opens the Edit page, on The cut while the reel is not built
  await open("/");
  await until(`document.querySelector("#t-cut")?.getAttribute("aria-selected") === "true" && document.querySelector("#f-cut")?.getAttribute("src") === "/review?embed=1"`, "the Edit page on The cut");
  await open("/review");
  await until(`location.pathname === "/review" && /UI test reel/.test(document.querySelector("#reelname")?.textContent || "")`, "the review page to load the reel");
  assert.equal(await text("h1"), "Review the cut");
  assert.equal(await text('.steps [aria-current="step"]'), "1 Edit");
  assert.equal(await js(`document.querySelector('.steps [data-step="caption"]').getAttribute("href")`), "/caption");
  assert.equal(await js(`document.querySelector("#builtnote").hidden`), true, "no 'already built' note yet");
  assert.equal(await js(`getComputedStyle(document.body).backgroundColor`), "rgb(245, 242, 236)", "cream page");
  const words = `[...document.querySelectorAll(".w")].filter((e) => !e.classList.contains("filler"))`;
  assert.ok(await js(`${words}.length`) >= 6, "every word is a chip");
  // the page cuts on a press (and a drag across several words), so press and let go on one word
  await js(`(() => { const e = ${words}.find((x) => x.textContent.trim() === "beta"); e.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, button: 0 })); window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })); })()`);
  await until(`${words}.find((e) => e.textContent.trim() === "beta").classList.contains("cut")`, "beta to show as cut");
  for (let i = 0; i < 60 && !existsSync(join(reel, "review_db", "review", "current.json")); i++) await sleep(100);
  await sleep(1200);
  assert.deepEqual(decisions().cut, [1], "the cut is saved on this computer");
  for (const tab of ["Graphics", "Captions", "Sound & color", "Preview", "Cover", "Cuts"]) {
    await js(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === ${JSON.stringify(tab)}).click()`); await sleep(120);
  }
  assert.deepEqual(await js(`[...document.querySelectorAll("#theme option")].map((o) => o.textContent)`), ["My brand as it is", "Bold", "Editorial", "Handwritten", "Minimal", "Whimsical"]);
  await js(`(() => { const s = document.querySelector("#theme"); s.value = "editorial"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await sleep(1500);
  assert.equal(decisions().theme, "editorial");
  assert.match(await text("#themenote"), /serif/);
  // 0.34.2: caption colors and size show on the player as they change; where captions sit is folded until asked for
  await js(`document.querySelector('[data-tab="captions"]').click()`); await sleep(200);
  assert.equal(await js(`document.querySelector(".spotfold")?.open`), false, "Captions above your head starts folded");
  await js(`(() => { const r = document.querySelector("#csize"); r.value = 100; r.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await until(`document.querySelector("#ov .capov")`, "a caption drawn on the player while the size moves");
  const small = await js(`parseFloat(document.querySelector("#ov .capov").style.fontSize)`);
  await js(`(() => { const r = document.querySelector("#csize"); r.value = 150; r.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await until(`parseFloat(document.querySelector("#ov .capov")?.style.fontSize) > ${small}`, "the caption on the player to grow with the slider");
  await js(`(() => { const i = document.querySelector('#hlrow input[aria-label="Highlighted word"]'); i.value = "#ff0000"; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await until(`[...document.querySelectorAll("#ov .capov span")].some((s) => s.style.color === "rgb(255, 0, 0)") || !document.querySelector("#ov .capov .a")`, "the highlighted word turns red on the player");

  // ---- "build preview": the import, then the same link opens touch-ups
  const out = py("import", reel, join(reel, "review_db", "review", "current.json"));
  assert.match(out, /captions/);
  assert.equal(read(reel, "edit.json").theme, "editorial");
  copyFileSync(join(reel, "raw.mp4"), join(reel, "master.mp4")); copyFileSync(join(reel, "raw.mp4"), join(reel, "final.mp4"));
  writeFileSync(join(reel, "master_transcript.json"), JSON.stringify(read(reel, "edit.json").captions.flatMap((c) => c.words.map((w) => ({ text: w.text, start: w.t, end: w.t + 0.3 })))));
  mkdirSync(join(reel, "popups"), { recursive: true });
  for (const n of ["a", "b"]) ff(["-f", "lavfi", "-i", "color=c=red:s=80x100", "-frames:v", "1", join(reel, "popups", `${n}.png`)]);

  // ---- 2 Storyboard (0.35.0): first after a render, a note per scene, then Touch-ups once the notes are sent
  await open("/");
  await until(`document.querySelector("#t-board")?.getAttribute("aria-selected") === "true"`, "the Edit page on the Storyboard once built");
  await open("/storyboard");
  await until(`document.querySelectorAll(".scene").length > 0 && [...document.querySelectorAll(".scene img")].every((i) => i.complete && i.naturalWidth > 0)`, "the storyboard's scenes and stills", 60000);
  await js(`(() => { const t = document.querySelector('.scene [data-a="note"]'); t.value = "make this caption bigger"; t.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  const sbTag = (await js(`fetch("/api/storyboard").then((r) => r.json())`)).tag, sbDir = join(reel, "editor", "storyboard", sbTag);
  for (let i = 0; i < 50 && !existsSync(join(sbDir, "notes.json")); i++) await sleep(100);
  assert.equal(read(sbDir, "notes.json").scenes["1"].note, "make this caption bigger");
  await click('.scene [data-a="ok"]'); await sleep(400);
  assert.equal(read(sbDir, "notes.json").scenes["1"].ok, true);
  if (process.env.REEL_SHOT) { await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 1400, deviceScaleFactor: 1, mobile: true }); await sleep(500);
    writeFileSync(process.env.REEL_SHOT, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64")); await cdp("Emulation.clearDeviceMetricsOverride", {}); }
  await click("#send");
  await until(`/Tell Claude/.test(document.querySelector("#donemsg").textContent)`, "the sent message");
  assert.equal(read(sbDir, "notes.json").done, true);
  assert.ok(existsSync(join(sbDir, "sheet.jpg")), "the one-picture sheet for Claude");

  // ---- 3 Touch-ups
  await open("/");
  await until(`document.querySelector("#t-touch")?.getAttribute("aria-selected") === "true"`, "the Edit page on Touch-ups once the storyboard notes are sent");
  await open("/touchups");
  await until(`document.querySelector("h1")?.textContent === "Touch-ups" && document.querySelector("#caps .w")`, "the touch-ups page");
  assert.equal(await text('.steps [aria-current="step"]'), "1 Edit");
  assert.equal(await js(`document.querySelector('.steps [data-step="caption"]').getAttribute("href")`), "/caption");
  await js(`document.querySelectorAll("details").forEach((d) => (d.open = true))`);
  assert.equal(await js(`document.querySelector("#themePick").value`), "editorial", "the theme picked in review shows here");
  assert.match(await text("#giphy"), /not set up yet/, "GIPHY stays off without a key");
  // 0.33.0: See them on my clip, then tap a still to use that theme
  await click('[data-a="see-themes"]');
  await until(`document.querySelectorAll(".tpgrid img").length === 6`, "6 theme stills (my brand + 5 themes)", 120000);
  await until(`[...document.querySelectorAll(".tpgrid img")].every((i) => i.complete && i.naturalWidth > 0)`, "the stills to load");
  await click('[data-a="theme-pick"][data-v="minimal"]');
  await until(`document.querySelector("#themePick")?.value === "minimal"`, "Minimal picked from its still");
  assert.equal(read(reel, "edit.json").theme, "minimal");
  // 0.34.0: Recommended for this reel: 3 picks with reasons; adding one puts it in the reel
  await until(`document.querySelectorAll('[data-a="rec-use"]').length === 3`, "3 recommended looks", 60000);
  const recLook = await js(`document.querySelector('[data-a="rec-use"][data-k="look"]').dataset.v`);
  const before = read(reel, "edit.json").cards.length;
  await click('[data-a="rec-use"][data-k="look"]');
  await until(`true`, "");
  for (let i = 0; i < 50 && read(reel, "edit.json").cards.length === before; i++) await sleep(100);
  assert.equal(read(reel, "edit.json").cards.length, before + 1, `the recommended look ${recLook} was added`);
  await click("#addPill");
  await until(`/new pill/.test(document.querySelector("#cards").textContent)`, "the new text to appear");
  await click("#addOrbit");
  await until(`document.querySelectorAll('[data-a="orbit-pick"]').length === 2`, "the picture picker");
  for (const k of [0, 1]) { await js(`document.querySelectorAll('[data-a="orbit-pick"]')[${k}].click()`); await sleep(80); }   // the picker redraws after each pick
  await click('[data-a="orbit-add"]');
  await until(`/Circling my head/.test(document.querySelector("#popups").textContent)`, "the orbit to be listed");
  const edit = read(reel, "edit.json"), orbit = edit.cards.find((c) => c.type === "orbit");
  assert.deepEqual(orbit.src, ["popups/a.png", "popups/b.png"]); assert.equal(orbit.level, "crown");
  assert.ok(edit.cards.some((c) => c.type === "tag" && c.text === "new pill"));

  // ---- back to 1 Review: it says the reel is built, and a rebuild keeps the touch-ups
  await open("/review");
  await until(`document.querySelector("#builtnote") && !document.querySelector("#builtnote").hidden`, "the 'already built' note");
  assert.match(await text("#builtnote"), /your touch-ups come along/);
  const again = py("import", reel, join(reel, "review_db", "review", "current.json"));
  assert.match(again, /TOUCH-UP KEPT: tag "new pill"/); assert.match(again, /TOUCH-UP KEPT: orbit/);
  assert.ok(read(reel, "edit.json").cards.some((c) => c.type === "orbit"));
  console.log("PASS: Reel Studio pages (review: cut, tabs, theme, saved decisions; touch-ups: step bar, theme, text, orbit, GIPHY off; rebuild keeps touch-ups)");
} finally {
  ws?.close(); chrome.kill(); server.kill();
  await sleep(300); rmSync(tmp, { recursive: true, force: true });
}
