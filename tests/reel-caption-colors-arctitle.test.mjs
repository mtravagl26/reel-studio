// Added by By Mel Ross (0.23.0). Caption colors picked by the person (the words, the highlighted word, a box behind it),
// the arched title card, and the hand trail. No render is run: the build writes proj/index.html and the test reads it.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ff, py, skipReason, tmp } from "./reel-helpers.mjs";

const skill = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "3-editing", "reel-editor"), review = path.join(skill, "review");

function makeReel({ edit = {}, brand = {}, hands = null, size = "270x480" }) {
  const dir = tmp("cap-colors"), reel = path.join(dir, "reel"), home = path.join(dir, "home"), engine = path.join(dir, "engine");
  fs.mkdirSync(reel); fs.mkdirSync(home); fs.mkdirSync(path.join(engine, "sfx"), { recursive: true });
  fs.writeFileSync(path.join(engine, "gsap.min.js"), "/* gsap stand-in for the test */");
  ff(["-f", "lavfi", "-i", `testsrc2=s=${size}:r=30:d=4`, "-f", "lavfi", "-i", "sine=f=220:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(reel, "master.mp4")]);
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: { main: "#0d2b2d", pop: "#B9C8A5", light: "#f5f2ec" }, sfx: "none", ...brand }));
  fs.writeFileSync(path.join(reel, "edit.json"), JSON.stringify({ captions: [], punch: [], cards: [], ...edit }));
  if (hands) {   // a tracked-hands file with the key of this clip, as hand_track.py would have left it
    const k = spawnSync("python3", ["-c", "import sys; sys.path.insert(0, sys.argv[1]); import hand_track; print(hand_track.key_of(sys.argv[2]))", path.join(skill, "scripts"), path.join(reel, "master.mp4")], { encoding: "utf8" });
    assert.equal(k.status, 0, k.stderr);
    fs.mkdirSync(path.join(reel, "hands")); fs.writeFileSync(path.join(reel, "hands", "hands.json"), JSON.stringify({ ...hands, key: k.stdout.trim() }));
  }
  const r = py("build_reel.py", [reel], { REELS_HOME: home, REEL_ENGINE: engine });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return { html: fs.readFileSync(path.join(reel, "proj", "index.html"), "utf8"), out: r.stdout + r.stderr, reel, home };
}
const caps = [{ start: 0.2, end: 1.5, words: [{ text: "never", t: 0.2 }, { text: "edit", t: 0.6, accent: true }, { text: "it", t: 1 }] }];
const accent = (html) => html.match(/<span class="acc[^"]*" style="([^"]*)">edit<\/span>/)?.[1] || "";
const capStyle = (html) => html.match(/<div id="c0" class="cap[^"]*" style="([^"]*)"/)?.[1] || "";

test("caption colors: nothing picked changes nothing; a pick sets the words, the highlighted word and its box", { skip: skipReason }, () => {
  const plain = makeReel({ edit: { captions: caps } }).html;
  assert.match(accent(plain), /color:#B9C8A5/); assert.doesNotMatch(accent(plain), /background/); assert.match(capStyle(plain), /color:#FFFFFF/);
  const picked = makeReel({ edit: { captions: caps, caption_highlight: { words: "#FFF6CF", text: "#0D2B2D", bg: "#F2C14E" } } }).html;
  assert.match(accent(picked), /color:#0D2B2D;background:#F2C14E/); assert.match(capStyle(picked), /color:#FFF6CF/);
  const every = makeReel({ edit: { captions: caps }, brand: { caption_highlight: { text: "#111111", bg: "#EEEEEE" } } }).html;
  assert.match(accent(every), /color:#111111;background:#EEEEEE/, "brand.json sets it for every reel");
  const off = makeReel({ edit: { captions: caps, caption_highlight: { bg: "none" } }, brand: { caption_highlight: { text: "#111111", bg: "#EEEEEE" } } }).html;
  assert.match(accent(off), /color:#111111/); assert.doesNotMatch(accent(off), /background/, "this reel can switch the box off");
  const bad = makeReel({ edit: { captions: caps, caption_highlight: { text: "red", bg: "url(x)", words: 7 } } }).html;
  assert.equal(accent(bad), accent(plain), "values that are not colors are ignored");
});

test("caption colors win over a theme, and the hand-written caption_colors still works, with or without a theme", { skip: skipReason }, () => {
  const themed = makeReel({ edit: { captions: caps, theme: "editorial", caption_highlight: { text: "#FF0066" } } }).html;
  assert.match(accent(themed), /color:#FF0066/);
  for (const theme of ["editorial", "none"]) {
    const old = makeReel({ edit: { captions: caps, theme, caption_colors: { caption: "#726969", caption_accent: "#123456" } } }).html;
    assert.match(accent(old), /color:#123456/, theme); assert.match(capStyle(old), /color:#726969/, theme);
  }
  const both = makeReel({ edit: { captions: caps, caption_colors: { caption_accent: "#123456" }, caption_highlight: { text: "#654321" } } }).html;
  assert.match(accent(both), /color:#654321/, "the page's pick is the one that counts");
});

test("an arched title builds, shrinks a long line, and builds without a hand tracker", { skip: skipReason }, () => {
  const size = (html) => Number(html.match(/class="arcs"[\s\S]*?font-size:(\d+)px/)?.[1]);
  const short = makeReel({ edit: { cards: [{ type: "arctitle", text: "Short one", sub: "part one", start: 0.3, end: 3 }] } });
  assert.match(short.html, /<textPath[^>]*>Short one<\/textPath>/i); assert.match(short.html, /class="asub"[^>]*>part one</i); assert.equal(size(short.html), 128);
  const long = makeReel({ edit: { cards: [{ type: "arctitle", text: "A much longer arched headline here", start: 0.3, end: 3 }] } });
  assert.ok(size(long.html) < 128 && size(long.html) >= 40, "a long line gets smaller: " + size(long.html));
  assert.doesNotMatch(long.html, /class="asub"/);
  if (process.platform !== "darwin") {   // no Apple Vision here: the trail is left out and the reel still builds
    const t = makeReel({ edit: { cards: [{ type: "arctitle", text: "Wave", trail: true, start: 0.3, end: 3 }] } });
    assert.match(t.html, /<textPath[^>]*>Wave<\/textPath>/i); assert.doesNotMatch(t.html, /class="spk"/); assert.match(t.out, /hand trail skipped/);
  }
});

test("a hand trail follows the tracked hand, scaled from the clip's pixels to the reel's, and zooms with the video", { skip: skipReason }, () => {
  const frames = Array.from({ length: 60 }, (_, k) => ({ t: 0.5 + k / 30, hands: [{ side: "right", conf: 0.9, palm: [100 + k, 200], wrist: [100 + k, 240], index: [100 + k, 160], tips: [] }] }));
  const r = makeReel({ hands: { fps: 30, w: 270, h: 480, frames }, edit: { hand_trail: [{ start: 0.6, end: 2.2 }, { start: 3.2, end: 3.8 }] } });
  const stars = [...r.html.matchAll(/class="spk"[^>]*style="left:([\d.]+)px;top:([\d.]+)px/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(stars.length > 40, "stars drawn: " + stars.length);
  const xs = stars.map((s) => s[0]), ys = stars.map((s) => s[1]);
  assert.ok(Math.min(...xs) > 380 && Math.max(...xs) < 680, "x is scaled 4 times from the 270 px clip: " + Math.min(...xs) + " to " + Math.max(...xs));
  assert.ok(Math.min(...ys) > 770 && Math.max(...ys) < 830, "y is scaled 4 times from the 480 px clip");
  assert.match(r.out, /no hand found there - skipped/, "a stretch with no hand is skipped and said so");
  assert.ok(r.html.indexOf('id="trail"') > r.html.indexOf('id="front"'), "the stars draw in front of the cards");
  assert.match(r.html, /#trail \{[^}]*transform-origin: 50% 38%/, "same zoom origin as the video");
  const z = makeReel({ edit: { punch: [1.0], captions: caps } }).html;
  if (/tl\.to\("#cam/.test(z)) assert.match(z, /tl\.to\("#cam,#trail"/, "a zoom moves the trail with the video");
});

test("the pages: a caption colors box on both, a save route, and the arched title's words can be changed", { skip: skipReason }, async () => {
  const ed = fs.readFileSync(path.join(review, "editor.html"), "utf8"), rv = fs.readFileSync(path.join(review, "reel-review.html"), "utf8"), srv = fs.readFileSync(path.join(review, "editor-server.mjs"), "utf8");
  for (const t of ["Caption colors", "Put a box behind the highlighted word", 'data-a="hl-save"', "Back to my usual", "too close", "Arched words", 'arctitle: "Arched title"']) assert.ok(ed.includes(t), t);
  for (const t of ["Caption colors", "Box behind the highlighted word", "S.highlight = null", "too close"]) assert.ok(rv.includes(t), t);
  assert.match(srv, /"\/api\/caption-highlight"/);
  assert.match(fs.readFileSync(path.join(review, "core.js"), "utf8"), /if \(d\.highlight\) parts\.push\(d\.highlight\)/);
  assert.match(fs.readFileSync(path.join(skill, "scripts", "review_sync.py"), "utf8"), /out\["caption_highlight"\]/);
  const core = await import(path.join(review, "editor-core.mjs"));
  assert.deepEqual(core.cleanCardFields("arctitle", { text: " New words ", sub: "" }, 10), { text: "New words", sub: "" });
  assert.throws(() => core.cleanCardFields("arctitle", { y: 10 }, 10), /can't be changed/);
});

test("caption box and size (0.27.0): picked on the pages, the older caption_style still works, bad values are ignored", { skip: skipReason }, async () => {
  const box = (html) => html.match(/<span class="cb" style="background:([^;]+);/)?.[1] || null;
  const px = (html) => Number(html.match(/<div id="c0" class="cap[^"]*" style="top:\d+px;[^"]*font-size:(\d+)px/)?.[1]);
  const plain = makeReel({ edit: { captions: caps } }).html;
  assert.equal(box(plain), null);
  const picked = makeReel({ edit: { captions: caps, caption_highlight: { box: "#FFFFFF", size: 140, words: "#0D2B2D" } } }).html;
  assert.equal(box(picked), "#FFFFFF"); assert.ok(px(picked) > px(plain), `${px(picked)} > ${px(plain)}`);
  const old = makeReel({ edit: { captions: caps, caption_style: { bg: "rgba(0,0,0,.6)", size: 130, y: 1100 } } });
  assert.equal(box(old.html), "rgba(0,0,0,.6)"); assert.match(old.html, /id="c0" class="cap[^"]*" style="top:1100px/);
  const off = makeReel({ edit: { captions: caps, caption_highlight: { box: "none" } }, brand: { captions: { bg: "#FFFFFF" } } }).html;
  assert.equal(box(off), null, "this reel can take the box off");
  const bad = makeReel({ edit: { captions: caps, caption_highlight: { box: "url(x)", size: 999 }, caption_style: { bg: "red;x", size: "big" } } }).html;
  assert.equal(box(bad), null); assert.equal(px(bad), px(plain));
  const core = fs.readFileSync(path.join(review, "editor.html"), "utf8"), rv = fs.readFileSync(path.join(review, "reel-review.html"), "utf8");
  for (const t of ["Put a box behind all the words", 'id="cSize"', "Caption colors and size"]) assert.ok(core.includes(t), t);
  for (const t of ["Box behind all the words", "Caption size", "Caption colors and size"]) assert.ok(rv.includes(t), t);
});
