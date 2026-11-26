// Added by By Mel Ross (0.36.0). The storyboard: a render split into scenes with one still each, and flags for dead air,
// words with no caption, and card words that are never said.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ff, skill, skipReason, tmp } from "./reel-helpers.mjs";

test("scenes.py: scenes cut at cards, one still each, a sheet, and the flags Claude must check", { skip: skipReason }, () => {
  const reel = tmp("sb");
  ff(["-f", "lavfi", "-i", "color=c=gray:s=270x480:r=30:d=14", "-f", "lavfi", "-i", "sine=f=220:d=14", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(reel, "final.mp4")]);
  const w = (text, start, end) => ({ text, start, end });
  fs.writeFileSync(path.join(reel, "master_transcript.json"), JSON.stringify([w("so", 0.2, 0.4), w("here", 0.5, 0.8), w("is", 0.9, 1.0), w("the", 1.1, 1.2), w("tool", 1.3, 1.7),
    w("i", 4.5, 4.6), w("use", 4.7, 5.0), w("every", 5.1, 5.4), w("day", 5.5, 5.9), w("for", 6.0, 6.2), w("work", 6.3, 6.8), w("thanks", 11.0, 11.5)]));
  fs.writeFileSync(path.join(reel, "edit.json"), JSON.stringify({
    captions: [{ start: 0.2, end: 1.7, words: [{ text: "so", t: 0.2 }, { text: "here", t: 0.5 }] }, { start: 4.5, end: 6.8, words: [{ text: "i", t: 4.5 }, { text: "use", t: 4.7 }] }],
    cards: [{ id: "g1", type: "title", text: "the tool / ever", start: 0, end: 2.5 }, { id: "g2", type: "card", title: "work", rows: ["every day"], start: 6.0, end: 9.0 }, { id: "g3", type: "tag", text: "off", start: 3, end: 4, off: true }] }));
  const r = spawnSync("python3", [path.join(skill, "scripts", "scenes.py"), reel], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const sb = JSON.parse(fs.readFileSync(path.join(reel, "editor", "storyboard", "final", "scenes.json"), "utf8"));
  assert.deepEqual(sb.scenes.map((s) => [s.start, s.end]), [[0, 2.5], [2.5, 6], [6, 9], [9, 14]].map(([a, b]) => [a, b === 14 ? sb.length : b]));
  for (const s of sb.scenes) assert.ok(fs.statSync(path.join(reel, "editor", "storyboard", "final", s.still)).size > 0);
  assert.ok(fs.existsSync(path.join(reel, "editor", "storyboard", "final", "sheet.jpg")));
  assert.deepEqual(sb.scenes[0].flags, ["Title has words you don't say: ever"]);
  assert.match(sb.scenes[1].flags.join(" | "), /no talking at 2\.5 s/);
  assert.match(sb.scenes[3].flags.join(" | "), /1 word with no caption: thanks/);
  assert.deepEqual(sb.scenes[2].cards.map((c) => c.label), ["List: work every day"], "a switched-off card isn't listed");
  assert.match(r.stdout, /storyboard: 4 scenes/);
});
