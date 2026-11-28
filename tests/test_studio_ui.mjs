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
const py = (...a) => execFileSync("python3", [join(SKILL, "scripts/review_sync.py"), ...a], { env, encoding: "utf8" });
py("export", reel, join(reel, "proposal.json"), join(tmp, "out"));
const data = read(tmp, "out", "reel.json"); data.srcUrl = "/files/raw.mp4";
writeFileSync(join(reel, "review_db", "reel", "current.json"), JSON.stringify(data));
writeFileSync(join(reel, "review_reel.json"), JSON.stringify(data));

const port = await new Promise((ok) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); }), base = `http://127.0.0.1:${port}`;
const server = spawn("node", [join(SKILL, "review/studio-server.mjs"), reel, "--port", String(port)], { env, stdio: "ignore" });
const profile = join(tmp, "chrome");
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "--window-size=1200,900", "about:blank"], { stdio: "ignore" });
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
  assert.deepEqual(await js(`[...document.querySelectorAll(".tab")].map((b) => b.firstChild.textContent)`), ["Trim", "Style", "Audio", "Wrap up"]);
  assert.match(await js(`document.querySelector("#reelname").textContent`), /Studio test reel/);
  assert.match(await js(`getComputedStyle(document.querySelector("h2")).fontFamily`), /Instrument Serif/);
  assert.equal(await js(`document.querySelector("#player").getBoundingClientRect().left < document.querySelector("#tx").getBoundingClientRect().left`), true, "the preview sits left of the words");
  assert.equal(await js(`document.querySelectorAll(".tally").length`), 0, "no summary line");
  assert.deepEqual(await js(`[...new Set([".pz", ".cw .x", ".tools button", ".steps .step", "section[data-p]", ".b", "#tx .w"].map((q) => getComputedStyle(document.querySelector(q)).borderTopLeftRadius))]`), ["4px"], "every box has the same corner");
  assert.equal(await js(`document.fonts.check('16px "Libre Franklin"') && document.fonts.check('26px "Instrument Serif"')`), true, "both fonts load from this computer");
  assert.equal(await js(`performance.getEntriesByType("resource").every((r) => new URL(r.name).host === location.host)`), true, "no outside requests");

  // Trim: cut a word, the reel gets shorter, it saves; Undo and Redo
  await tap('#tx .w[data-i="1"]');
  await until(`document.querySelector('#tx .w[data-i="1"]').classList.contains("cut")`, "beta struck out");
  await waitSaved((d) => JSON.stringify(d.cut) === "[1]", "the cut");
  await until(`/^Saved \\d/.test(document.querySelector("#savedat").textContent)`, "the saved time");
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

  // the preview stays on screen while the words scroll, and the whole of it fits (play button included)
  await js(`(() => { const c = document.querySelector("#caps"); for (let i = 0; i < 40; i++) c.appendChild(Object.assign(document.createElement("div"), { className: "caprow", textContent: "filler row", style: "height:44px" })); window.scrollTo(0, 900); })()`);
  await sleep(200);
  const pin = await js(`(() => { const r = document.querySelector(".side").getBoundingClientRect(); return { y: window.scrollY, top: r.top, bottom: r.bottom, h: innerHeight }; })()`);
  assert.ok(pin.y > 500 && pin.top >= 0 && pin.top < 30 && pin.bottom <= pin.h, "the preview is pinned and fully on screen: " + JSON.stringify(pin));
  await js(`window.scrollTo(0, 0)`);

  // a reload keeps the cut and the Undo history
  await open("/studio");
  await until(`document.querySelector('#tx .w[data-i="1"]')?.classList.contains("cut") && !document.querySelector("#undo").disabled`, "the cut and Undo after a reload");

  // the tabs: Next buttons walk Trim to Wrap up; Audio says where things live for now
  await click('[data-p="trim"] [data-next]');
  await until(`document.querySelector('.tab[data-tab="style"]').getAttribute("aria-selected") === "true" && !document.querySelector('[data-p="style"]').hidden`, "the Style tab");
  // Style: a look, the caption style, and the graphics on the reel's line all save to the same choices
  assert.ok((await js(`document.querySelectorAll(".lookcard").length`)) >= 6, "My brand plus the 5 built-in looks");
  await click('.lookcard[data-look="bold"]'); await waitSaved((d) => d.theme === "bold", "the look");
  assert.equal(await js(`document.querySelector('.lookcard[data-look="bold"]').getAttribute("aria-checked")`), "true");
  await click('#capmodes [data-capmode="spoken"]'); await waitSaved((d) => d.capmode === "spoken", "how the words light up");
  await click('#caplay [data-lay="captions-high"]'); await waitSaved((d) => d.layout === "captions-high", "where captions sit");
  await click("#hlon"); await waitSaved((d) => d.highlight && d.highlight.bg !== "none", "the box behind the highlighted word");
  assert.equal(await js(`document.querySelectorAll("#tl .tlb").length`), 1, "the fixture's 1 graphic is on the line");
  await click("#tl .tlb"); await until(`!!document.querySelector('#gdetail .gd [data-state="d"]')`, "the graphic's card");
  assert.equal(await js(`document.querySelector("#tl .tlb").getAttribute("aria-pressed")`), "true");
  await js(`(() => { const i = document.querySelector('#gdetail [data-wf="text"]'); i.value = "hi there"; i.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await waitSaved((d) => d.board?.g1?.set?.text === "hi there", "the graphic's new words");
  await click('#gdetail [data-state="c"]'); await until(`!!document.querySelector("#gnote")`, "the what-should-change box");
  await click('#gdetail [data-state="k"]'); await waitSaved((d) => d.board?.g1?.state === "k", "back to Keep");
  // GIPHY search lives on a graphic's card now: off until a key is saved, with the warning shown first
  await click('#gdetail [data-state="c"]'); await until(`!!document.querySelector("#gdetail [data-giphy]")`, "the GIPHY button on the card");
  await click("#gdetail [data-giphy]");
  await until(`/Off until you turn it on\..*GIPHY's rules say apps should not store copies/s.test(document.querySelector("#gdetail .giphy")?.textContent || "")`, "the GIPHY warning before any key");
  assert.match(await js(`document.querySelector("#gdetail .giphy-mark").textContent`), /Powered By\s+GIPHY/);
  await click('#gdetail [data-state="k"]');
  await click("#addg"); await until(`!document.querySelector("#addform").hidden`, "the add form");
  await js(`(() => { document.querySelector("#addnote").value = "the 3 steps"; document.querySelector("#addform").requestSubmit(); })()`);
  await waitSaved((d) => (d.wanted || []).length === 1 && d.wanted[0].note === "the 3 steps", "the graphic asked for");
  await until(`document.querySelectorAll("#tl .tlb.w").length === 1`, "the asked-for graphic on the line, dashed");
  await click('#amount [data-amt="few"]'); await waitSaved((d) => d.amount === "few", "how many graphics");
  await click("#undo"); await waitSaved((d) => d.amount == null, "Undo on the Style tab");
  await click('[data-p="style"] [data-next]');
  // Audio: all effects off and on, 1 sound switched off, 1 swapped for another from the library
  await until(`document.querySelectorAll("#cues .cue").length === 1 && !!document.querySelector("#cues .cue select")`, "the graphic's sound with its swap list");
  await click('#sfxall [data-sfx="off"]'); await waitSaved((d) => d.sfxAll === "off", "sound effects off");
  assert.equal(await js(`document.querySelectorAll("#cues .cue").length`), 0, "no list while they are off");
  await click('#sfxall [data-sfx="on"]'); await waitSaved((d) => d.sfxAll == null, "sound effects back on (the default, so nothing is stored)");
  await click("#cues .cue [data-toggle]"); await waitSaved((d) => d.sfxOff?.g1 === true, "1 sound switched off");
  await click("#cues .cue [data-toggle]"); await waitSaved((d) => !d.sfxOff?.g1, "and back on");
  await js(`(() => { const s = document.querySelector("#cues .cue select"); s.value = "ding"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await waitSaved((d) => d.sfxPick?.g1 === "ding", "the swapped sound");
  assert.match(await js(`document.querySelector("#cues .cue .cname").textContent`), /^ding/);
  assert.match(await js(`document.querySelector("#musicbox").textContent`), /Music opens after your first build or live preview/);
  await click('[data-p="audio"] [data-next]');
  // Wrap up: what needs Claude is said before the build, and a typed note is saved
  assert.match(await js(`document.querySelector("#needs").textContent`), /Build my reel can't make these:.*1 graphic you added.*only Claude does that/s);
  await js(`(() => { const n = document.querySelector("#wrapnote"); n.value = "take off the last half second"; n.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await waitSaved((d) => d.notes?.preview === "take off the last half second", "the note for Claude");
  await until(`/1 typed note/.test(document.querySelector("#needs").textContent)`, "the note counted in the list");
  await js(`(() => { document.querySelector("#revtext").value = "make this bigger"; document.querySelector("#revadd").click(); })()`);
  await waitSaved((d) => (d.revisions || []).length === 1 && d.revisions[0].text === "make this bigger" && d.revisions[0].rough === true, "a note at a moment");
  await js(`(() => { const n = document.querySelector("#brandreq"); n.value = "use my new colors"; n.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await waitSaved((d) => d.brandRequest === "use my new colors", "the brand note");
  assert.equal(await js(`document.querySelector('.steps [aria-current="step"]').textContent`), "1 Edit");
  await until(`!document.querySelector('[data-p="wrap"]').hidden`, "the Wrap up tab");
  assert.equal(await js(`document.querySelector("#build").textContent`), "Build my reel");
  assert.equal(await js(`document.querySelector("#buildmsg").textContent`), "Not built yet.");

  // an editor started before this page existed answers 404: the page says to restart it, and hides the button
  await js(`(() => { window.realFetch = window.fetch; window.fetch = (u, o) => String(u).includes("/api/quick-preview") ? Promise.resolve(new Response("Not found", { status: 404 })) : window.realFetch(u, o); })()`);
  await click("#quickbtn");
  await until(`/needs a restart/.test(document.querySelector("#pnote").textContent) && document.querySelector("#quickbtn").hidden`, "the restart message");
  await js(`window.fetch = window.realFetch`); await cdp("Page.reload"); await sleep(400); await until(`document.querySelectorAll("#tx .w").length === 6 && /Rough preview/.test(document.querySelector("#pnote").textContent)`, "the page again");
  // the live preview: one press cuts the video and lays the reel's own page over it, with no render
  assert.equal(await js(`document.querySelector("#quickbtn").hidden`), false, "the button shows on the rough preview");
  await click("#quickbtn");
  try { await until(`document.querySelector("#live").style.display !== "none" && /Live preview/.test(document.querySelector("#pnote").textContent)`, "the live preview", 120000); }
  catch (e) { console.log("DEBUG", await js(`document.querySelector("#pnote").textContent`), JSON.stringify(await (await fetch(base + "/api/quick-preview")).json())); throw e; }
  assert.match(await js(`document.querySelector("#v").getAttribute("src")`), /^\/files\/master\.mp4/);
  await until(`(() => { try { return document.querySelector("#live").contentWindow.reelLive.ready(); } catch { return false; } })()`, "the reel's page inside the preview", 20000);
  assert.equal(await js(`document.querySelector("#quickbtn").hidden`), true);
  assert.equal(JSON.parse(readFileSync(join(reel, "edit.json"), "utf8")).cards.find((c) => c.id === "g1").sfx.name, "ding", "the swapped sound is in the reel's plan");
  if (process.env.REEL_SHOT_LIVE) { await js(`(() => { const s = document.querySelector("#scrub"); s.value = 1.0; s.dispatchEvent(new Event("input", { bubbles: true })); })()`); await sleep(1500);
    writeFileSync(process.env.REEL_SHOT_LIVE, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64")); }
  // a caption fix redraws it by itself (same cuts, so no button and no build)
  await click('[data-tab="trim"]');
  await click('#caps .caprow [data-tool="edit"]');
  await js(`(() => { const i = document.querySelector("#caps .caprow input"); i.value = "fixed again"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); })()`);
  await until(`/Rough preview|Updating|Drawing/.test(document.querySelector("#pnote").textContent)`, "the preview dropping to rough while it redraws", 8000);
  await until(`/Live preview/.test(document.querySelector("#pnote").textContent)`, "the live preview coming back by itself", 60000);
  assert.match(readFileSync(join(reel, "edit.json"), "utf8"), /"again"/i, "the new wording reached the reel's plan");
  // a new cut drops to the rough preview at once and offers the button again
  await tap('#tx .w[data-i="4"]');
  await until(`/Rough preview/.test(document.querySelector("#pnote").textContent) && document.querySelector("#live").style.display === "none"`, "rough after a new cut", 8000);
  await sleep(2500);
  await until(`!document.querySelector("#quickbtn").hidden && document.querySelector("#v").getAttribute("src").startsWith("/files/raw")`, "the button back, on the raw clip", 15000);

  // the current Edit page sees the same choices
  await open("/review");
  await until(`document.querySelector('#tx .w[data-i="1"]')?.classList.contains("cut")`, "the same cut on the current Edit page");

  // 0.40.2 on the current Edit page: tapping the picture plays and pauses the rough cut on the Graphics and Captions tabs,
  // a graphic's picture plays from just before it, and the Preview tab keeps the rough cut until something is built
  for (const t of ["graphics", "captions"]) {
    await click(`.tab[data-tab="${t}"]`);
    await click("#player"); await until(`document.querySelector("#rough").textContent === "Pause"`, `the picture starting the rough cut on ${t}`);
    await click("#player"); await until(`document.querySelector("#rough").textContent === "Play rough cut"`, `the picture pausing it on ${t}`);
  }
  await click('.tab[data-tab="graphics"]');
  await click(".card .thumb[role=button]"); await until(`document.querySelector("#rough").textContent === "Pause"`, "a graphic's picture playing the rough cut");
  await click("#rough");
  await click('.tab[data-tab="preview"]');
  assert.equal(await js(`document.querySelector("#rough").hidden`), false, "the Preview tab keeps the rough cut until something is built");
  await js(`(() => { const n = document.querySelector("#notes"); n.value = "take off the last half second"; n.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await click("#build");
  assert.match(await js(`document.querySelector("#needbox").textContent`), /This button can't make these:.*They need something new written, and only Claude does that.*Pick one\./s);
  assert.deepEqual(await js(`[...document.querySelectorAll("#needbox button")].map((b) => b.textContent)`), ["Build now, skip those for now", "Cancel, I'll ask Claude"]);
  await click("#needbox button.quiet");
  assert.match(await js(`document.querySelector("#needbox").textContent`), /Nothing was built\. Your choices are saved\./);
  if (process.env.REEL_SHOT) { await open("/studio"); await until(`document.querySelectorAll("#tx .w").length === 6`, "page"); await sleep(600);
    writeFileSync(process.env.REEL_SHOT, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64")); }
  console.log("PASS: /studio (4 tabs, your site's look, Trim end to end, saved and shared with the current Edit page)");
} finally {
  ws?.close(); chrome.kill(); server.kill();
  await sleep(300); rmSync(tmp, { recursive: true, force: true });
}
