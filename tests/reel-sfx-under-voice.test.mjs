// Added by By Mel Ross (0.25.0). Sound effects follow the voice: a quiet voice gets quieter effects, effects dip while
// the voice speaks, no effect peaks over the voice, and the touch-ups page sets how loud the effects are.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ff, meanDb, py, skipReason, tmp } from "./reel-helpers.mjs";

const review = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "3-editing", "reel-editor", "review");

// 12 s clip: "speech" (a modulated tone) at 0-3 s and 5.5-8 s; an effect lands mid-speech at 1.5 s and in the gap at 4.2 s.
function makeReel(voiceAmp, mix) {
  const dir = tmp("sfx-voice"), reel = path.join(dir, "reel"), home = path.join(dir, "home"), engine = path.join(dir, "engine");
  fs.mkdirSync(reel); fs.mkdirSync(home);
  const expr = `${voiceAmp}*sin(2*PI*180*t)*(0.6+0.4*sin(2*PI*5*t))*(lt(t,3)+between(t,5.5,8))+0.0005*sin(2*PI*50*t)`;
  ff(["-f", "lavfi", "-i", "color=c=gray:s=270x480:r=30:d=12", "-f", "lavfi", "-i", `aevalsrc='${expr}':s=48000:d=12`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(reel, "master.mp4")]);
  fs.copyFileSync(path.join(reel, "master.mp4"), path.join(reel, "final.mp4"));
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: { main: "#000", pop: "#fff" }, resolution: [270, 480], ...(mix ? { mix } : {}) }));
  fs.writeFileSync(path.join(reel, "edit.json"), "{}");
  fs.writeFileSync(path.join(reel, "sfx_events.json"), JSON.stringify([{ name: "ding", t: 1.5, db: -10 }, { name: "ding", t: 4.2, db: -10 }]));
  assert.equal(py("make_sfx.py", ["--out", path.join(engine, "sfx")]).status, 0);
  const r = py("mix_audio.py", [reel], { REELS_HOME: home, REEL_ENGINE: engine });
  assert.equal(r.status, 0, r.stderr);
  const out = path.join(reel, "final_ln.mp4");
  return { rep: JSON.parse(fs.readFileSync(path.join(reel, "mix_report.json"), "utf8")), out: r.stdout,
    // how far the effect lifts the mix above the voice alone, mid-speech; and the effect's level in the gap
    lift: meanDb(out, 1.5, 1.8) - meanDb(out, 2.3, 2.6), gap: meanDb(out, 4.2, 4.5), speech: meanDb(out, 2.3, 2.6) };
}

test("a quiet voice gets quieter effects, and the build says the voice is quiet", { skip: skipReason }, () => {
  const loud = makeReel(0.35), quiet = makeReel(0.04);
  assert.ok(quiet.rep.voice_lufs < -22, `quiet voice measured ${quiet.rep.voice_lufs}`);
  assert.ok(quiet.rep.effects_shift_db <= -6, `effects moved ${quiet.rep.effects_shift_db} dB for a quiet voice`);
  assert.ok(loud.rep.effects_shift_db > quiet.rep.effects_shift_db + 6);
  assert.match(quiet.out, /voice track is quiet/); assert.doesNotMatch(loud.out, /voice track is quiet/);
  // after the final loudness step, the effect stands out about as much over a quiet voice as over a normal one
  assert.ok(Math.abs((quiet.gap - quiet.speech) - (loud.gap - loud.speech)) < 4, `gap effect vs speech: quiet ${(quiet.gap - quiet.speech).toFixed(1)}, normal ${(loud.gap - loud.speech).toFixed(1)}`);
});

test("effects dip while the voice speaks and stay under it; the old behaviour is one switch away", { skip: skipReason }, () => {
  const on = makeReel(0.08), off = makeReel(0.08, { effects_follow_voice: false });
  assert.equal(on.rep.effects_duck_db, -6); assert.equal(off.rep.effects_follow_voice, false);
  assert.ok(off.lift - on.lift >= 4, `mid-speech the effect lifts the mix ${on.lift.toFixed(1)} dB now, ${off.lift.toFixed(1)} dB before`);
  assert.ok(on.lift < 3, `an effect mid-speech should sit under the voice (lifts it ${on.lift.toFixed(1)} dB)`);
  assert.ok(on.gap > -60, "the effect in the gap is still heard");
  assert.equal(on.rep.pass, true);
});

test("the louder/quieter setting still moves the effects", { skip: skipReason }, () => {
  const normal = makeReel(0.2), louder = makeReel(0.2, { effects: 4 }), quieter = makeReel(0.2, { effects: -6 });
  assert.ok(louder.gap - normal.gap > 2 && normal.gap - quieter.gap > 4, `${quieter.gap} < ${normal.gap} < ${louder.gap}`);
});

test("the touch-ups page has the effects volume and an update-the-sound-only button", () => {
  const ed = fs.readFileSync(path.join(review, "editor.html"), "utf8"), srv = fs.readFileSync(path.join(review, "editor-server.mjs"), "utf8");
  for (const t of ['data-a="sfx-vol"', "quieter", "louder", "How loud the sounds are", 'data-a="remix"', "dip while you talk"]) assert.ok(ed.includes(t), t);
  assert.match(srv, /"\/api\/sfx-volume"/); assert.match(srv, /"\/api\/remix"/); assert.match(srv, /soundOnly/);
});
