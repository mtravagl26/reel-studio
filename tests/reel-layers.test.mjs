// Added by By Mel Ross. Graphics behind / in front of the speaker: the build routes cards to the right layer using a cutout,
// checks the cutout's edges shot by shot, and falls back to a plain overlay (saying so) when it can't or shouldn't layer.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ff, haveVp9, py, skipReason, tmp } from "./reel-helpers.mjs";

const skip = skipReason || (haveVp9 ? false : "ffmpeg has no libvpx-vp9");

// A 4 s reel with an oval "speaker" matte of your own (the build accepts a white-on-black matte video instead of Apple Vision).
function makeReel(cards, { matte = "oval", env = {} } = {}) {
  const dir = tmp("layers"), reel = path.join(dir, "reel"), home = path.join(dir, "home"), engine = path.join(dir, "engine");
  fs.mkdirSync(reel); fs.mkdirSync(home); fs.mkdirSync(path.join(engine, "sfx"), { recursive: true });
  fs.writeFileSync(path.join(engine, "gsap.min.js"), "/* gsap stand-in for the test */");
  ff(["-f", "lavfi", "-i", "testsrc2=s=270x480:r=30:d=4", "-f", "lavfi", "-i", "sine=f=220:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(reel, "master.mp4")]);
  const src = {
    oval: "color=c=black:s=270x480:r=30:d=4,geq=lum='if(lte(pow((X-W/2)/(W*0.3),2)+pow((Y-H*0.55)/(H*0.33),2),1),255,0)':cb=128:cr=128",
    empty: "color=c=black:s=270x480:r=30:d=4",
    full: "color=c=white:s=270x480:r=30:d=4",
  }[matte];
  if (src) ff(["-f", "lavfi", "-i", src, "-pix_fmt", "gray", "-c:v", "ffv1", path.join(reel, "matte.mkv")]);
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: { main: "#0d2b2d", pop: "#B9C8A5", light: "#f5f2ec" }, sfx: "none" }));
  fs.writeFileSync(path.join(reel, "edit.json"), JSON.stringify({ captions: [], punch: [], cards, ...(src ? { cutout: { matte: "matte.mkv" } } : {}) }));
  return { reel, home, engine, env: { REELS_HOME: home, REEL_ENGINE: engine, ...env } };
}
const build = (c) => py("build_reel.py", [c.reel], c.env);
const html = (c) => fs.readFileSync(path.join(c.reel, "proj", "index.html"), "utf8");
const behindOf = (h) => h.match(/<div id="behind">([\s\S]*?)<\/div>\s*(?:<video id="person"|<div id="back")/)?.[1] ?? "";

test("a card with layer: behind sits under the speaker cutout", { skip }, () => {
  const c = makeReel([{ type: "title", start: 0.5, end: 3, text: "six / weeks", layer: "behind" }, { type: "tag", start: 1, end: 3, text: "in front" }]);
  const r = build(c);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const h = html(c);
  assert.match(h, /<video id="person" class="clip" src="cutout\/person\.webm"/);
  assert.ok(h.indexOf('id="behind"') < h.indexOf('id="person"') && h.indexOf('id="person"') < h.indexOf('id="front"'), "order: behind, speaker, front");
  assert.match(behindOf(h), /six/, "the title is in the behind layer");
  assert.doesNotMatch(behindOf(h), /in front/, "the tag stays in front");
  assert.ok(fs.existsSync(path.join(c.reel, "proj", "cutout", "person.webm")));
  assert.ok(!/not layered/.test(r.stdout));
});

test("layer: both keeps the card behind and adds a clipped copy in front", { skip }, () => {
  const c = makeReel([{ type: "tag", start: 0.5, end: 3, text: "weave", layer: "both", front_part: "bottom" }]);
  const r = build(c);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const h = html(c);
  assert.match(behindOf(h), /id="k0"/);
  assert.match(h, /class="lp"[^>]*clip-path:inset\(1100px 0 0 0\)[^>]*><div id="k0f"/);
  assert.match(h, /#k0f/, "the copy is animated too");
});

test("a card without a layer is unchanged: no speaker layer, nothing behind", { skip }, () => {
  const c = makeReel([{ type: "tag", start: 0.5, end: 3, text: "plain" }]);
  const r = build(c);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const h = html(c);
  assert.doesNotMatch(h, /id="person"/);
  assert.equal(behindOf(h).trim(), "");
  assert.match(h, /plain/);
});

test("no cutout available: the card is drawn in front and the build says so", { skip: skipReason }, () => {
  const c = makeReel([{ type: "title", start: 0.5, end: 3, text: "six / weeks", layer: "behind" }], { matte: null, env: { REEL_NO_CUTOUT: "1" } });
  const r = build(c);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /no speaker cutout on this machine/);
  assert.match(r.stdout, /not layered behind the speaker \(no cutout available\); drawn as a plain overlay in front/);
  const h = html(c);
  assert.doesNotMatch(h, /id="person"/);
  assert.match(h, /six/, "the title is still there, in front");
  assert.equal(behindOf(h).trim(), "");
});

test("bad edges: a matte that finds no speaker, or the whole frame, falls back shot by shot", { skip }, () => {
  for (const [matte, why] of [["empty", /speaker not found/], ["full", /covers almost the whole frame/]]) {
    const c = makeReel([{ type: "title", start: 0.5, end: 3, text: "six / weeks", layer: "behind" }], { matte });
    const r = build(c);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /note: card 0 at 0\.5s \(title\): not layered behind the speaker/);
    assert.match(r.stdout, why);
    assert.doesNotMatch(html(c), /id="person"/);
  }
});

test("full-frame cards can't go behind the speaker and say so", { skip }, () => {
  const c = makeReel([{ type: "page", start: 0.5, end: 3, bg: "#112233", title: "x", layer: "behind" }]);
  const r = build(c);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /fills the frame, so it can't sit behind the speaker/);
});

test("cutout.py check: a steady matte passes, an empty one fails (command line)", { skip }, () => {
  const c = makeReel([{ type: "tag", start: 0.5, end: 3, text: "x", layer: "behind" }]);
  assert.equal(build(c).status, 0);
  const ok = py("cutout.py", [c.reel, "check", "0.5", "3"], c.env);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /^OK/);
  const bad = makeReel([{ type: "tag", start: 0.5, end: 3, text: "x", layer: "behind" }], { matte: "empty" });
  build(bad);
  const no = py("cutout.py", [bad.reel, "check", "0.5", "3"], bad.env);
  assert.equal(no.status, 1);
  assert.match(no.stdout, /^FAIL/);
});
