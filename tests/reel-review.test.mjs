// Added by By Mel Ross (0.9.0). The review step end to end without a browser: export the page's data, import the decisions into
// edit.json + edl.json, and rebuild from the review page without losing what was done on the touch-ups page.
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { ff, py, skill, skipReason, tmp } from "./reel-helpers.mjs";
import * as core from "../skills/3-editing/reel-editor/review/editor-core.mjs";

const NAMES = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda", "mu"];
const read = (...p) => JSON.parse(fs.readFileSync(path.join(...p), "utf8"));
const write = (o, ...p) => fs.writeFileSync(path.join(...p), JSON.stringify(o));

function makeReel() {
  const dir = tmp("review"), home = path.join(dir, "reels"), reel = path.join(home, "r1");
  fs.mkdirSync(reel, { recursive: true });
  write({ name: "Test", speed: 1, colors: { main: "#112233", pop: "#aabbcc", light: "#ffffff" }, captions: { mode: "word", size: 90 } }, home, "brand.json");
  ff(["-f", "lavfi", "-i", "testsrc2=s=90x160:r=30:d=19", "-f", "lavfi", "-i", "sine=f=220:d=19", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(reel, "raw.mp4")]);
  ff(["-i", path.join(reel, "raw.mp4"), "-ac", "1", "-ar", "48000", path.join(reel, "voice.wav")]);
  write(NAMES.map((text, i) => ({ text, start: i * 1.5 + 0.2, end: i * 1.5 + 0.6 })), reel, "transcript.json");   // a word every 1.5 s: every gap is a pause, so every word is its own piece
  write({ title: "Test reel", proposedCut: [[0, 19]], accentWords: [],
    cards: [{ id: "g1", type: "tag", kind: "Pill", what: "Pill: hello", text: "hello", anchor: "gamma", after: 0, place: [240, 130, 600, 110] }] }, reel, "proposal.json");
  const env = { REELS_HOME: home };
  const out = path.join(dir, "out");
  const ex = py("review_sync.py", ["export", reel, path.join(reel, "proposal.json"), out], env);
  assert.equal(ex.status, 0, ex.stdout + ex.stderr);
  const decisions = path.join(reel, "review_db", "review", "current.json");
  fs.mkdirSync(path.dirname(decisions), { recursive: true });
  const imp = (d) => { if (d) write(d, decisions); const r = py("review_sync.py", ["import", reel, decisions], env); assert.equal(r.status, 0, r.stdout + r.stderr); return r.stdout; };
  return { reel, home, out, decisions, imp, env };
}
const wordsOf = (edit) => edit.captions.flatMap((c) => c.words);
const at = (edit, text) => wordsOf(edit).find((w) => w.text.toLowerCase() === text.toLowerCase())?.t;

test("export writes what the page needs: words, a proposed cut, captions, the graphics board and the themes", { skip: skipReason }, () => {
  const c = makeReel();
  const r = read(c.reel, "review_reel.json");
  assert.equal(r.title, "Test reel"); assert.equal(r.words.length, 12); assert.equal(r.speed, 1);
  assert.deepEqual(r.words[2], { text: "gamma", s: 3.2, e: 3.6 });
  assert.equal(r.board.length, 1); assert.equal(r.board[0].id, "g1");
  assert.deepEqual(r.themes.map((t) => t.id).sort(), ["bold", "editorial", "handwritten", "whimsical"]);
  assert.equal(r.theme, "", "no theme set in this brand");
  assert.ok(fs.existsSync(path.join(c.out, "reel.json")));
  assert.deepEqual(r.board[0].sfx, { name: "pop", db: -14 }, "0.16.0: a graphic with no sound named gets the sound the build plays for its type, so the page can list it");
});

test("import turns decisions into edit.json and edl.json: cut words leave the captions, a graphic follows its word, a theme is recorded", { skip: skipReason }, () => {
  const c = makeReel();
  c.imp();
  let edit = read(c.reel, "edit.json"), edl = read(c.reel, "edl.json");
  assert.equal(wordsOf(edit).length, 12); assert.equal(edl.keep.length, 12);
  assert.equal(edit.cards.length, 1); assert.equal(edit.cards[0].id, "g1");
  assert.ok(Math.abs(edit.cards[0].start - at(edit, "gamma")) < 0.2, "the pill starts on its word");
  assert.equal(edit.theme, undefined);
  const out = c.imp({ cut: [0, 1], theme: "bold" });
  edit = read(c.reel, "edit.json"); edl = read(c.reel, "edl.json");
  assert.deepEqual(wordsOf(edit).map((w) => w.text).slice(0, 2), ["gamma", "delta"]);
  assert.equal(edl.keep.length, 10); assert.equal(edit.theme, "bold");
  assert.ok(at(edit, "gamma") < 0.2, "the reel now starts on gamma");
  assert.match(out, /10 captions|captions/);
  c.imp({ cut: [2] });
  edit = read(c.reel, "edit.json");
  assert.ok(Math.abs(edit.cards[0].start - at(edit, "delta")) < 0.2, "a graphic whose word is cut moves to the next kept word");
  c.imp({ cut: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] });
  assert.equal(read(c.reel, "edit.json").cards.length, 0, "with nothing kept after it, the graphic is left out");
});

test("rebuilding from the review page keeps touch-ups: added text and sounds, a fixed word, a changed graphic and a dropped piece", { skip: skipReason }, () => {
  const c = makeReel();
  c.imp();
  // ---- what the touch-ups page would do (same functions the page's server calls)
  let edit = read(c.reel, "edit.json"); const edl = read(c.reel, "edl.json");
  core.ensureIds(edit);
  let state = core.initState(edl, 1);
  const o = { dur: core.reelLength(state) };
  const ci = edit.captions.findIndex((x) => x.words.some((w) => w.text === "delta")), wi = edit.captions[ci].words.findIndex((w) => w.text === "delta");
  edit = core.applyOp(edit, { op: "caption_word", ci, wi, text: "DELTA", accent: true }, o).edit;
  edit = core.applyOp(edit, { op: "card_add", card: { type: "tag", text: "note", start: at(edit, "theta"), end: at(edit, "theta") + 1.5 } }, o).edit;
  edit = core.applyOp(edit, { op: "sfx_add", event: { name: "pop-soft", t: at(edit, "iota"), db: -12 } }, o).edit;
  edit = core.applyOp(edit, { op: "card_set", i: edit.cards.findIndex((x) => x.id === "g1"), set: { y: 300 } }, o).edit;
  const beta = core.layout(state).find((L) => L.a <= 1.7 && L.b >= 2.1);
  const dropped = core.dropPiece(edit, [], state, beta.id);
  edit = dropped.edit; state = dropped.state; edit.cutout = { matte: "matte.mkv" };                  // and one thing set by hand
  write(edit, c.reel, "edit.json"); write({ ...edl, keep: core.keptSpans(state) }, c.reel, "edl.json");
  fs.mkdirSync(path.join(c.reel, "editor"), { recursive: true }); write(state, c.reel, "editor", "state.json");
  assert.equal(at(edit, "beta"), undefined, "beta's piece is dropped");

  // ---- back on the review page: alpha is cut too, then the reel is rebuilt
  const out = c.imp({ cut: [0] });
  const fresh = read(c.reel, "edit.json");
  assert.deepEqual(wordsOf(fresh).map((w) => w.text).slice(0, 3), ["gamma", "DELTA", "epsilon"], "alpha cut on the review page, beta dropped on the touch-ups page, delta still fixed");
  assert.equal(wordsOf(fresh).find((w) => w.text === "DELTA").accent, true);
  const note = fresh.cards.find((x) => x.text === "note");
  assert.ok(note, "the added text is still there");
  assert.ok(Math.abs(note.start - at(fresh, "theta")) < 0.05, `it moved with its word (${note.start} vs ${at(fresh, "theta")})`);
  assert.ok(Math.abs(note.end - note.start - 1.5) < 0.05, "and kept its length");
  assert.equal(fresh.cards.find((x) => x.id === "g1").y, 300, "the change to the review graphic is kept");
  assert.equal(fresh.sfx_events.length, 1); assert.ok(Math.abs(fresh.sfx_events[0].t - at(fresh, "iota")) < 0.05); assert.equal(fresh.sfx_events[0].db, -12);
  assert.deepEqual(fresh.cutout, { matte: "matte.mkv" });
  assert.deepEqual(read(c.decisions).cut, [0, 1], "the dropped piece shows as a cut word on the review page");
  assert.match(out, /TOUCH-UP KEPT: tag "note"/); assert.match(out, /TOUCH-UP KEPT: 1 caption word fix/); assert.match(out, /1 dropped piece/);
  assert.doesNotMatch(out, /NOT KEPT/);
  assert.ok(fs.existsSync(path.join(c.reel, "editor", "pre-import", "edit.json")), "the edit as it was is kept aside");

  // ---- a second rebuild carries the same touch-ups again, and says so when a moment is gone
  const out2 = c.imp({ cut: [0, 1, 7] });                                                               // theta is cut now
  const again = read(c.reel, "edit.json");
  assert.equal(again.cards.find((x) => x.text === "note"), undefined);
  assert.match(out2, /TOUCH-UP NOT KEPT \(tell them\): tag "note": the moment it sat on is cut now/);
  assert.equal(wordsOf(again).find((w) => w.text === "DELTA").accent, true, "the word fix survives a second rebuild");
  assert.equal(again.cards.find((x) => x.id === "g1").y, 300);
  assert.equal(again.sfx_events.length, 1);
});

test("a first import, or a reel from before this version, has nothing to carry and says nothing about touch-ups", { skip: skipReason }, () => {
  const c = makeReel();
  const out = c.imp();
  assert.doesNotMatch(out, /TOUCH-UP/);
  assert.ok(fs.existsSync(path.join(c.reel, "editor", "import-base.json")));
});

test("an older reel that was touched up before touch-ups carried over: the import says so and keeps a copy", { skip: skipReason }, () => {
  const c = makeReel();
  c.imp();
  fs.rmSync(path.join(c.reel, "editor", "import-base.json"));                    // as a reel imported before 0.9.0 looks
  fs.writeFileSync(path.join(c.reel, "editor", "state.json"), JSON.stringify({ pieces: [] }));   // the touch-ups page was used
  const edit = read(c.reel, "edit.json"); edit.cards.push({ id: "mine", type: "tag", text: "added by hand", start: 0.2, end: 1 });
  fs.writeFileSync(path.join(c.reel, "edit.json"), JSON.stringify(edit));
  const out = c.imp();
  assert.match(out, /TOUCH-UP NOT KEPT \(tell them\): this reel was built before/);
  const saved = JSON.parse(fs.readFileSync(path.join(c.reel, "editor", "pre-import", "edit.json"), "utf8"));
  assert.ok(saved.cards.some((x) => x.id === "mine"), "the edit as it was is saved");
  assert.doesNotMatch(c.imp(), /TOUCH-UP/, "the next import has a base to compare with");
});

test("graphics asked for on the review page reach the import as plain instructions, and change the build fingerprint", { skip: skipReason }, () => {
  const c = makeReel();
  const out = c.imp({ amount: "lots", wanted: [{ id: "w1", kind: "carousel", ci: 0, word: 0, line: "word0 word1", note: "my 3 screenshots" }, { id: "w2", kind: "choose", ci: 1, line: "word5", note: "" }] });
  assert.match(out, /GRAPHICS AMOUNT: busy \(about 1 every 2-4 s\) for this reel/);
  assert.match(out, /GRAPHIC WANTED: motion carousel-\* at the line "word0 word1": my 3 screenshots\. Add it to edit\.json/);
  assert.match(out, /GRAPHIC WANTED: your choice of card at the line "word5"\. Add it/);
  // 0.16.0: where they put it travels with the request; once Claude has added it to the plan it is marked done and not asked again
  const placed = c.imp({ wanted: [{ id: "w1", kind: "photo", line: "word0", where: "center", layer: "behind" }, { id: "w2", kind: "choose", line: "word5" }], board: { g1: { where: "lower", layer: "behind" } } });
  assert.match(placed, /GRAPHIC WANTED: image, shot or popup at the line "word0" Put it in the middle of the screen[^.]*\. Layer: behind the speaker\./);
  assert.match(placed, /wanted-done <reel> w1/); assert.match(placed, /PLACE IT \(set this card's position in edit\.json before the render\): g1 \(tag\) @ cut [\d.]+s: the bottom, in the lower third/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(c.reel, "edit.json"), "utf8")).cards.find((x) => x.id === "g1").layer, "behind");
  const done = py("review_sync.py", ["wanted-done", c.reel, "w1"], c.env); assert.equal(done.status, 0, done.stderr); assert.match(done.stdout, /1 asked-for graphic/);
  const after = c.imp(); assert.doesNotMatch(after, /at the line "word0"/); assert.match(after, /at the line "word5"/);
  assert.doesNotMatch(c.imp({}), /GRAPHIC|GRAPHICS AMOUNT/, "nothing asked, nothing printed");
  const core = createRequire(import.meta.url)(path.join(skill, "review", "core.js"));
  assert.equal(core.hash({}), core.hash({ wanted: [], amount: null }), "older fingerprints still match");
  assert.notEqual(core.hash({}), core.hash({ amount: "lots" })); assert.notEqual(core.hash({}), core.hash({ wanted: [{ id: "w1" }] }));
  assert.equal(JSON.parse(fs.readFileSync(path.join(c.out, "reel.json"), "utf8")).graphicsAmount, "some", "the dial starts at the brand's setting");
});

// 0.18.0: the Build preview button starts the build from the page. The cut, the render and the checks are stand-ins here
// (a real render needs Chrome and minutes); the import is the real one.
test("review page: Build preview imports the choices, runs the build steps, and writes the preview the page shows", { skip: skipReason }, async () => {
  const c = makeReel();
  fs.cpSync(path.join(c.out, "reel.json"), path.join(c.reel, "review_db", "reel", "current.json"), { recursive: true });
  write({ board: { g1: { state: "c", note: "make it pink" } }, wanted: [{ id: "w1", kind: "list", line: "alpha", note: "my 3 tools" }], notes: { cuts: "tighter please" } }, c.decisions);
  const stub = path.join(tmp("stubscripts"), "scripts"); fs.cpSync(path.join(skill, "scripts"), stub, { recursive: true }); fs.cpSync(path.join(skill, "review"), path.join(stub, "..", "review"), { recursive: true });   // the import reads ../review/core.js
  fs.writeFileSync(path.join(stub, "cut.py"), 'import shutil, sys\nfrom pathlib import Path\nr = Path(sys.argv[1]); shutil.copy(r / "raw.mp4", r / "master.mp4"); print("cut ok")\n');
  fs.writeFileSync(path.join(stub, "render.sh"), '#!/bin/bash\ncp "$1/master.mp4" "$1/final.mp4"\necho "note: stand-in render"\n');
  fs.writeFileSync(path.join(stub, "qa.py"), 'print("PASS (stand-in)")\n');
  const port = 7300 + Math.floor(Math.random() * 500), base = `http://127.0.0.1:${port}`;
  const p = spawn("node", [path.join(skill, "review", "studio-server.mjs"), c.reel, "--port", String(port)], { env: { ...process.env, REELS_HOME: c.home, REEL_EDITOR_SCRIPTS: stub, GIPHY_API_KEY: "" }, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
  for (let i = 0; i < 100 && !/Reel Studio for/.test(out); i++) await new Promise((r) => setTimeout(r, 100));
  try {
    assert.match(out, /Reel Studio for/, out);
    fs.rmSync(path.join(c.reel, "edit.json"), { force: true }); fs.rmSync(path.join(c.reel, "edl.json"), { force: true });   // never built
    assert.equal((await (await fetch(base + "/api/review-build")).json()).build.state, "idle");
    assert.equal((await fetch(base + "/api/review-build", { method: "POST", headers: { origin: "https://example.test", "sec-fetch-site": "cross-site" } })).status, 403, "another site can't start a build");
    const go = await (await fetch(base + "/api/review-build", { method: "POST" })).json(); assert.equal(go.ok, true, JSON.stringify(go));
    assert.equal((await fetch(base + "/api/review-build", { method: "POST" })).status, 400, "one build at a time");
    let j; for (let k = 0; k < 240; k++) { await new Promise((r) => setTimeout(r, 250)); j = await (await fetch(base + "/api/review-build")).json(); if (["done", "failed"].includes(j.build.state)) break; }
    assert.equal(j.build.state, "done", JSON.stringify(j) + out);
    assert.ok(j.build.told.some((l) => /^CHANGE REQUESTED: g1/.test(l)) && j.build.told.some((l) => /^GRAPHIC WANTED/.test(l)) && j.build.told.some((l) => /^NOTE/.test(l)), "what only Claude can do is handed back to the page: " + j.build.told.join(" | "));
    const latest = read(c.reel, "review_db", "builds", "latest.json"), edit = read(c.reel, "edit.json");
    assert.equal(latest.hash, edit.hash, "the page can tell the preview matches the choices"); assert.match(latest.url, /^\/files\/renders\/v001-phone\.mp4$/);
    assert.equal((await fetch(base + latest.url)).status, 200);
    assert.ok(fs.existsSync(path.join(c.reel, "final.mp4")) && fs.existsSync(path.join(c.reel, "edl.json")));
  } finally { p.kill(); }
  const rv = fs.readFileSync(path.join(skill, "review", "reel-review.html"), "utf8");
  for (const t of ["Build now without those", "I'll tell Claude", "/api/review-build", "function needsClaude", "Step 2 of 4"]) assert.ok(rv.includes(t), t);
});
