// Added by By Mel Ross (0.38.5). The clip check says what the edit will do about the clip's format before the edit starts:
// no sound stops it, a changing frame rate and HDR are named with what happens, a normal clip passes.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { ff, skill, skipReason, tmp } from "./reel-helpers.mjs";

const check = (clip) => {
  const r = spawnSync("python3", [path.join(skill, "scripts", "framing_check.py"), clip, "--json"], { encoding: "utf8", env: { ...process.env, REEL_FRAMING_NO_FACES: "1" } });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout.trim().split("\n").pop());
  return { ...j, format: j.checks.find((c) => c.id === "format") };
};

test("format check: no sound, a changing frame rate, HDR, and a plain clip", { skip: skipReason }, () => {
  const d = tmp("fmt"), clip = (n) => path.join(d, n);
  ff(["-f", "lavfi", "-i", "color=c=gray:s=540x960:r=30:d=5", "-c:v", "libx264", "-pix_fmt", "yuv420p", clip("silent.mp4")]);
  ff(["-f", "lavfi", "-i", "color=c=gray:s=540x960:r=30:d=5", "-f", "lavfi", "-i", "sine=d=5", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", clip("plain.mp4")]);
  ff(["-f", "lavfi", "-i", "color=c=gray:s=540x960:r=30:d=5", "-f", "lavfi", "-i", "sine=d=5", "-vf", "setpts='if(lt(T,2),PTS,PTS*1.6)'", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-fps_mode", "vfr", clip("vfr.mp4")]);
  ff(["-f", "lavfi", "-i", "color=c=gray:s=540x960:r=30:d=5", "-f", "lavfi", "-i", "sine=d=5", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-color_primaries", "bt2020", "-color_trc", "arib-std-b67", "-colorspace", "bt2020nc", "-c:a", "aac", "-shortest", clip("hdr.mp4")]);
  const silent = check(clip("silent.mp4"));
  assert.equal(silent.verdict, "retake"); assert.equal(silent.format.state, "retake"); assert.match(silent.format.detail, /no sound/);
  const plain = check(clip("plain.mp4"));
  assert.equal(plain.format.state, "pass"); assert.match(plain.format.detail, /H264, steady frame rate, standard color, with sound/);
  const vfr = check(clip("vfr.mp4"));
  assert.equal(vfr.format.state, "note"); assert.match(vfr.format.detail, /frame rate changes .* evens it to 30/);
  const hdr = check(clip("hdr.mp4"));
  assert.equal(hdr.format.state, "note"); assert.match(hdr.format.detail, /HDR color: it's converted to standard color when the cut is made/);
});
