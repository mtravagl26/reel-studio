// Added by By Mel Ross (0.9.0). The review step end to end without a browser: export the page's data, import the decisions into
// edit.json + edl.json, and rebuild from the review page without losing what was done on the touch-ups page.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
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
