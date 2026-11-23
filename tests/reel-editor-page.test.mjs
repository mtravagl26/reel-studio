// Added by By Mel Ross. The reel editor page: its pure logic (edits, retiming when a cut piece is dropped or brought back), the popup
// and text-default parts of build_reel.py, and the local server (key, saves, undo, upload). No render is run here.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ff, haveVp9, py, run, skill, skipReason, tmp } from "./reel-helpers.mjs";

const review = path.join(skill, "review");
const core = await import(pathToFileURL(path.join(review, "editor-core.mjs")).href);

// ---------------------------------------------------------------------------------------------------------------- core
const EDL = { keep: [[10, 20], [22, 24], [30, 40]], xfade: 0.035 };           // pieces of 10, 2 and 10 s: reel 0-10, 10-12, 12-22
const mkEdit = () => ({
  captions: [
    { start: 1, end: 2, words: [{ text: "one", t: 1, accent: false }, { text: "two", t: 1.5, accent: true }] },
    { start: 10.2, end: 11, words: [{ text: "mid", t: 10.2, accent: false }, { text: "dle", t: 10.6, accent: false }] },
    { start: 11.8, end: 13, words: [{ text: "cross", t: 11.8, accent: false }, { text: "ing", t: 12.4, accent: false }] },   // crosses the 2nd join
    { start: 15, end: 16, words: [{ text: "after", t: 15, accent: false }] },
  ],
  punch: [[2, 1.025], 11, 15],
  cards: [
    { type: "tag", text: "early", start: 3, end: 5, y: 130 },
    { type: "tag", text: "inside", start: 10.5, end: 11.5, y: 130 },
    { type: "popup", src: "popups/a.png", start: 9, end: 13, pos: "top-right" },             // starts before, ends after the 2nd piece
    { type: "tag", text: "late", start: 14, end: 16, y: 130 },
  ],
  sfx_events: [{ name: "pop-soft", t: 3, db: -16 }, { name: "pop-soft", t: 10.4, db: -16 }, { name: "pop-soft", t: 15, db: -16 }],
});
const TR = [{ text: "one", start: 1, end: 1.4 }, { text: "mid", start: 10.2, end: 10.5 }, { text: "dle", start: 10.6, end: 10.9 }, { text: "after", start: 15, end: 15.4 }];

test("layout: reel times come from the kept pieces, a dropped piece keeps its place for restoring", () => {
  const st = core.initState(EDL, 1);
  assert.deepEqual(core.layout(st).map((p) => [p.start, p.end]), [[0, 10], [10, 12], [12, 22]]);
  assert.equal(core.reelLength(st), 22);
  st.pieces[1].kept = false;
  assert.deepEqual(core.layout(st).map((p) => [p.start, p.end]), [[0, 10], [10, 12], [10, 20]]);
  assert.equal(core.reelLength(st), 20);
  const fast = core.initState(EDL, 1.1);
  assert.ok(Math.abs(core.reelLength(fast) - 20) < 1e-3, "speed 1.1 shortens the reel by 1/1.1");
});

test("dropping the middle piece: words, cards, sounds and zooms inside it go, everything after moves up by its length", () => {
  const st = core.initState(EDL, 1), edit = mkEdit();
  const r = core.dropPiece(edit, TR, st, "p2");
  assert.equal(core.reelLength(r.state), 20);
  assert.deepEqual(core.keptSpans(r.state), [[10, 20], [30, 40]]);
  const ws = r.edit.captions.flatMap((c) => c.words.map((w) => [w.text, w.t]));
  assert.deepEqual(ws, [["one", 1], ["two", 1.5], ["ing", 10.4], ["after", 13]], "'mid dle' and 'cross' started inside the dropped piece; 'ing' (12.4) moved up by 2 s");
  assert.ok(r.report.some((x) => /crossed this piece and was split/.test(x)));
  assert.deepEqual(r.edit.cards.map((c) => [c.text || c.src, c.start, c.end]), [["early", 3, 5], ["popups/a.png", 9, 11], ["late", 12, 14]], "the card that starts inside is gone; the one that straddles ends 2 s sooner");
  assert.deepEqual(r.edit.sfx_events.map((e) => e.t), [3, 13], "the sound at 10.4 is gone, the one at 15 moved to 13");
  assert.deepEqual(r.edit.punch, [[2, 1.025], [13, 1.04]], "the zoom point at 11 is gone");
  assert.deepEqual(r.transcript.map((w) => [w.text, w.start]), [["one", 1], ["after", 13]]);
  assert.equal(core.expectedText(r.transcript).trim(), "one after");
  assert.notDeepEqual(edit, r.edit, "the input is not changed in place");
  assert.equal(edit.cards.length, 4);
});

test("bare zoom numbers keep their in/out rhythm when one is removed", () => {
  const e = { captions: [], punch: [1, 11, 15], cards: [] }, st = core.initState(EDL, 1);
  const r = core.dropPiece(e, [], st, "p2", { zoomScale: 1.04 });
  assert.deepEqual(r.edit.punch, [[1, 1.04], [13, 1.04]], "the 3rd point was an 'in' (index 2), so it stays an 'in'");
});

test("drop then restore puts everything back (words, cards, sounds, transcript)", () => {
  const st = core.initState(EDL, 1), edit = mkEdit();
  for (const id of ["p1", "p2", "p3"]) {
    const d = core.dropPiece(edit, TR, st, id), r = core.restorePiece(d.edit, d.transcript, d.state, id);
    assert.deepEqual(r.transcript, TR, `${id}: transcript`);
    const flat = (e) => e.captions.flatMap((c) => c.words.map((w) => [w.text, w.t, w.accent]));
    assert.deepEqual(flat(r.edit).sort(), flat(edit).sort(), `${id}: caption words`);
    assert.deepEqual(r.edit.sfx_events, edit.sfx_events, `${id}: sounds`);
    const cards = (e) => e.cards.map((c) => [c.text || c.src, c.start, c.end]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    assert.deepEqual(cards(r.edit), cards(edit), `${id}: cards come back with their original start and end`);
    const caps = (e) => e.captions.map((c) => [c.start, c.end, c.words.map((w) => w.text).join(" ")]).sort((a, b) => a[0] - b[0] || String(a[2]).localeCompare(b[2]));
    // p2 and p3 each hold half of the caption "cross ing": it was split when the piece went, and comes back as two captions (the page says so)
    if (id === "p1") assert.deepEqual(caps(r.edit), caps(edit), `${id}: captions (start, end, words) come back as they were`);
    assert.deepEqual(r.state.pieces.map((p) => p.kept), [true, true, true]);
    assert.equal(core.reelLength(r.state), 22);
  }
});

test("can't drop the last piece, can't drop twice, restore of a kept piece fails", () => {
  const st = core.initState({ keep: [[0, 5], [6, 9]] }, 1);
  const d = core.dropPiece({ captions: [] }, [], st, "p1");
  assert.throws(() => core.dropPiece(d.edit, d.transcript, d.state, "p2"), /at least one piece/);
  assert.throws(() => core.dropPiece(d.edit, d.transcript, d.state, "p1"), /already dropped/);
  assert.throws(() => core.restorePiece(d.edit, d.transcript, d.state, "p2"), /already kept/);
});

test("edits are validated: caption words, card fields, times", () => {
  const edit = mkEdit(), o = { dur: 22 };
  const w = core.applyOp(edit, { op: "caption_word", ci: 0, wi: 1, text: "Two!", accent: false }, o);
  assert.equal(w.edit.captions[0].words[1].text, "Two!"); assert.equal(w.edit.captions[0].words[1].accent, false); assert.equal(w.info.before, "two");
  assert.throws(() => core.applyOp(edit, { op: "caption_word", ci: 0, wi: 0, text: "two words" }, o), /one word/);
  assert.throws(() => core.applyOp(edit, { op: "caption_word", ci: 9, wi: 0, text: "x" }, o), /no caption/);
  const c = core.applyOp(edit, { op: "card_set", i: 0, set: { layer: "behind", y: 300, off: true } }, o).edit.cards[0];
  assert.equal(c.layer, "behind"); assert.equal(c.y, 300); assert.equal(c.off, true);
  assert.throws(() => core.applyOp(edit, { op: "card_set", i: 0, set: { start: 5, end: 5.1 } }, o), /at least 0.3/);
  assert.throws(() => core.applyOp(edit, { op: "card_set", i: 0, set: { start: 99 } }, o), /0 to 22/);
  assert.throws(() => core.applyOp(edit, { op: "card_set", i: 0, set: { src: "x.png" } }, o), /can't be changed/);
  assert.throws(() => core.applyOp(edit, { op: "card_set", i: 0, set: { layer: "sideways" } }, o), /front, behind or both/);
  assert.throws(() => core.applyOp(edit, { op: "card_set", i: 2, set: { size: 5000 } }, o), /80 to 1000/);
  const add = core.applyOp(edit, { op: "card_add", card: { type: "tag", start: 1, text: "hi" } }, o);
  assert.equal(add.edit.cards[add.info.index].y, 130); assert.ok(add.edit.cards[add.info.index].id);
  assert.throws(() => core.applyOp(edit, { op: "card_add", card: { type: "popup", start: 1, src: "../../etc/passwd" } }, o), /upload/);
  assert.throws(() => core.applyOp(edit, { op: "card_add", card: { type: "block", start: 1 } }, o), /pills/);
  // 0.13.0: a popup can be a video clip. It opens top left and wider; "from" and "loop" are its own settings; the head ring refuses it.
  const clip = core.applyOp(edit, { op: "card_add", card: { type: "popup", start: 1, src: "popups/abc-screen.clip.mp4" } }, o);
  const ci = clip.info.index, cc = clip.edit.cards[ci]; assert.equal(cc.pos, "top-left"); assert.equal(cc.size, 440);
  const set = core.applyOp(clip.edit, { op: "card_set", i: ci, set: { from: "2.5", loop: true } }, o).edit.cards[ci];
  assert.equal(set.from, 2.5); assert.equal(set.loop, true);
  assert.throws(() => core.applyOp(clip.edit, { op: "card_set", i: ci, set: { from: -1 } }, o), /where the clip starts/);
  assert.throws(() => core.applyOp(edit, { op: "card_add", card: { type: "orbit", start: 1, src: ["popups/a.png", "popups/b.clip.mp4"] } }, o), /pictures, not video clips/);
  assert.equal(core.popupBox({ src: "popups/x.clip.mp4" }, 720, 1560).w, 440); assert.equal(core.popupBox({ src: "popups/x.png" }, 720, 1560).w, 360);
  const s = core.applyOp(edit, { op: "sfx_set", i: 0, set: { off: true, db: -10 } }, o).edit.sfx_events[0];
  assert.equal(s.off, true); assert.equal(s.db, -10);
  assert.equal(core.applyOp(edit, { op: "sfx_del", i: 0 }, o).edit.sfx_events.length, 2);
  assert.throws(() => core.applyOp(edit, { op: "nope" }, o), /unknown change/);
});

test("ids are added once and popup boxes match the build's arithmetic", () => {
  const e = mkEdit(); assert.equal(core.ensureIds(e), true);
  const ids = [...e.cards, ...e.sfx_events].map((x) => x.id); assert.equal(new Set(ids).size, ids.length);
  assert.equal(core.ensureIds(e), false);
  assert.deepEqual(core.popupBox({ size: 360, pos: "top-right" }, 600, 400), { left: 660, top: 150, w: 360, h: 240 });
  assert.deepEqual(core.popupBox({ size: 400, pos: "top-left" }, 100, 100), { left: 60, top: 150, w: 400, h: 400 });
  assert.deepEqual(core.popupBox({ size: 300, pos: "top-center" }, 100, 100), { left: 390, top: 150, w: 300, h: 300 });
  assert.deepEqual(core.popupBox({ size: 300, pos: "custom", x: 500, y: 700 }, 100, 100), { left: 350, top: 550, w: 300, h: 300 });
});

test("syncCheck compares caption times with a fresh transcript", () => {
  const caps = [{ words: [{ text: "Hello", t: 1 }, { text: "big", t: 1.5 }, { text: "world", t: 2 }] }];
  const heard = [{ text: "hello", start: 1.1 }, { text: "world.", start: 2.3 }];
  const r = core.syncCheck(caps, heard);
  assert.equal(r.n, 2); assert.equal(r.of, 3); assert.ok(r.max > 0.29 && r.max < 0.31);
});

// --------------------------------------------------------------------------------------------------------- build_reel.py
function makeReel(cards, brand = {}) {
  const dir = tmp("editor"), reel = path.join(dir, "reel"), home = path.join(dir, "home"), engine = path.join(dir, "engine");
  fs.mkdirSync(reel); fs.mkdirSync(home); fs.mkdirSync(path.join(engine, "sfx"), { recursive: true }); fs.mkdirSync(path.join(reel, "popups"));
  fs.writeFileSync(path.join(engine, "gsap.min.js"), "/* gsap stand-in for the test */");
  ff(["-f", "lavfi", "-i", "testsrc2=s=270x480:r=30:d=4", "-f", "lavfi", "-i", "sine=f=220:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(reel, "master.mp4")]);
  ff(["-f", "lavfi", "-i", "color=c=0xB9C8A5:s=200x100", "-frames:v", "1", path.join(reel, "popups", "pic.png")]);
  ff(["-f", "lavfi", "-t", "1", "-i", "testsrc2=s=120x120:r=10", "-vf", "split[a][b];[a]palettegen[p];[b][p]paletteuse", "-loop", "0", path.join(reel, "popups", "anim.gif")]);
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: { main: "#0d2b2d", pop: "#B9C8A5", light: "#f5f2ec" }, sfx: "none", ...brand }));
  fs.writeFileSync(path.join(reel, "edit.json"), JSON.stringify({ captions: [], punch: [], cards }));
  return { reel, env: { REELS_HOME: home, REEL_ENGINE: engine } };
}
const buildOf = (c) => { const r = py("build_reel.py", [c.reel], c.env); assert.equal(r.status, 0, r.stdout + r.stderr); return { r, html: fs.readFileSync(path.join(c.reel, "proj", "index.html"), "utf8") }; };

test("popup card: a picture lands in the middle by default, a GIF becomes a looped video, off leaves a card out", { skip: skipReason || (haveVp9 ? false : "ffmpeg has no libvpx-vp9") }, () => {
  const c = makeReel([
    { type: "popup", src: "popups/pic.png", start: 0.5, end: 3, size: 400 },
    { type: "popup", src: "popups/anim.gif", start: 1, end: 3, pos: "top-left", size: 300, rotate: 5 },
    { type: "popup", src: "popups/pic.png", start: 1, end: 2, pos: "custom", x: 540, y: 900, size: 200 },
    { type: "tag", text: "hidden pill", start: 1, end: 2, off: true },
    { type: "tag", text: "shown pill", start: 1, end: 2 },
  ]);
  const { html } = buildOf(c);
  assert.match(html, /id="k0" class="pop" style="left:340px;top:860px;width:400px;height:200px"><img src="img\/\d+_pic\.png"/, "0.16.0: 400 px wide in the middle of the screen");
  assert.match(html, /id="k1" class="pop" style="left:60px;top:150px;width:300px;height:300px"><video id="k1v" src="img\/\d+_anim\.webm"[^>]*data-start="1(\.0)?" data-duration="2(\.0)?"/);
  assert.match(html, /id="k2" class="pop" style="left:440px;top:850px;width:200px;height:100px"/, "custom: centre at 540,900");
  assert.doesNotMatch(html, /hidden pill/); assert.match(html, /shown pill/);
  const webm = path.join(c.reel, "proj", "img", fs.readdirSync(path.join(c.reel, "proj", "img")).find((f) => f.endsWith(".webm")));
  const p = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,duration:stream_tags=alpha_mode:format=duration", "-of", "json", webm]);
  const info = JSON.parse(p.stdout);
  assert.equal(info.streams[0].codec_name, "vp9");
  assert.ok(Number(info.format.duration) >= 2.4, "the 1 s GIF is looped to cover the 2 s popup");
});

test("a picture the build can't read is skipped with a warning, not a failed render", { skip: skipReason }, () => {
  const c = makeReel([{ type: "popup", src: "popups/bad.gif", start: 0.5, end: 2 }, { type: "tag", text: "still here", start: 1, end: 2 }]);
  fs.writeFileSync(path.join(c.reel, "popups", "bad.gif"), "GIF89a not really");
  const { r, html } = buildOf(c);
  assert.match(r.stdout, /warning: popup .*bad\.gif/);
  assert.doesNotMatch(html, /class="pop/); assert.match(html, /still here/);
});

test("brand.json text_default: tags without a height go above the head; text can default to behind the speaker", { skip: skipReason }, () => {
  let c = makeReel([{ type: "tag", text: "above", start: 0.5, end: 2 }, { type: "tag", text: "own y", start: 0.5, end: 2, y: 700 }], { text_default: { layer: "front", position: "above" } });
  let { html } = buildOf(c);
  assert.match(html, /class="tagw" style="top:130px"><span class="tag[^>]*>above</); assert.match(html, /style="top:700px"/);
  c = makeReel([{ type: "tag", text: "old default", start: 0.5, end: 2 }]);
  ({ html } = buildOf(c));
  assert.match(html, /class="tagw" style="top:300px"/, "without text_default the old default height is unchanged");
  c = makeReel([{ type: "tag", text: "back", start: 0.5, end: 2 }, { type: "tag", text: "front", start: 0.5, end: 2, layer: "front" }], { text_default: { layer: "behind", position: "above" } });
  const r = py("build_reel.py", [c.reel], { ...c.env, REEL_NO_CUTOUT: "1" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /card 0 at .*\(tag\): not layered behind the speaker/, "the default asked for behind: the build tried, and says it fell back");
  assert.doesNotMatch(r.stdout, /card 1 /, "a card that says front stays front");
});

// Added by By Mel Ross (0.5.2): the repo root is an ES module package, so review/core.js (a CommonJS/browser script) needs its own
// package.json to stay loadable with require(); without it review_sync.py export/import crashed in a full clone or plugin install.
test("review/core.js loads with require() from inside the repo", async () => {
  const { createRequire } = await import("node:module");
  const C = createRequire(import.meta.url)(path.join(review, "core.js"));
  for (const f of ["plan", "captions", "graphics", "hash"]) assert.equal(typeof C[f], "function", `core.js exports ${f}`);
});

test("the three pages share one step bar and one palette, and load nothing from the internet", () => {
  for (const f of ["reel-review.html", "thumbnail.html", "editor.html"]) {
    const html = fs.readFileSync(path.join(review, f), "utf8");
    assert.match(html, /class="steps"/, `${f}: step bar`);
    for (const k of ["review", "cover", "touchups"]) assert.ok(html.includes(`data-step="${k}"`), `${f}: step ${k}`);
    assert.ok(/#f5f2ec/i.test(html) && /#0d2b2d/i.test(html), `${f}: cream and teal`);
    assert.ok(!/ED84B0|FFF8FB/i.test(html), `${f}: no leftover pink`);
    // the one outside address is GIPHY, on the touch-ups page, and only when the person has set a key and presses Search
    const outside = (html.match(/https?:\/\/(?!127\.0\.0\.1|localhost)[a-z0-9.-]+\.(com|net|org)/gi) || []).filter((u) => !(f !== "thumbnail.html" && /^https:\/\/(api|developers)\.giphy\.com$/.test(u)));   // 0.10.2: the review page searches GIPHY too; 0.15.0: a link to where the key comes from
    assert.deepEqual(outside, [], `${f}: no outside address`);
  }
});

// ---------------------------------------------------------------------------------------------------------------- server
async function withServer(fn) {
  const dir = tmp("editorsrv"), home = path.join(dir, "reels"), reel = path.join(home, "r1");
  fs.mkdirSync(reel, { recursive: true });
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: {}, vocabulary: { terms: [], corrections: {} } }));
  fs.writeFileSync(path.join(reel, "edit.json"), JSON.stringify(mkEdit()));
  fs.writeFileSync(path.join(reel, "edl.json"), JSON.stringify(EDL));
  fs.writeFileSync(path.join(reel, "master_transcript.json"), JSON.stringify(TR));
  ff(["-f", "lavfi", "-i", "testsrc2=s=90x160:r=30:d=22", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(reel, "master.mp4")]);
  ff(["-f", "lavfi", "-i", "color=c=0xB9C8A5:s=200x100", "-frames:v", "1", path.join(dir, "pic.png")]);
  const port = 20000 + Math.floor(Math.random() * 20000);
  const p = spawn("node", [path.join(review, "editor-server.mjs"), reel, "--lan", "--port", String(port)], { env: { ...process.env, REELS_HOME: home }, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
  for (let i = 0; i < 60 && !/\?k=/.test(out); i++) await new Promise((r) => setTimeout(r, 100));
  const key = /\?k=([\w-]+)/.exec(out)?.[1];
  assert.ok(key, "server started: " + out);
  const base = `http://127.0.0.1:${port}`, cookie = `rk=${key}`;
  const get = (u, o = {}) => fetch(base + u, { ...o, headers: { cookie, ...(o.headers || {}) } });
  const post = async (u, body, raw) => (await get(u, { method: "POST", body: raw ?? JSON.stringify(body || {}), headers: raw ? {} : { "content-type": "application/json" } })).json();
  try { await fn({ base, key, reel, home, dir, get, post }); } finally { p.kill(); }
}

// Added by By Mel Ross (0.14.0): the receipt and the timeline.
test("receipt: counts cuts, speed, captions, each kind of graphic and sounds from the reel's own data", () => {
  const state = { speed: 1.1, xfade: 0, pieces: [{ id: "p1", a: 0.5, b: 4, kept: true }, { id: "p2", a: 5, b: 9, kept: false }, { id: "p3", a: 9.5, b: 12, kept: true }] };
  const edit = { captions: [{ words: [{ text: "a", t: 0 }, { text: "b", t: 1, accent: true }] }, { words: [{ text: "c", t: 2 }] }], punch: [1],
    cards: [{ type: "title", start: 0 }, { type: "card", start: 1 }, { type: "card", start: 2 }, { type: "tag", start: 3, off: true },
            { type: "popup", src: "popups/a.gif", start: 1 }, { type: "popup", src: "popups/b.clip.mp4", start: 2 }, { type: "popup", src: "popups/c.png", start: 3 }],
    sfx_events: [{ name: "pop", t: 1 }, { name: "pop", t: 2, off: true }] };
  const r = Object.fromEntries(core.receipt({ state, edit, srcDur: 14, themeName: "Bold" }).map((l) => [l.id, l.text]));
  assert.equal(r.cuts, "Cut 3 stretches, 8 seconds removed (14 s filmed, 5.5 s in the reel)", "the start, the dropped middle and the end");
  assert.equal(r.dropped, "1 piece switched off on this page"); assert.equal(r.speed, "Voice sped up to 1.1x");
  assert.equal(r.captions, "Captions on: 3 words in 2 lines, 1 highlighted");
  assert.equal(r.graphics, "6 graphics: 1 title, 2 lists, 1 GIF, 1 video clip, 1 picture popup", "switched-off graphics are not counted");
  assert.equal(r.sounds, "1 sound effect"); assert.equal(r.zooms, "1 slow zoom"); assert.equal(r.look, "Bold theme");
  const plain = Object.fromEntries(core.receipt({ state: { speed: 1, pieces: [{ id: "p1", a: 0, b: 12, kept: true }] }, edit: {}, srcDur: null }).map((l) => [l.id, l.text]));
  assert.deepEqual(plain, { cuts: "Nothing cut (12 seconds)", speed: "Voice at normal speed", captions: "No captions", graphics: "No graphics", sounds: "No sound effects" });
});

test("timeline: the page has the strip, the lanes and the receipt panel", () => {
  const html = fs.readFileSync(path.join(review, "editor.html"), "utf8");
  for (const need of ['id="tli"', 'id="receipt"', "/api/strip.jpg?v=", "/api/wave.png?v=", 'class="mk cap"', "cutmark", "const PX = 56"]) assert.ok(html.includes(need), need);
});

test("server: needs the key, saves edits with a backup, undo restores, drop retimes edl.json", { skip: skipReason }, async () => {
  await withServer(async ({ base, reel, home, get, post }) => {
    assert.equal((await fetch(base + "/api/state")).status, 403, "no key, no page");
    assert.equal((await fetch(base + "/files/edit.json")).status, 403);
    const st = await (await get("/api/state")).json();
    assert.equal(st.total, 22); assert.equal(st.pieces.length, 3); assert.equal(st.canUndo, false);
    assert.ok(st.edit.cards.every((c) => c.id), "cards get ids");
    assert.ok(fs.existsSync(path.join(reel, "editor", "edit.json.before-editor")), "the file as it was is kept once");

    let r = await post("/api/op", { op: { op: "caption_word", ci: 0, wi: 0, text: "Won", always: true } });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(JSON.parse(fs.readFileSync(path.join(reel, "edit.json"))).captions[0].words[0].text, "Won");
    assert.equal(JSON.parse(fs.readFileSync(path.join(home, "brand.json"))).vocabulary.corrections.one, "Won", "'always fix' lands in brand.json");
    assert.equal(r.state.canUndo, true); assert.equal(r.state.dirty, true);
    r = await post("/api/undo");
    assert.equal(JSON.parse(fs.readFileSync(path.join(reel, "edit.json"))).captions[0].words[0].text, "one");
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, "brand.json"))).vocabulary.corrections, {}, "undo puts brand.json back too");

    r = await post("/api/op", { op: { op: "piece", id: "p2", kept: false } });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(reel, "edl.json"))).keep, [[10, 20], [30, 40]]);
    assert.equal(r.state.total, 20); assert.equal(r.state.cutsStale, true);
    assert.equal(fs.readFileSync(path.join(reel, "expected.txt"), "utf8").trim(), "one after");
    r = await post("/api/undo");
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(reel, "edl.json"))).keep, EDL.keep);
    assert.equal(r.state.cutsStale, false);
    assert.equal((await post("/api/op", { op: { op: "piece", id: "p1", kept: false } })).ok, true);
    assert.equal((await post("/api/op", { op: { op: "piece", id: "p3", kept: false } })).ok, true);
    r = await post("/api/op", { op: { op: "piece", id: "p2", kept: false } });
    assert.equal(r.ok, false); assert.match(r.error, /at least one piece/);
    assert.equal((await post("/api/op", { op: { op: "card_set", i: 0, set: { layer: "nope" } } })).ok, false);
  });
});

test("server: uploads a picture into popups/, refuses other files, serves reel files but never the history", { skip: skipReason }, async () => {
  await withServer(async ({ reel, dir, get, post }) => {
    const buf = fs.readFileSync(path.join(dir, "pic.png"));
    const up = await post("/api/upload?name=" + encodeURIComponent("My pic!.png"), null, buf);
    assert.equal(up.ok, true, JSON.stringify(up));
    assert.match(up.upload.src, /^popups\/[\w-]+-My-pic\.png$/); assert.equal(up.upload.w, 200);
    assert.ok(fs.existsSync(path.join(reel, up.upload.src)));
    const bad = await post("/api/upload?name=evil.exe", null, Buffer.from("MZ"));
    assert.equal(bad.ok, false);
    const notPic = await post("/api/upload?name=fake.png", null, Buffer.from("not a picture"));
    assert.equal(notPic.ok, false); assert.match(notPic.error, /not a picture/);
    // 0.14.0: the state carries the receipt; the timeline's pictures are 404 until there is a render to draw them from.
    const st14 = await (await get("/api/state")).json();
    assert.ok(Array.isArray(st14.receipt) && st14.receipt.some((l) => l.id === "cuts"), JSON.stringify(st14.receipt));
    if (!st14.renders.length) { assert.equal((await get("/api/strip.jpg?v=0")).status, 404); assert.equal((await get("/api/wave.png?v=0")).status, 404); }
    fs.mkdirSync(path.join(reel, "renders"), { recursive: true });       // a 3 s render to draw from
    ff(["-f", "lavfi", "-i", "testsrc2=s=270x480:r=30:d=3", "-f", "lavfi", "-i", "sine=f=330:d=3", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(reel, "renders", "v009-phone.mp4")]);
    fs.writeFileSync(path.join(reel, "renders", "v009.json"), JSON.stringify({ v: 9, phone: "renders/v009-phone.mp4", full: "renders/v009-phone.mp4" }));
    const strip = await get("/api/strip.jpg?v=9"), wave = await get("/api/wave.png?v=9");
    assert.equal(strip.status, 200); assert.equal(strip.headers.get("content-type"), "image/jpeg"); assert.equal(wave.status, 200); assert.equal(wave.headers.get("content-type"), "image/png");
    const dims = (f) => run("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", path.join(reel, "editor", "timeline", f)]).stdout.trim();
    assert.equal(dims("v9-strip.jpg"), "180,64", "5 frames of 36 x 64 for 3 seconds at 56 px a second"); assert.equal(dims("v9-wave.png"), "168,48");
    fs.rmSync(path.join(reel, "renders", "v009.json")); fs.rmSync(path.join(reel, "renders", "v009-phone.mp4"));
    // 0.13.0: a video clip uploads too. The page gets a small silent copy; the original is kept aside.
    const movFile = path.join(reel, "..", "take.mov");
    ff(["-f", "lavfi", "-i", "testsrc2=s=320x568:r=60:d=2", "-f", "lavfi", "-i", "sine=f=330:d=2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-f", "mov", movFile]);
    const vid = await post("/api/upload?name=My%20Screen.MOV", null, fs.readFileSync(movFile));
    assert.equal(vid.ok, true, JSON.stringify(vid)); assert.match(vid.upload.src, /^popups\/[a-z0-9]+-My-Screen\.clip\.mp4$/); assert.equal(vid.upload.video, true);
    assert.equal(fs.readdirSync(path.join(reel, "popups", "originals")).filter((n) => /My-Screen\.mov$/.test(n)).length, 1, "the original is kept");
    const vinfo = run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,r_frame_rate", "-of", "csv=p=0", path.join(reel, vid.upload.src)]).stdout.trim();
    assert.equal(vinfo, "video,30/1", "30 fps and no sound: " + vinfo);
    assert.equal(vid.state.popups.find((p) => p.src === vid.upload.src).video, true);
    const notVid = await post("/api/upload?name=fake.mp4", null, Buffer.from("not a video")); assert.equal(notVid.ok, false); assert.match(notVid.error, /could not be read/);
    const add = await post("/api/op", { op: { op: "card_add", card: { type: "popup", src: up.upload.src, start: 2 } } });
    assert.equal(add.ok, true, JSON.stringify(add));
    assert.equal((await get("/files/" + up.upload.src)).status, 200);
    await post("/api/op", { op: { op: "card_set", i: 0, set: { off: true } } });
    assert.equal((await get("/files/editor/history/x")).status, 403);
    assert.equal((await get("/api/job").then((r) => r.json())).job.state, "idle");
  });
});

// Added by By Mel Ross (0.6.0): one link for the review page and the touch-ups page.
test("studio server: an unbuilt reel opens on the review page, saves decisions, and says touch-ups are not ready", { skip: skipReason }, async () => {
  const dir = tmp("studio"), home = path.join(dir, "reels"), reel = path.join(home, "r1");
  fs.mkdirSync(path.join(reel, "review_db", "reel"), { recursive: true });
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: {} }));
  fs.writeFileSync(path.join(reel, "review_db", "reel", "current.json"), JSON.stringify({ title: "t", words: [] }));
  const port = 4900 + Math.floor(Math.random() * 500);
  const p = spawn("node", [path.join(review, "studio-server.mjs"), reel, "--port", String(port)], { env: { ...process.env, REELS_HOME: home }, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
  for (let i = 0; i < 60 && !/Reel Studio for/.test(out); i++) await new Promise((r) => setTimeout(r, 100));
  const base = `http://127.0.0.1:${port}`;
  try {
    const home0 = await fetch(base + "/", { redirect: "manual" });
    assert.equal(home0.status, 302); assert.equal(home0.headers.get("location"), "/review");
    const page = await (await fetch(base + "/review")).text();
    assert.ok(page.includes("shim.js") && page.includes("REEL_STUDIO_LINKS") && page.includes('"/touchups"'), "review page gets the storage shim and the step links");
    assert.deepEqual(await (await fetch(base + "/api/stage")).json(), { reel: "r1", built: false, review: true });
    const st = await (await fetch(base + "/api/state")).json();
    assert.equal(st.built, false); assert.equal(st.links.review, "/review");
    assert.equal((await fetch(base + "/api/render", { method: "POST" })).status, 409, "nothing to render yet");
    assert.equal((await fetch(base + "/db/review/current")).status, 204, "no decisions yet");
    assert.equal((await fetch(base + "/db/review/current", { method: "PUT", body: JSON.stringify({ cut: [1, 2] }) })).status, 204);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(reel, "review_db", "review", "current.json"), "utf8")), { cut: [1, 2] });
    assert.equal((await fetch(base + "/db/reel/current", { method: "PUT", body: "{}" })).status, 403, "the page cannot rewrite the reel data");
    assert.equal((await fetch(base + "/files/review_db/reel/current.json")).status, 403, "review data is only served through /db");
    assert.ok(!fs.existsSync(path.join(reel, "editor")), "an unbuilt reel gets no editor folder");
    // Added by By Mel Ross (0.8.1): another website open in the same browser cannot change or read this reel
    const from = (h) => ({ method: "POST", headers: h, body: "{}" });
    assert.equal((await fetch(base + "/api/render", from({ Origin: "https://evil.example" }))).status, 403, "a post from another site is refused");
    assert.equal((await fetch(base + "/api/render", from({ "Sec-Fetch-Site": "cross-site" }))).status, 403);
    assert.equal((await fetch(base + "/db/review/current", { method: "PUT", headers: { Origin: "null" }, body: "{}" })).status, 403);
    assert.equal((await fetch(base + "/api/render", from({ Origin: base }))).status, 409, "the page's own post gets through (and finds nothing to render yet)");
    const raw = await new Promise((resolve) => { const r = http.request({ host: "127.0.0.1", port, path: "/api/state", headers: { Host: `evil.example:${port}` } }, (x) => resolve(x.statusCode)); r.end(); });
    assert.equal(raw, 403, "a request addressed to another name is refused");

    // the reel gets built while the server is running: the same link now opens touch-ups
    fs.writeFileSync(path.join(reel, "edit.json"), JSON.stringify(mkEdit()));
    fs.writeFileSync(path.join(reel, "edl.json"), JSON.stringify(EDL));
    fs.writeFileSync(path.join(reel, "master_transcript.json"), JSON.stringify(TR));
    const built = await fetch(base + "/", { redirect: "manual" });
    assert.equal(built.status, 200); assert.match(await built.text(), /Touch-ups/);
    const st2 = await (await fetch(base + "/api/state")).json();
    assert.equal(st2.built, true); assert.equal(st2.pieces.length, 3);
    assert.equal((await (await fetch(base + "/api/stage")).json()).built, true);
  } finally { p.kill(); }
});

// Added by By Mel Ross (0.9.0): the touch-ups page can add pictures that circle the head, pick a theme, and search GIPHY.
test("orbit card from the page: 1 to 6 uploaded pictures, a ring level and a lap time", () => {
  const edit = mkEdit(), o = { dur: 22 };
  const add = core.applyOp(edit, { op: "card_add", card: { type: "orbit", start: 2, src: ["popups/a.png", "popups/b.gif"] } }, o);
  const c = add.edit.cards[add.info.index];
  assert.deepEqual({ type: c.type, start: c.start, end: c.end, level: c.level, period: c.period, src: c.src }, { type: "orbit", start: 2, end: 8, level: "crown", period: 4, src: ["popups/a.png", "popups/b.gif"] });
  const set = core.applyOp(add.edit, { op: "card_set", i: add.info.index, set: { level: "chest", period: "6", size: "200" } }, o).edit.cards[add.info.index];
  assert.deepEqual([set.level, set.period, set.size], ["chest", 6, 200]);
  assert.throws(() => core.applyOp(edit, { op: "card_add", card: { type: "orbit", start: 2, src: [] } }, o), /1 to 6/);
  assert.throws(() => core.applyOp(edit, { op: "card_add", card: { type: "orbit", start: 2, src: Array(7).fill("popups/a.png") } }, o), /1 to 6/);
  assert.throws(() => core.applyOp(edit, { op: "card_add", card: { type: "orbit", start: 2, src: ["../secret.png"] } }, o), /upload/);
  assert.throws(() => core.applyOp(add.edit, { op: "card_set", i: add.info.index, set: { level: "knees" } }, o), /crown/);
  assert.throws(() => core.applyOp(add.edit, { op: "card_set", i: add.info.index, set: { period: 0.2 } }, o), /1.5 to 12/);
});

test("server: lists the themes, sets one for this reel or every reel, and keeps GIPHY off without a key", { skip: skipReason }, async () => {
  await withServer(async ({ reel, home, get, post }) => {
    const st = await (await get("/api/state")).json();
    assert.deepEqual(st.themes.map((t) => t.id).sort(), ["bold", "editorial", "handwritten", "whimsical"]);
    assert.ok(st.themes.every((t) => t.name && t.summary));
    assert.deepEqual(st.theme, { reel: null, all: null });
    let r = await post("/api/theme", { name: "bold", scope: "reel" });
    assert.equal(r.ok, true); assert.deepEqual(r.state.theme, { reel: "bold", all: null }); assert.equal(r.state.dirty, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(reel, "edit.json"), "utf8")).theme, "bold");
    r = await post("/api/theme", { name: "whimsical", scope: "all" });
    assert.deepEqual(r.state.theme, { reel: null, all: "whimsical" });
    assert.equal(JSON.parse(fs.readFileSync(path.join(home, "brand.json"), "utf8")).theme, "whimsical");
    r = await post("/api/theme", { name: "", scope: "reel" });
    assert.equal(JSON.parse(fs.readFileSync(path.join(reel, "edit.json"), "utf8")).theme, "none", "this reel keeps the plain brand even though every reel has a theme");
    assert.equal((await post("/api/theme", { name: "../../x", scope: "all" })).ok, false);
    await post("/api/undo"); await post("/api/undo");
    assert.equal(JSON.parse(fs.readFileSync(path.join(home, "brand.json"), "utf8")).theme, undefined, "undo takes the brand-wide theme back too");
    assert.equal(st.giphy, false);
    assert.equal((await get("/api/giphy-key")).status, 404);
    const g = await post("/api/giphy-add", { id: "abc123XYZ" });
    assert.equal(g.ok, false); assert.match(g.error, /no GIPHY key/);
  });
});
