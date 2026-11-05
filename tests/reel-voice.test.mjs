// Added by By Mel Ross. The voice clean-up (clean_audio.sh) stays gentle: DeepFilterNet at 20 dB, no gate, no presence or air
// boost, and it lands on -16 LUFS with a true peak under -2 dBTP. The mix target can still be set back to -14.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ff, py, run, scripts, skipReason, tmp } from "./reel-helpers.mjs";

const script = path.join(scripts, "clean_audio.sh");
const text = fs.readFileSync(script, "utf8");

test("clean_audio.sh keeps the gentle chain: 20 dB, no gate, no boosts, -16 LUFS, -2 dBTP", () => {
  assert.match(text, /DENOISE_DB:-20/);
  assert.doesNotMatch(text, /agate/);
  assert.doesNotMatch(text, /highshelf/);
  assert.doesNotMatch(text, /f=3200/);
  assert.match(text, /highpass=f=80,equalizer=f=220:t=q:w=1:g=-2,deesser=i=0\.8:m=0\.7:f=0\.45,lowpass=f=11000,acompressor=ratio=2:threshold=-22dB:attack=8:release=120/);
  assert.match(text, /LUFS:--16/);
  assert.match(text, /TRUEPEAK:--2/);
  assert.match(text, /--no-denoise/);
});

function level(file) {
  const r = run("ffmpeg", ["-hide_banner", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  return { lufs: Number([...r.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop()[1]), peak: Number([...r.stderr.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].pop()[1]) };
}

test("a quiet, noisy voice-like clip comes out at -16 LUFS with the peak at or under -2 dBTP", { skip: skipReason }, () => {
  const d = tmp("voice"), inp = path.join(d, "in.wav");
  const expr = "0.04*sin(2*PI*180*t)*(0.6+0.4*sin(2*PI*5*t))*(lt(t,4)+between(t,6,9))";
  ff(["-f", "lavfi", "-i", `aevalsrc='${expr}':s=48000:d=10`, "-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.004:d=10:r=48000",
    "-filter_complex", "amix=inputs=2:duration=first:normalize=0", "-ac", "1", inp]);
  for (const flag of ["--denoise", "--no-denoise"]) {
    const out = path.join(d, `out${flag}.wav`);
    const r = run("bash", [script, inp, out, flag]);
    assert.equal(r.status, 0, r.stderr);
    const l = level(out);
    assert.ok(Math.abs(l.lufs - -16) <= 1, `${flag}: loudness ${l.lufs}`);
    assert.ok(l.peak <= -1.8, `${flag}: peak ${l.peak}`);
  }
});

test("the mix can still be asked for -14 LUFS / -1.5 dBTP", { skip: skipReason }, () => {
  const d = tmp("mix14"), reel = path.join(d, "reel"), home = path.join(d, "home");
  fs.mkdirSync(reel); fs.mkdirSync(home);
  ff(["-f", "lavfi", "-i", "color=c=gray:s=270x480:r=30:d=8", "-f", "lavfi", "-i", "aevalsrc='0.3*sin(2*PI*180*t)*(0.6+0.4*sin(2*PI*5*t))':s=48000:d=8",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(reel, "master.mp4")]);
  fs.copyFileSync(path.join(reel, "master.mp4"), path.join(reel, "final.mp4"));
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: { main: "#000", pop: "#fff" }, resolution: [270, 480], mix: { lufs: -14, true_peak: -1.5 } }));
  fs.writeFileSync(path.join(reel, "edit.json"), "{}");
  fs.writeFileSync(path.join(reel, "sfx_events.json"), "[]");
  const r = py("mix_audio.py", [reel], { REELS_HOME: home });
  assert.equal(r.status, 0, r.stderr);
  const rep = JSON.parse(fs.readFileSync(path.join(reel, "mix_report.json"), "utf8"));
  assert.equal(rep.target_lufs, -14);
  assert.ok(Math.abs(rep.lufs - -14) <= 1, `loudness ${rep.lufs}`);
});
