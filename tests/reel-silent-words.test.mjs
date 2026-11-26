// Added by By Mel Ross (0.34.6). Words the transcriber heard where the voice is silent are dropped, and named.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { ff, skill, skipReason, tmp } from "./reel-helpers.mjs";

const check = (wav, words) => {
  const r = spawnSync("python3", ["-c", `import json, sys; sys.path.insert(0, sys.argv[1]); import word_timing as W
k, d, why = W.silent_words(sys.argv[2], json.loads(sys.argv[3])); print(json.dumps({"kept": [w["text"] for w in k], "dropped": [w["text"] for w in d], "why": why}))`, path.join(skill, "scripts"), wav, JSON.stringify(words)], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout);
};
const w = (text, start, end) => ({ text, start, end });

test("silent words: words over silence are dropped, words over speech kept; no clear silence or too many means nothing dropped", { skip: skipReason }, () => {
  const dir = tmp("silent"), wav = path.join(dir, "v.wav"), loud = path.join(dir, "loud.wav");
  // voice at 1-2.5 s and 4-5.5 s, near-silence elsewhere (a little room noise)
  ff(["-f", "lavfi", "-i", "aevalsrc='0.5*sin(2*PI*220*t)*(between(t,1,2.5)+between(t,4,5.5))+0.0005*random(0)':s=16000:d=7", wav]);
  const r = check(wav, [w("so", 1.1, 1.4), w("here", 1.5, 1.9), w("ghost", 3.0, 3.4), w("is", 4.2, 4.5), w("the", 4.6, 4.8), w("point", 4.9, 5.3), w("phantom", 6.2, 6.6)]);
  assert.deepEqual(r.dropped, ["ghost", "phantom"]); assert.deepEqual(r.kept, ["so", "here", "is", "the", "point"]);
  ff(["-f", "lavfi", "-i", "aevalsrc='0.5*sin(2*PI*220*t)':s=16000:d=4", loud]);
  assert.match(check(loud, [w("a", 0.5, 0.8), w("b", 1, 1.3)]).why, /no clear silence/);
  const many = check(wav, [w("x", 0.1, 0.4), w("y", 3.0, 3.3), w("z", 6.0, 6.3), w("ok", 1.2, 1.5)]);
  assert.deepEqual(many.dropped, []); assert.match(many.why, /too many to trust/);
});
