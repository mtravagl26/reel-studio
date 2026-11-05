// Added by By Mel Ross. The studio look: gentle, natural, adjustable, on by default, with a before/after frame.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ff, py, readWav, run, scripts, skipReason, tmp } from "./reel-helpers.mjs";

function filtersFor(color, brand = {}, edl = null) {
  const dir = tmp("look");
  const clip = path.join(dir, "clip.mp4");
  ff(["-f", "lavfi", "-i", `color=c=${color}:s=270x480:r=30:d=3`, "-c:v", "libx264", "-pix_fmt", "yuv420p", clip]);
  const code = `import sys, json; sys.path.insert(0, ${JSON.stringify(scripts)}); import enhance
pre, post, info = enhance.filters(${JSON.stringify(clip)}, [[0, 3]], json.loads(sys.argv[1]), json.loads(sys.argv[2]))
print(json.dumps([pre, post, info]))`;
  const r = run("python3", ["-c", code, JSON.stringify(brand), JSON.stringify(edl)]);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
const lift = (info) => info.lift;

test("studio look is on by default and gentle", { skip: skipReason }, () => {
  const [pre, post, info] = filtersFor("0x707070");
  assert.equal(info.on, true);
  const all = [...pre, ...post].join(",");
  assert.match(all, /hqdn3d/); assert.match(all, /eq=/); assert.match(all, /unsharp/);
  assert.doesNotMatch(all, /bilateral|smartblur|nlmeans|gblur|avgblur|boxblur/, "no skin smoothing: natural, not plastic");
  const hq = all.match(/hqdn3d=([\d.]+):([\d.]+):([\d.]+):([\d.]+)/).slice(1).map(Number);
  assert.ok(hq[0] <= 2 && hq[2] <= 3, "denoise stays mild");
  const sharp = Number(all.match(/unsharp=5:5:([\d.]+)/)[1]);
  assert.ok(sharp <= 0.4, "sharpening stays mild");
  assert.match(all, /unsharp=5:5:[\d.]+:5:5:0\.0/, "sharpens brightness only, not colour");
  const sat = Number(all.match(/saturation=([\d.]+)/)[1]), con = Number(all.match(/contrast=([\d.]+)/)[1]);
  assert.ok(sat <= 1.1 && con <= 1.1, "colour moves a little, not a lot");
});

test("exposure nudges toward the middle, by a bounded step", { skip: skipReason }, () => {
  const dark = lift(filtersFor("0x303030")[2]), bright = lift(filtersFor("0xd8d8d8")[2]);
  assert.ok(dark > 0 && dark <= 0.05, `dark clip lifted by ${dark}`);
  assert.ok(bright < 0 && bright >= -0.04, `bright clip lowered by ${bright}`);
});

test("each part is adjustable and the whole look can be switched off", { skip: skipReason }, () => {
  const [offPre, offPost, offInfo] = filtersFor("0x707070", { enhance: { on: false } });
  assert.deepEqual([offPre, offPost, offInfo.on], [[], [], false]);
  const noDenoise = filtersFor("0x707070", { enhance: { denoise: 0 } });
  assert.doesNotMatch([...noDenoise[0], ...noDenoise[1]].join(","), /hqdn3d/);
  const noSharp = filtersFor("0x707070", { enhance: { sharpen: 0 } });
  assert.doesNotMatch([...noSharp[0], ...noSharp[1]].join(","), /unsharp/);
  const base = Number(filtersFor("0x707070")[1][0].match(/unsharp=5:5:([\d.]+)/)[1]);
  const doubled = Number(filtersFor("0x707070", { enhance: { strength: 2 } })[1][0].match(/unsharp=5:5:([\d.]+)/)[1]);
  assert.ok(Math.abs(doubled - 2 * base) < 0.01, "strength scales the amounts");
  const reel = filtersFor("0x707070", {}, { enhance: { sharpen: 0 } });   // a reel can override
  assert.doesNotMatch([...reel[0], ...reel[1]].join(","), /unsharp/);
});

test("the chosen filters run and change the picture only a little", { skip: skipReason }, () => {
  const dir = tmp("look-run");
  const src = path.join(dir, "in.mp4"), out = path.join(dir, "out.mp4");
  ff(["-f", "lavfi", "-i", "testsrc2=s=270x480:r=30:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", src]);
  const [pre, post] = filtersFor("0x707070");
  ff(["-i", src, "-vf", [...pre, "scale=270:480", ...post].join(","), "-c:v", "libx264", "-pix_fmt", "yuv420p", out]);
  const mean = (f) => Number(run("ffmpeg", ["-hide_banner", "-i", f, "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", "-f", "null", "-"]).stdout.match(/YAVG=([\d.]+)/)[1]);
  assert.ok(Math.abs(mean(out) - mean(src)) <= 14, "average brightness moves by less than 14 of 255");
});

function makeCut(brand) {
  const dir = tmp("cut"), reel = path.join(dir, "reel"), home = path.join(dir, "home");
  fs.mkdirSync(reel); fs.mkdirSync(home);
  ff(["-f", "lavfi", "-i", "testsrc2=s=270x480:r=30:d=3", "-f", "lavfi", "-i", "sine=f=220:d=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(reel, "raw.mp4")]);
  ff(["-f", "lavfi", "-i", "sine=f=220:d=3", path.join(reel, "voice.wav")]);
  fs.writeFileSync(path.join(reel, "edl.json"), JSON.stringify({ source: "raw.mp4", audio: "voice.wav", keep: [[0.2, 2.8]] }));
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: { main: "#000", pop: "#fff" }, resolution: [270, 480], pacing: "natural", ...brand }));
  return { reel, home };
}

test("cut.py applies the look by default and writes a before/after frame", { skip: skipReason }, () => {
  const c = makeCut({});
  const r = py("cut.py", [c.reel], { REELS_HOME: c.home, REEL_NO_NICE: "1", REEL_NO_CUTOUT: "1" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(fs.readFileSync(path.join(c.reel, "cut_filter.txt"), "utf8"), /hqdn3d/);
  const info = JSON.parse(fs.readFileSync(path.join(c.reel, "enhance.json"), "utf8"));
  assert.equal(info.on, true);
  assert.match(info.background, /skipped/, "no cutout here, so the background blur is skipped and says so");
  const jpg = path.join(c.reel, "enhance_before_after.jpg");
  assert.ok(fs.existsSync(jpg), "before/after frame");
  const size = run("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", jpg]).stdout.trim();
  assert.equal(size, "1080,960");
  assert.ok(fs.existsSync(path.join(c.reel, "master.mp4")));
});

test("cut.py with the look switched off leaves the filters out", { skip: skipReason }, () => {
  const c = makeCut({ enhance: { on: false } });
  const r = py("cut.py", [c.reel], { REELS_HOME: c.home, REEL_NO_NICE: "1", REEL_NO_CUTOUT: "1" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(fs.readFileSync(path.join(c.reel, "cut_filter.txt"), "utf8"), /hqdn3d|unsharp/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(c.reel, "enhance.json"), "utf8")).on, false);
  assert.ok(!fs.existsSync(path.join(c.reel, "enhance_before_after.jpg")));
});
