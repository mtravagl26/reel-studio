// Added by By Mel Ross. The final mix: three levels, music that dips under the voice and rises in the gaps, effects placed
// where asked, final loudness -14 LUFS, true peak under the limit, no clipping.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ff, meanDb, py, run, skipReason, tmp } from "./reel-helpers.mjs";

// 12 s clip: "speech" (a modulated tone) at 0-3 s and 5.5-8 s, silence in between and at the end.
function makeReel(voiceAmp = 0.35, events = []) {
  const dir = tmp("mix"), reel = path.join(dir, "reel"), home = path.join(dir, "home"), engine = path.join(dir, "engine");
  fs.mkdirSync(reel); fs.mkdirSync(home);
  const expr = `${voiceAmp}*sin(2*PI*180*t)*(0.6+0.4*sin(2*PI*5*t))*(lt(t,3)+between(t,5.5,8))+0.003*sin(2*PI*50*t)`;
  ff(["-f", "lavfi", "-i", "color=c=gray:s=270x480:r=30:d=12", "-f", "lavfi", "-i", `aevalsrc='${expr}':s=48000:d=12`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(reel, "master.mp4")]);
  fs.copyFileSync(path.join(reel, "master.mp4"), path.join(reel, "final.mp4"));
  const music = path.join(dir, "music.wav");
  ff(["-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.4:d=15", "-ac", "2", music]);
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: { main: "#000", pop: "#fff" }, music, resolution: [270, 480] }));
  fs.writeFileSync(path.join(reel, "edit.json"), "{}");
  fs.writeFileSync(path.join(reel, "sfx_events.json"), JSON.stringify(events));
  assert.equal(py("make_sfx.py", ["--out", path.join(engine, "sfx")]).status, 0);
  return { dir, reel, home, engine, music };
}
const mix = (c, extra = []) => py("mix_audio.py", [c.reel, "--stems-dir", path.join(c.dir, "stems"), ...extra], { REELS_HOME: c.home, REEL_ENGINE: c.engine });

test("mix: final loudness -14 LUFS, true peak under the limit, no clipping", { skip: skipReason }, () => {
  const c = makeReel(0.35, [{ name: "ding", t: 4.0, db: -8 }, { name: "pop-soft", t: 9.0, db: -9 }]);
  const r = mix(c);
  assert.equal(r.status, 0, r.stderr);
  const rep = JSON.parse(fs.readFileSync(path.join(c.reel, "mix_report.json"), "utf8"));
  assert.ok(Math.abs(rep.lufs - -14) <= 1, `loudness ${rep.lufs}`);
  assert.ok(rep.true_peak_db <= -1.0, `true peak ${rep.true_peak_db}`);
  assert.equal(rep.clipped_samples, 0);
  assert.equal(rep.pass, true);
  assert.equal(rep.effects, 2);
  assert.ok(fs.existsSync(path.join(c.reel, "final_ln.mp4")));
});

test("mix: a very hot voice with music and effects still doesn't clip", { skip: skipReason }, () => {
  const c = makeReel(0.98, [{ name: "impact-hit", t: 1.0, db: 0 }, { name: "ding", t: 2.0, db: 0 }, { name: "rise", t: 5.8, db: 0 }]);
  const r = mix(c);
  assert.equal(r.status, 0, r.stderr);
  const rep = JSON.parse(fs.readFileSync(path.join(c.reel, "mix_report.json"), "utf8"));
  assert.ok(rep.true_peak_db <= -1.0, `true peak ${rep.true_peak_db}`);
  assert.equal(rep.clipped_samples, 0);
  assert.ok(Math.abs(rep.lufs - -14) <= 1, `loudness ${rep.lufs}`);
});

test("mix: the music dips while the voice speaks and rises in the gaps", { skip: skipReason }, () => {
  const c = makeReel();
  assert.equal(mix(c).status, 0);
  const music = path.join(c.dir, "stems", "music_ducked.wav");
  const speaking = meanDb(music, 0.8, 2.6), gap = meanDb(music, 3.8, 5.0), gap2 = meanDb(music, 9.0, 11.0);
  assert.ok(gap - speaking >= 7, `music is only ${(gap - speaking).toFixed(1)} dB lower while speaking (${speaking} vs ${gap})`);
  assert.ok(gap2 - speaking >= 7, `music doesn't come back after the second line (${gap2} vs ${speaking})`);
  const rep = JSON.parse(fs.readFileSync(path.join(c.reel, "mix_report.json"), "utf8"));
  assert.equal(rep.music_under_voice_lu, rep.music_gap_level_lu + -10);
});

test("mix: the three levels are real (voice, music, effects each move the mix)", { skip: skipReason }, () => {
  const c = makeReel(0.35, [{ name: "ding", t: 4.0, db: -6 }]);
  const stems = path.join(c.dir, "stems");
  assert.equal(mix(c).status, 0);
  // effects stem: sound at the event time, silence elsewhere
  assert.ok(meanDb(path.join(stems, "sfx.wav"), 4.0, 4.4) > -45, "the ding is in the effects stem at 4.0 s");
  assert.ok(meanDb(path.join(stems, "sfx.wav"), 1.0, 2.0) < -80, "no effect where none was asked");
  const quiet = meanDb(path.join(stems, "music_ducked.wav"), 3.8, 5.0);
  fs.writeFileSync(path.join(c.home, "brand.json"), JSON.stringify({ colors: { main: "#000", pop: "#fff" }, music: c.music, resolution: [270, 480], mix: { music: -24 } }));
  assert.equal(mix(c).status, 0);
  const quieter = meanDb(path.join(stems, "music_ducked.wav"), 3.8, 5.0);
  assert.ok(quiet - quieter >= 8, `a music setting 10 dB lower should show (${quiet} vs ${quieter})`);
});

test("mix without music or effects still normalises the voice", { skip: skipReason }, () => {
  const c = makeReel();
  fs.writeFileSync(path.join(c.home, "brand.json"), JSON.stringify({ colors: { main: "#000", pop: "#fff" }, resolution: [270, 480] }));
  const r = mix(c);
  assert.equal(r.status, 0, r.stderr);
  const rep = JSON.parse(fs.readFileSync(path.join(c.reel, "mix_report.json"), "utf8"));
  assert.equal(rep.music, false);
  assert.ok(Math.abs(rep.lufs - -14) <= 1);
});

test("qa.py passes the mixed reel and fails a reel whose peak is over the limit", { skip: skipReason }, () => {
  const c = makeReel();
  assert.equal(mix(c).status, 0);
  const ok = py("qa.py", [c.reel, "final_ln.mp4"], { REELS_HOME: c.home });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /peak\s+-?[\d.]+ dBTP/);
  // a loud, un-limited file: its peak is over -1 dBTP, so qa must say so
  ff(["-i", path.join(c.reel, "master.mp4"), "-af", "volume=14dB,alimiter=limit=1:level=disabled", "-c:v", "copy", path.join(c.reel, "hot.mp4")]);
  const bad = py("qa.py", [c.reel, "hot.mp4"], { REELS_HOME: c.home });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stdout, /FAIL/);
});
