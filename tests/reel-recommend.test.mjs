// Added by By Mel Ross (0.34.0). 3 recommended looks for a clip, from what it shows and what is said, each with its reason.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ff, skill, skipReason, tmp } from "./reel-helpers.mjs";

// a stand-in presenter: a wall, a head and a top of the given grays
function clip(dir, top, wall) {
  const f = path.join(dir, `p-${top}-${wall}.mp4`);
  const g = (v) => `0x${v.toString(16).padStart(2, "0").repeat(3)}`;
  ff(["-f", "lavfi", "-i", `color=c=${g(wall)}:s=270x480:d=6`, "-f", "lavfi", "-i", `color=c=${g(top)}:s=200x260:d=6`, "-f", "lavfi", "-i", "color=c=0xd6aa8c:s=90x110:d=6",
    "-filter_complex", "[0][1]overlay=35:220[a];[a][2]overlay=90:90", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-t", "6", f]);
  return f;
}
const rec = (src, env = {}, args = []) => {
  const r = spawnSync("python3", [path.join(skill, "scripts", "recommend.py"), src, ...args], { encoding: "utf8", env: { ...process.env, REEL_TEST_HEAD: "0.19,0.22,0.5", ...env } });
  assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout);
};
const ids = (o) => o.picks.map((p) => p.id);

test("recommend: the theme follows the top and the wall; every pick has a name and a plain reason, no IDs in it", { skip: skipReason }, () => {
  const dir = tmp("recommend");
  const white = rec(clip(dir, 245, 200)), dark = rec(clip(dir, 30, 220)), dim = rec(clip(dir, 120, 40));
  assert.equal(white.picks[0].id, "bold"); assert.match(white.picks[0].why, /Your top is light/);
  assert.equal(dark.picks[0].id, "minimal"); assert.match(dark.picks[0].why, /top is dark and your wall is light/);
  assert.equal(dim.picks[0].id, "editorial"); assert.match(dim.picks[0].why, /dark side/);
  for (const o of [white, dark, dim]) {
    assert.equal(o.picks.length, 3);
    for (const p of o.picks) { assert.ok(p.name && p.why, JSON.stringify(p)); assert.doesNotMatch(p.why + p.name, /\b[HCL]\d{1,2}\b/, "no IDs in what the person reads"); }
    assert.match(o.checked.join(" "), /your top looks/);
  }
  assert.deepEqual(ids(white).slice(1), ["L23", "L16"], "room above the head: a big title; graphics on: a numbered card");
  assert.equal(ids(rec(clip(dir, 245, 200), {}, ["--style", "simple"]))[2], "L21", "a simple reel ends on a comment keyword");
  const low = rec(clip(dir, 245, 200), { REEL_TEST_HEAD: "0.04,0.22,0.5" });
  assert.equal(ids(low)[1], "L22"); assert.match(low.checked.join(" "), /only a little room above your head/);
});

test("recommend: what is said picks the hook and the layout, quoted back in the reason", { skip: skipReason }, () => {
  const dir = tmp("recommend-said");
  const reel = (said) => { const r = path.join(dir, said.slice(0, 8).replace(/\W/g, "_")); fs.mkdirSync(r); fs.copyFileSync(clip(dir, 30, 220), path.join(r, "master.mp4"));
    fs.writeFileSync(path.join(r, "master_transcript.json"), JSON.stringify(said.split(" ").map((w, k) => ({ text: w, start: k * 0.3, end: k * 0.3 + 0.25 })))); return r; };
  const list = rec(reel("here are 3 tools I use every day"));
  assert.deepEqual(ids(list), ["minimal", "H17", "L16"]); assert.match(list.picks[1].why, /"3 tools"/); assert.match(list.checked.join(" "), /what you say/);
  assert.deepEqual(ids(rec(reel("I saved 12 hours a week with this"))).slice(1), ["H6", "L8"]);
  const dont = rec(reel("please don't post at night"));
  assert.equal(ids(dont)[2], "L6"); assert.match(dont.picks[2].why, /what not to do/);
  // no clip: a plain error
  const r = spawnSync("python3", [path.join(skill, "scripts", "recommend.py"), path.join(dir, "nothing")], { encoding: "utf8" });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /no clip to look at/);
});
