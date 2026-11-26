// Added by By Mel Ross (0.31.0). The Roundup layout: chapter cards, a true split screen and a slide with a small face inset,
// laid out from one "roundup" card.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ff, py, skipReason, tmp } from "./reel-helpers.mjs";

const skill = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "3-editing", "reel-editor");

function expand(cards) {
  const r = spawnSync("python3", ["-c", `import json,sys; sys.path.insert(0, sys.argv[1]); import roundup; print(json.dumps(roundup.expand(json.loads(sys.argv[2]))))`, path.join(skill, "scripts"), JSON.stringify(cards)], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout);
}

test("roundup: chapters become a chapter card, then the chapter's look, with switches inside a chapter", () => {
  const out = expand([
    { type: "title", text: "hook", start: 0 },
    { type: "roundup", card_seconds: 1.5, end: 40, chapters: [
      { start: 0, look: "full", card: false },
      { start: 5, title: "Skills", look: "split", src: "rec.mp4", face_y: 600 },
      { start: 15, title: "Claude Code", look: "slide", src: "slide.png", slide_title: "ships today", then: [{ start: 25, look: "full" }, { start: 30, look: "split", src: "b.mp4" }] },
    ] },
  ]);
  assert.deepEqual(out.map((c) => [c.type, c.start, c.end]), [
    ["title", 0, undefined], ["chapter", 5, 6.5], ["split", 6.5, 15], ["chapter", 15, 16.5], ["inset", 16.5, 25], ["split", 30, 40],
  ]);
  assert.equal(out[1].text, "Skills"); assert.equal(out[2].src, "rec.mp4"); assert.equal(out[2].face_y, 600);
  assert.equal(out[4].title, "ships today", "a slide's own text is slide_title; the chapter name stays on its card");
  assert.equal(out[2].title, undefined);
  // an empty or broken roundup adds nothing
  assert.deepEqual(expand([{ type: "roundup" }, { type: "roundup", chapters: [{ start: 3, look: "nope", title: "x" }] }]).map((c) => c.type), ["chapter"]);
});

test("roundup: the build draws chapter cards with no footage, a split screen and a slide with a face inset", { skip: skipReason }, () => {
  const dir = tmp("roundup"), reel = path.join(dir, "reel"), home = path.join(dir, "home"), engine = path.join(dir, "engine");
  fs.mkdirSync(reel); fs.mkdirSync(home); fs.mkdirSync(path.join(engine, "sfx"), { recursive: true });
  fs.writeFileSync(path.join(engine, "gsap.min.js"), "/* stand-in */");
  ff(["-f", "lavfi", "-i", "color=c=gray:s=270x480:r=30:d=12", "-f", "lavfi", "-i", "sine=f=220:d=12", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(reel, "master.mp4")]);
  ff(["-f", "lavfi", "-i", "testsrc=s=640x360:r=30:d=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(reel, "rec.mp4")]);
  ff(["-f", "lavfi", "-i", "color=c=navy:s=540x960", "-frames:v", "1", path.join(reel, "slide.png")]);
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: { main: "#1f1a17", pop: "#B9C8A5", light: "#f4ead8" }, sfx: "none" }));
  fs.writeFileSync(path.join(reel, "edit.json"), JSON.stringify({ captions: [{ start: 1.2, end: 2, words: [{ text: "hi", t: 1.2 }] }], punch: [], cards: [
    { type: "roundup", chapters: [
      { start: 1, title: "Skills", look: "split", src: "rec.mp4" },
      { start: 5, title: "Claude Code", look: "slide", src: "slide.png", slide_title: "ships today", corner: "top-left" },
    ] },
  ] }));
  const r = py("build_reel.py", [reel], { REELS_HOME: home, REEL_ENGINE: engine });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const html = fs.readFileSync(path.join(reel, "proj", "index.html"), "utf8");
  const chap = html.match(/<div id="k0" class="chap"[^]*?<\/div><\/div>/)[0];
  assert.match(chap, /Skills/); assert.doesNotMatch(chap, /<video/, "a chapter card shows no footage");
  assert.match(chap, /background:#1f1a17/); assert.match(chap, /color:#f4ead8/);
  const split = html.match(/<div id="k1" class="split"[^]*?<\/div><\/div>/)[0];
  assert.match(split, /class="spt"><video[^>]*src="img\/[^"]+"/, "the recording fills the top panel");
  assert.match(split, /class="spb"><video id="k1v" src="master.mp4"[^>]*data-media-start="2\.4"/, "the presenter fills the bottom half, in sync");
  const ins = html.match(/<div id="k3" class="inset"[^]*?<\/div><\/div><\/div>/)[0];
  assert.match(ins, /<img src="img\/[^"]+"/); assert.match(ins, /ships today/);
  assert.match(ins, /class="inf" style="left:56px;top:150px;width:300px;height:400px"/, "the inset sits in the corner asked for");
  assert.match(ins, /src="master.mp4"/);
  assert.match(html, /\.spb \{ top: 960px; \}|\.spt \{ top: 0; \} \.spb \{ top: 960px; \}/);
  // the chapter card is a quiet span: the caption inside it doesn't show
  assert.doesNotMatch(html, /id="c0" class="cap/);
});
