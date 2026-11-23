// Added by By Mel Ross. Graphics behind / in front of the speaker: the build routes cards to the right layer using a cutout,
// checks the cutout's edges shot by shot, and falls back to a plain overlay (saying so) when it can't or shouldn't layer.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ff, haveVp9, py, run, scripts, skipReason, tmp } from "./reel-helpers.mjs";

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

test("include_dark adds only the dark object in front of the speaker (a microphone), not the box around it", { skip }, () => {
  // grey scene with a dark "microphone" the oval matte misses; the include_dark box surrounds it
  const dir = tmp("mic"), reel = path.join(dir, "reel");
  fs.mkdirSync(reel);
  ff(["-f", "lavfi", "-i", "color=c=0xc8c8c8:s=270x480:r=30:d=2", "-vf", "drawbox=x=200:y=380:w=50:h=70:color=black:t=fill", "-pix_fmt", "yuv420p", path.join(reel, "master.mp4")]);
  ff(["-f", "lavfi", "-i", "color=c=black:s=270x480:r=30:d=2,geq=lum='if(lte(pow((X-W*0.3)/(W*0.2),2)+pow((Y-H*0.4)/(H*0.2),2),1),255,0)':cb=128:cr=128", "-pix_fmt", "gray", "-c:v", "ffv1", path.join(reel, "matte.mkv")]);
  const coverage = (cut) => {
    fs.writeFileSync(path.join(reel, "edit.json"), JSON.stringify({ cutout: { matte: "matte.mkv", ...cut } }));
    fs.rmSync(path.join(reel, "cutout"), { recursive: true, force: true });
    const code = `import sys, json; sys.path.insert(0, ${JSON.stringify(scripts)}); import cutout
reel = sys.argv[1]; boxes = json.load(open(reel + "/edit.json"))["cutout"]
m = cutout.build_matte(reel, reel + "/master.mp4", "accurate", reel + "/matte.mkv", boxes)
print(cutout.frame_stats(m)[5]["cov"])`;
    const r = run("python3", ["-c", code, reel]);
    assert.equal(r.status, 0, r.stderr);
    return Number(r.stdout.trim());
  };
  const plain = coverage({});
  const withMic = coverage({ include_dark: [[760, 1480, 280, 360]] });
  const wholeBox = coverage({ include: [[760, 1480, 280, 360]] });
  const darkArea = (50 * 70) / (270 * 480);   // the dark object's share of the frame
  assert.ok(withMic - plain > darkArea * 0.6, `the dark object should be added (${plain} -> ${withMic})`);
  assert.ok(withMic - plain < darkArea * 1.6, "and not much more than the object itself");
  assert.ok(wholeBox - plain > (withMic - plain) * 1.5, "a plain include box takes in far more (the whole box)");
});

// Added by By Mel Ross (0.7.0): the orbit card, photos that circle the head behind and in front of the speaker.
function withPhotos(c, names = ["a", "b", "c"]) {
  for (const n of names) ff(["-f", "lavfi", "-i", "color=c=red:s=80x100:d=1", "-frames:v", "1", path.join(c.reel, `${n}.png`)]);
  return names.map((n) => `${n}.png`);
}

test("orbit: each photo is drawn under and over the speaker, and the two copies swap at the sides of the ring", { skip }, () => {
  const c = makeReel([]);
  const src = withPhotos(c);
  fs.writeFileSync(path.join(c.reel, "edit.json"), JSON.stringify({ captions: [], punch: [], cards: [{ type: "orbit", start: 0.5, end: 3.5, src, period: 3 }], cutout: { matte: "matte.mkv" } }));
  const r = build(c);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /orbit card 0: ring centre \(\d+, \d+\), \d+ x \d+ px, 3 photo\(s\)/);
  const h = html(c);
  assert.match(h, /<video id="person"/, "the speaker cutout is in the page");
  const under = behindOf(h);
  for (const k of [0, 1, 2]) {
    assert.ok(under.includes(`id="k0b${k}"`), `photo ${k} has a copy behind the speaker`);
    assert.ok(h.includes(`id="k0f${k}"`) && !under.includes(`id="k0f${k}"`), `photo ${k} has a copy in front`);
  }
  assert.ok(h.indexOf('id="person"') < h.indexOf('id="k0f0"'), "the front copies sit above the cutout");
  // one lap in 3 s: every photo crosses the sides of the ring twice, and each crossing flips both copies
  for (const k of [0, 1, 2]) assert.equal((h.match(new RegExp(`tl\\.set\\("#k0f${k}",\\{visibility:`, "g")) || []).length, 2, `photo ${k}: 2 swaps`);
  // the first photo starts at the back of the ring: hidden in front, showing behind
  assert.match(h, /id="k0f0"[^>]*visibility:hidden/);
  assert.doesNotMatch(under.match(/<div id="k0b0"[^>]*>/)[0], /visibility:hidden/);
  // the oval matte's head is centred, so the ring is too
  const cx = Number(/ring centre \((\d+),/.exec(r.stdout)[1]);
  assert.ok(Math.abs(cx - 540) <= 20, `ring centred on the head (cx ${cx})`);
});

test("orbit without a cutout: photos show on the near side only, and the build says so", { skip }, () => {
  const c = makeReel([], { matte: null });
  const src = withPhotos(c, ["a"]);
  fs.writeFileSync(path.join(c.reel, "edit.json"), JSON.stringify({ captions: [], punch: [], cards: [{ type: "orbit", start: 0.5, end: 3.5, src }] }));
  const r = build({ ...c, env: { ...c.env, REEL_MATTE_TOOL: "/nonexistent" } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const h = html(c);
  if (/<video id="person"/.test(h)) return;   // this machine can make its own cutout (macOS): the layered path is covered above
  assert.match(r.stdout, /orbit\): not layered around the speaker/);
  assert.ok(h.includes('id="k0f0"') && !h.includes('id="k0b0"'), "only the front copy is drawn");
  assert.match(h, /tl\.to\("#k0f0",\{opacity:/, "it fades at the sides instead of swapping layers");
});

test("head_box finds the head at the top of the cutout", { skip }, () => {
  const c = makeReel([{ type: "title", start: 0.5, end: 3, text: "x", layer: "behind" }]);
  assert.equal(build(c).status, 0);
  const r = run("python3", ["-c", `import sys, json; sys.path.insert(0, ${JSON.stringify(scripts)}); import cutout; print(json.dumps(cutout.head_box(${JSON.stringify(c.reel)}, 0.5, 3)))`]);
  assert.equal(r.status, 0, r.stderr);
  const b = JSON.parse(r.stdout);
  assert.ok(Math.abs(b.cx - 540) <= 20, `centred (cx ${b.cx})`);
  assert.ok(Math.abs(b.top - 1920 * 0.22) <= 40, `top of the oval (top ${b.top})`);   // oval centre 0.55 H, radius 0.33 H
  assert.ok(b.w > 100 && b.w < 700 && b.h > b.w, `a plausible head (w ${b.w}, h ${b.h})`);
});

test("a call-to-action's CAPS word stays readable: a highlight too close to the pill colour becomes a marker behind dark text", { skip }, () => {
  const c = makeReel([{ type: "cta", start: 0.5, end: 3, text: "comment MOVE now" }], { matte: null });   // this fixture's brand: sage on cream
  assert.equal(build(c).status, 0);
  assert.match(html(c), /<span style="background:#B9C8A5;color:#0d2b2d;[^"]*">MOVE<\/span>/);
  fs.writeFileSync(path.join(c.home, "brand.json"), JSON.stringify({ colors: { main: "#1A1A1A", pop: "#C8102E", light: "#FFF6EE" }, sfx: "none" }));
  assert.equal(build(c).status, 0);
  assert.match(html(c), /<span style="color:#C8102E">MOVE<\/span>/, "a strong highlight colour is used as before");
});

test("a popup can be a video clip: a silent 30 fps window that starts where asked, holds its last frame or loops", { skip }, () => {
  const c = makeReel([], { matte: null });
  fs.mkdirSync(path.join(c.reel, "popups"), { recursive: true });
  ff(["-f", "lavfi", "-i", "testsrc2=s=300x650:r=60:d=2", "-f", "lavfi", "-i", "sine=f=330:d=2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(c.reel, "popups", "screen.mp4")]);
  const edit = JSON.parse(fs.readFileSync(path.join(c.reel, "edit.json"), "utf8"));
  edit.cards = [{ type: "popup", src: "popups/screen.mp4", start: 0.5, end: 3.5, from: 0.5 }, { type: "popup", src: "popups/screen.mp4", start: 0.5, end: 3.5, loop: true, pos: "top-right", size: 300 }];
  fs.writeFileSync(path.join(c.reel, "edit.json"), JSON.stringify(edit));
  const r = build(c); assert.equal(r.status, 0, r.stdout + r.stderr);
  const h = html(c);
  assert.match(h, /class="pop vclip" style="left:320px;top:483px;width:440px;height:953px"><video id="k0v" src="img\/0_screen\.mp4" muted playsinline data-start="0\.5" data-duration="3\.0"/, "0.16.0: in the middle, 440 wide by default");
  assert.match(h, /class="pop vclip" style="left:720px;top:150px;width:300px/);
  assert.doesNotMatch(h, /class="pop clip"/, "the name clip belongs to HyperFrames' own timed elements, which are never hidden at the start");
  for (const f of ["0_screen.mp4", "1_screen.mp4"]) {
    const info = run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,r_frame_rate:format=duration", "-of", "csv=p=0", path.join(c.reel, "proj", "img", f)]).stdout.trim().split("\n");
    assert.equal(info[0], "video,30/1", f + " is 30 fps with no sound"); assert.ok(Math.abs(Number(info.at(-1)) - 3.5) < 0.2, f + " lasts as long as it is on screen (3.5 s): " + info.at(-1));
  }
});

// 0.15.0: an SVG is a graphic too. It is copied as it is (sharp at any size) and sized from its own width, height or viewBox.
test("a popup or sticker can be an SVG file", { skip }, () => {
  const c = makeReel([], { matte: null });
  fs.mkdirSync(path.join(c.reel, "popups"), { recursive: true });
  fs.writeFileSync(path.join(c.reel, "popups", "logo.svg"), '<?xml version="1.0"?>\n<!-- <svg width="9"> -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#0d2b2d"/></svg>');
  fs.writeFileSync(path.join(c.reel, "popups", "notsvg.svg"), "hello");
  const edit = JSON.parse(fs.readFileSync(path.join(c.reel, "edit.json"), "utf8"));
  edit.cards = [{ type: "popup", src: "popups/logo.svg", start: 0.5, end: 2 }, { type: "sticker", src: "popups/logo.svg", start: 0.5, end: 2 }, { type: "popup", src: "popups/notsvg.svg", start: 2.5, end: 3.5 }];
  fs.writeFileSync(path.join(c.reel, "edit.json"), JSON.stringify(edit));
  const r = build(c); assert.equal(r.status, 0, r.stdout + r.stderr);
  const h = html(c);
  assert.match(h, /class="pop" style="left:360px;top:870px;width:360px;height:180px"><img src="img\/0_logo\.svg" \/>/, "2 to 1, from the viewBox, with no photo border, in the middle");
  assert.match(h, /class="stk"[^>]*><img src="img\/1_logo\.svg" \/>/);
  assert.match(r.stdout, /notsvg\.svg is not an SVG picture: skipped/);
  assert.equal(fs.readFileSync(path.join(c.reel, "proj", "img", "0_logo.svg"), "utf8"), fs.readFileSync(path.join(c.reel, "popups", "logo.svg"), "utf8"));
});

// 0.16.0: where a picture goes when nobody said. One sits in the middle; two on screen together sit side by side.
test("one picture popup sits in the middle, two at the same time sit side by side, and a place that was chosen is kept", { skip }, () => {
  const c = makeReel([], { matte: null });
  fs.mkdirSync(path.join(c.reel, "popups"), { recursive: true });
  ff(["-f", "lavfi", "-i", "color=c=red:s=400x200", "-frames:v", "1", path.join(c.reel, "popups", "a.png")]);
  const edit = JSON.parse(fs.readFileSync(path.join(c.reel, "edit.json"), "utf8"));
  edit.cards = [{ type: "popup", src: "popups/a.png", start: 0.5, end: 1.4 },
                { type: "popup", src: "popups/a.png", start: 1.5, end: 3, size: 700 }, { type: "popup", src: "popups/a.png", start: 2, end: 3.4 },
                { type: "popup", src: "popups/a.png", start: 2, end: 3, pos: "top-right" }];
  fs.writeFileSync(path.join(c.reel, "edit.json"), JSON.stringify(edit));
  const r = build(c); assert.equal(r.status, 0, r.stdout + r.stderr);
  const h = html(c);
  assert.match(h, /id="k0" class="pop" style="left:360px;top:870px;width:360px;height:180px"/, "alone: the middle of the screen");
  assert.match(h, /id="k1" class="pop" style="left:28px;top:835px;width:500px;height:250px"/, "left of the pair, held to 500 wide");
  assert.match(h, /id="k2" class="pop" style="left:552px;top:870px;width:360px;height:180px"/, "right of the pair");
  assert.match(h, /id="k3" class="pop" style="left:660px;top:150px;width:360px;height:180px"/, "a chosen place is not moved");
});

// audit 3: values a person or an assistant can leave in edit.json by hand must not crash a build.
test("a video clip or note with a missing, empty or impossible number still builds", { skip }, () => {
  const c = makeReel([], { matte: null });
  fs.mkdirSync(path.join(c.reel, "popups"), { recursive: true });
  ff(["-f", "lavfi", "-i", "testsrc2=s=300x650:r=30:d=2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", path.join(c.reel, "popups", "s.mp4")]);
  ff(["-f", "lavfi", "-i", "sine=f=330:d=1", "-c:a", "aac", path.join(c.reel, "popups", "soundonly.mp4")]);
  const edit = JSON.parse(fs.readFileSync(path.join(c.reel, "edit.json"), "utf8"));
  edit.cards = [{ type: "popup", src: "popups/s.mp4", start: 0.5, end: 2, from: null }, { type: "popup", src: "popups/s.mp4", start: 0.5, end: 2, from: "abc", size: "big" },
                { type: "popup", src: "popups/s.mp4", start: 0.5, end: 2, from: 99 }, { type: "popup", src: "popups/soundonly.mp4", start: 0.5, end: 2 },
                { type: "note", text: "hi", size: "abc", rotate: null, y: "top", start: 2.2, end: 3.2 }, { type: "note", start: 2.2, end: 3.2 }];
  fs.writeFileSync(path.join(c.reel, "edit.json"), JSON.stringify(edit));
  const r = build(c); assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /is 2\.0s long, so it can't start 99\.0s in: starting it at 0/); assert.match(r.stdout, /soundonly\.mp4 is not a picture or video this machine can read/);
  const h = html(c); assert.equal((h.match(/class="pop vclip"/g) || []).length, 3, "three clips built, the sound-only file left out"); assert.equal((h.match(/class="notew" style="top:210px"/g) || []).length, 2);
});
