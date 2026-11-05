// Added by By Mel Ross. Colour: iPhone HDR clips are detected and converted to standard colour (macOS avconvert) before the cut,
// the fallback says plainly that colour is approximate, and every video the editor encodes is labelled BT.709.
// Uses tiny synthetic clips made with ffmpeg; the real conversion test only runs on a Mac.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { ff, py, run, scripts, skipReason, tmp } from "./reel-helpers.mjs";

const isMac = process.platform === "darwin" && spawnSync("which", ["avconvert"]).status === 0;

/** A 2 s 270x480 clip carrying the given colour tags (only the tags matter for detection). */
function clip(dir, name, tags) {
  const out = path.join(dir, name);
  const set = [];   // the tags go on the frames (setparams) as well as on the encoder, so every ffmpeg build writes the full set
  const t = (flag) => tags[tags.indexOf(flag) + 1];
  if (tags.length) set.push("-vf", `setparams=colorspace=${t("-colorspace")}:color_primaries=${t("-color_primaries")}:color_trc=${t("-color_trc")}:range=tv`);
  ff(["-f", "lavfi", "-i", "testsrc2=s=270x480:r=30:d=2", "-f", "lavfi", "-i", "sine=f=220:d=2", ...set, "-c:v", "libx264", "-pix_fmt", "yuv420p", ...tags, "-c:a", "aac", "-shortest", out]);
  return out;
}
const HLG = ["-colorspace", "bt2020nc", "-color_primaries", "bt2020", "-color_trc", "arib-std-b67", "-color_range", "tv"];
const PQ = ["-colorspace", "bt2020nc", "-color_primaries", "bt2020", "-color_trc", "smpte2084", "-color_range", "tv"];
const BT2020_ONLY = ["-colorspace", "bt2020nc", "-color_primaries", "bt2020", "-color_trc", "bt709", "-color_range", "tv"];
const SDR = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];

const check = (file) => {
  const r = py("hdr2sdr.py", [file, "--check"]);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};
const tagsOf = (file) => {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=color_space,color_transfer,color_primaries,color_range", "-of", "json", file], { encoding: "utf8" });
  return JSON.parse(r.stdout).streams[0];
};
const expectBt709 = (file) => {
  const t = tagsOf(file);
  assert.deepEqual([t.color_space, t.color_transfer, t.color_primaries, t.color_range], ["bt709", "bt709", "bt709", "tv"], `${path.basename(file)} is labelled BT.709`);
};

test("HDR is detected from the colour tags: HLG, PQ, or BT.2020 primaries; standard and untagged clips are not", { skip: skipReason }, () => {
  const d = tmp("colour-detect");
  assert.equal(check(clip(d, "hlg.mp4", HLG)).hdr, true, "HLG");
  assert.equal(check(clip(d, "pq.mp4", PQ)).hdr, true, "PQ");
  assert.equal(check(clip(d, "wide.mp4", BT2020_ONLY)).hdr, true, "BT.2020 primaries");
  assert.equal(check(clip(d, "sdr.mp4", SDR)).hdr, false, "BT.709");
  assert.equal(check(clip(d, "plain.mp4", [])).hdr, false, "untagged");
});

test("the size is read as displayed: a clip with a 90 degree rotation flag swaps width and height", { skip: skipReason }, (t) => {
  const d = tmp("colour-rot"), base = clip(d, "base.mp4", HLG), rot = path.join(d, "rot.mp4");
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-display_rotation:v", "90", "-i", base, "-c", "copy", rot], { encoding: "utf8" });
  if (r.status !== 0) return t.skip("this ffmpeg can't write a rotation flag");
  const p = check(rot);
  assert.deepEqual([p.w, p.h], [480, 270]);
});

test("a standard clip is used as it is: nothing converted, nothing copied", { skip: skipReason }, () => {
  const d = tmp("colour-sdr"), src = clip(d, "sdr.mp4", SDR), reel = path.join(d, "reel");
  fs.mkdirSync(reel);
  const code = `import sys, json; sys.path.insert(0, ${JSON.stringify(scripts)}); import hdr2sdr
p, info = hdr2sdr.working_source(sys.argv[1], sys.argv[2]); print(json.dumps([str(p), info]))`;
  const r = run("python3", ["-c", code, src, reel]);
  assert.equal(r.status, 0, r.stderr);
  const [p, info] = JSON.parse(r.stdout);
  assert.equal(p, src);
  assert.equal(info.hdr, false);
  assert.equal(info.converted, false);
  assert.deepEqual(fs.readdirSync(reel), [], "no file was made in the reel folder");
});

/** A one-clip reel folder ready for cut.py. */
function reelWith(src, name) {
  const dir = tmp("colour-reel"), reel = path.join(dir, "reel"), home = path.join(dir, "home");
  fs.mkdirSync(reel); fs.mkdirSync(home);
  fs.copyFileSync(src, path.join(reel, name));
  ff(["-i", src, "-vn", "-ac", "1", "-ar", "48000", path.join(reel, "voice.wav")]);
  fs.writeFileSync(path.join(reel, "edl.json"), JSON.stringify({ source: name, audio: "voice.wav", keep: [[0, 1.8]] }));
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ resolution: [1080, 1920], enhance: { background: 0 } }));
  return { reel, home, env: { REELS_HOME: home, REEL_NO_NICE: "1" } };
}

test("without avconvert an HDR clip is used as it is and the build says the colour is only approximate", { skip: skipReason }, () => {
  const d = tmp("colour-fallback"), src = clip(d, "hlg.mp4", HLG), c = reelWith(src, "hlg.mp4");
  const r = py("cut.py", [c.reel], { ...c.env, REEL_NO_AVCONVERT: "1" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /colour is only approximate/);
  const info = JSON.parse(fs.readFileSync(path.join(c.reel, "enhance.json"), "utf8"));
  assert.match(info.source_colour, /only approximate/);
  assert.ok(!fs.existsSync(path.join(c.reel, "source_sdr.mp4")), "no converted copy was made");
  expectBt709(path.join(c.reel, "master.mp4"));
});

test("cut.py labels the master BT.709 (a standard clip, nothing else changes)", { skip: skipReason }, () => {
  const d = tmp("colour-cut"), src = clip(d, "sdr.mp4", SDR), c = reelWith(src, "sdr.mp4");
  const r = py("cut.py", [c.reel], c.env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  expectBt709(path.join(c.reel, "master.mp4"));
  assert.doesNotMatch(r.stdout, /approximate/);
});

test("deliver.sh labels the full-quality copy and the phone copy BT.709", { skip: skipReason || process.platform === "win32" }, () => {
  const d = tmp("colour-deliver"), src = clip(d, "final.mp4", []), reel = tmp("colour-deliver-reel"), out = path.join(d, "out");
  fs.copyFileSync(src, path.join(reel, "final.mp4"));
  ff(["-f", "lavfi", "-i", "testsrc2=s=1080x1920:d=1", "-frames:v", "1", path.join(reel, "cover.jpg")]);
  const home = tmp("colour-deliver-home");
  fs.writeFileSync(path.join(home, "brand.json"), "{}");
  const r = run("bash", [path.join(scripts, "deliver.sh"), path.join(reel, "final.mp4"), "t", "--to", out], { REELS_HOME: home });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  expectBt709(path.join(out, "t.mp4"));
  expectBt709(path.join(out, "t (phone).mp4"));
});

test("on a Mac, an HDR clip is converted: BT.709 H.264, same size, same length, sound kept", { skip: skipReason || (isMac ? false : "needs macOS avconvert") }, (t) => {
  // avconvert only tone-maps real HDR video (HEVC, 10-bit), so make one: Apple's encoder, 10-bit HEVC tagged HLG
  const d = tmp("colour-convert"), src = path.join(d, "hlg.mov");
  const made = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=270x480:r=30:d=2", "-f", "lavfi", "-i", "sine=f=220:d=2",
    "-vf", "setparams=colorspace=bt2020nc:color_primaries=bt2020:color_trc=arib-std-b67:range=tv,format=yuv420p10le", "-c:v", "hevc_videotoolbox", "-profile:v", "main10", "-tag:v", "hvc1", "-b:v", "2M",
    "-colorspace", "bt2020nc", "-color_primaries", "bt2020", "-color_trc", "arib-std-b67", "-color_range", "tv", "-c:a", "aac", "-shortest", src], { encoding: "utf8" });
  if (made.status !== 0) return t.skip("this ffmpeg has no Apple HEVC encoder, so there is no HDR clip to convert");
  const c = reelWith(src, "hlg.mov");
  const r = py("cut.py", [c.reel], c.env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const sdr = path.join(c.reel, "source_sdr.mp4");
  assert.ok(fs.existsSync(sdr), "converted copy exists");
  const meta = JSON.parse(fs.readFileSync(path.join(c.reel, "source_color.json"), "utf8"));
  assert.equal(meta.converted, true);
  assert.equal(meta.method, "avconvert");
  expectBt709(sdr);
  const p = check(sdr);
  assert.deepEqual([p.w, p.h, p.codec, p.audio], [270, 480, "h264", true]);
  assert.ok(Math.abs(p.duration - 2) < 0.25, `length ${p.duration}`);
  expectBt709(path.join(c.reel, "master.mp4"));
  // a second cut reuses the converted copy instead of converting again
  const before = fs.statSync(sdr).mtimeMs;
  const r2 = py("cut.py", [c.reel], c.env);
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  assert.equal(fs.statSync(sdr).mtimeMs, before);
});
