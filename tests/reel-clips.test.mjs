// Added by By Mel Ross. find_clips.py: ranks 30-60 s windows of a long recording and sets one up as a reel folder.
// Uses a made-up transcript and a fake "video" file (the script only clones it), so no ffmpeg is needed.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { havePython, py, tmp } from "./reel-helpers.mjs";

const skip = havePython ? false : "python3 not installed";

/** 8 words per sentence, 0.35 s a word, 0.5 s between sentences. Returns { words, sentences:[{first,last,text}] }. */
function transcript(specs) {
  const words = [], sentences = [];
  let t = 1;
  for (const text of specs) {
    const parts = text.split(" ");
    const first = words.length;
    for (const w of parts) { words.push({ text: w, start: +t.toFixed(2), end: +(t + 0.3).toFixed(2) }); t += 0.35; }
    sentences.push({ first, last: words.length - 1, text });
    t += 0.5;
  }
  return { words, sentences };
}
const filler = (n) => `Here is a clear steady point number ${n} about running your week.`;
const specs = [];
for (let i = 0; i < 60; i++) specs.push(filler(i));
specs[10] = "And that is why the second thing matters so much to everyone.";
specs[11] = "As I said earlier this only works if you keep it simple.";
specs[2] = "Today I want to tell you what Rosie taught me about running your week.";
specs[20] = "Thank you Rosie for sharing this with every single one of us today.";
specs[30] = "Absolutely.";
specs[40] = "Why do most owners never finish their weekly planning at all?";
const { words, sentences } = transcript(specs);

function setup() {
  const d = tmp("clips");
  fs.writeFileSync(path.join(d, "transcript.json"), JSON.stringify(words));
  return d;
}
const candidates = (d, extra = []) => {
  const r = py("find_clips.py", ["candidates", path.join(d, "transcript.json"), "--out", path.join(d, "c.json"), ...extra]);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(fs.readFileSync(path.join(d, "c.json"), "utf8"));
};

test("candidates are 30-60 s, ranked, never overlap and write a readable .md", { skip }, () => {
  const d = setup(), data = candidates(d, ["--top", "6"]);
  assert.ok(data.candidates.length >= 3 && data.candidates.length <= 6);
  const sorted = [...data.candidates].sort((a, b) => a.start - b.start);
  data.candidates.forEach((c, i) => {
    assert.equal(c.rank, i + 1);
    assert.ok(c.duration >= 29.9 && c.duration <= 60.1, `duration ${c.duration}`);
    for (const k of ["hook", "standalone", "value", "energy", "platform_fit"]) assert.ok(c.scores[k] >= 0 && c.scores[k] <= 5);
  });
  sorted.slice(1).forEach((c, i) => assert.ok(c.start >= sorted[i].end, "windows overlap"));
  assert.match(fs.readFileSync(path.join(d, "c.md"), "utf8"), /# Clip candidates/);
});

test("cut edges fall in the gaps: never inside a word, and no more than 0.3 s from the speech", { skip }, () => {
  const d = setup();
  for (const c of candidates(d).candidates) {
    const first = words.findIndex((w) => w.start - 0.26 <= c.start && c.start <= w.start);
    assert.ok(first >= 0, `start ${c.start} is not just before a word`);
    assert.ok(!words.some((w) => w.start < c.start && w.end > c.start), "start cuts a word");
    assert.ok(!words.some((w) => w.start < c.end && w.end > c.end), "end cuts a word");
    assert.ok(words.some((w) => w.end <= c.end && c.end - w.end <= 0.31), "end is far from the last word");
  }
});

test("never starts on a reaction or a scrap, and flags mid-thought starts and look-backs", { skip }, () => {
  const d = setup(), data = candidates(d, ["--top", "500", "--min", "30", "--max", "40", "--overlap"]);
  const reactionStart = words[sentences[30].first].start;
  assert.ok(!data.candidates.some((c) => Math.abs(c.start - reactionStart) < 0.3), "a clip starts on 'Absolutely.'");
  const andStart = words[sentences[10].first].start;
  const mid = data.candidates.find((c) => c.start <= andStart && andStart - c.start < 0.3);
  assert.ok(mid, "no window starts on the 'And that is why' sentence");
  assert.ok(mid.flags.some((f) => /mid-thought/.test(f)));
  assert.ok(mid.scores.standalone <= 3);
  const backStart = words[sentences[11].first].start;
  const back = data.candidates.find((c) => c.start <= backStart && backStart - c.start < 0.3);
  assert.ok(back, "no window starts on the 'As I said earlier' sentence");
  assert.ok(back.flags.some((f) => /refers back/.test(f)));
});

test("names the recording already used before the window are flagged; AI and I are not", { skip }, () => {
  const d = setup(), data = candidates(d, ["--top", "500", "--overlap"]);
  const t20 = words[sentences[20].first].start, t3 = words[sentences[3].first].start;
  const hit = data.candidates.find((c) => c.start >= t3 && c.start < t20 && c.end > t20 + 3);
  assert.ok(hit, "no window after the first mention that contains the second");
  assert.ok(hit.flags.some((f) => /names introduced earlier: Rosie/.test(f)), hit.flags.join("; "));
  assert.ok(!data.candidates.some((c) => c.flags.some((f) => /: I\b|\bAi\b/.test(f))));
});

test("a window that opens on a question scores a better hook than the same window opening on a statement", { skip }, () => {
  const d = setup(), data = candidates(d, ["--top", "500", "--overlap"]);
  const q = data.candidates.find((c) => c.first_line.startsWith("Why do most owners"));
  const s = data.candidates.find((c) => c.first_line.startsWith("Here is a clear"));
  assert.ok(q && s, "missing the question window or the statement window");
  assert.ok(q.scores.hook > s.scores.hook);
});

test("extract sets up a reel folder without cutting anything, and refuses to overwrite one", { skip }, () => {
  const d = setup(), data = candidates(d), video = path.join(d, "long.mov"), home = path.join(d, "reels");
  fs.writeFileSync(video, "not really a video");
  const r = py("find_clips.py", ["extract", video, path.join(d, "c.json"), "--pick", "1", "--reels-home", home, "--date", "2026-11-11"]);
  assert.equal(r.status, 0, r.stderr);
  const [name] = fs.readdirSync(home);
  assert.match(name, /^2026-11-11-clip1-/);
  const folder = path.join(home, name);
  assert.equal(fs.readFileSync(path.join(folder, "raw.mov"), "utf8"), "not really a video");
  const edl = JSON.parse(fs.readFileSync(path.join(folder, "edl.json"), "utf8"));
  assert.deepEqual(edl.keep, [[data.candidates[0].start, data.candidates[0].end]]);
  assert.equal(edl.source, "raw.mov");
  assert.equal(fs.readFileSync(path.join(folder, "source_dir.txt"), "utf8").trim(), d);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, "transcript.json"), "utf8")), words);
  fs.writeFileSync(path.join(folder, "edl.json"), "keep me");
  const again = py("find_clips.py", ["extract", video, path.join(d, "c.json"), "--pick", "1", "--reels-home", home, "--date", "2026-11-11"]);
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /already exists/);
  assert.equal(fs.readFileSync(path.join(folder, "edl.json"), "utf8"), "keep me");
});

test("extract --span snaps a hand-picked span into the gaps between words", { skip }, () => {
  const d = setup(); candidates(d);
  const video = path.join(d, "long.mov"), home = path.join(d, "reels");
  fs.writeFileSync(video, "x");
  const inWord = [words[20].start + 0.1, words[90].start + 0.1];
  const r = py("find_clips.py", ["extract", video, path.join(d, "c.json"), "--span", String(inWord[0]), String(inWord[1]), "--name", "My Pick", "--reels-home", home, "--date", "2026-11-11"]);
  assert.equal(r.status, 0, r.stderr);
  const edl = JSON.parse(fs.readFileSync(path.join(home, "2026-11-11-my-pick", "edl.json"), "utf8"));
  const [s, e] = edl.keep[0];
  assert.ok(!words.some((w) => w.start < s && w.end > s) && !words.some((w) => w.start < e && w.end > e));
  assert.ok(s <= words[20].start && e >= words[90].end - 0.0001);
});

test("a transcript that is too short is refused with a clear message", { skip }, () => {
  const d = tmp("clips-short");
  fs.writeFileSync(path.join(d, "t.json"), JSON.stringify(words.slice(0, 10)));
  const r = py("find_clips.py", ["candidates", path.join(d, "t.json")]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /fewer than 20 words/);
});
