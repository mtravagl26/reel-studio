// Added by By Mel Ross. The reel editor's sound-effects library: every effect is generated, listed with its source and
// license, and the manifest matches the generator.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { py, readWav, skill, skipReason, tmp } from "./reel-helpers.mjs";

const committed = JSON.parse(fs.readFileSync(path.join(skill, "assets", "sfx-manifest.json"), "utf8")).effects;

test("sfx manifest: 40 unique effects, each with a source and a license, none third-party", () => {
  assert.equal(committed.length, 40);
  assert.equal(new Set(committed.map((e) => e.name)).size, 40);
  for (const e of committed) {
    assert.match(e.name, /^[a-z]+(-[a-z]+)*$/);
    assert.ok(e.source && e.license && e.description && e.category, `${e.name} is missing a field`);
    assert.equal(e.third_party, false, `${e.name} must not be third-party material`);
    assert.ok(Number.isInteger(e.gain_db) && Math.abs(e.gain_db) <= 12, `${e.name} default level out of range`);
  }
  for (const legacy of ["whoosh", "swish", "pop", "snap", "chime", "typing"]) {
    assert.ok(committed.some((e) => e.name === legacy), `the original effect ${legacy} must stay in the library`);
  }
  for (const name of ["whoosh-fast", "pop-soft", "finger-snap", "impact-hit", "rise", "ding", "typing-keys", "paper-rustle", "glitch"]) {
    assert.ok(committed.some((e) => e.name === name), `${name} is in the library`);
  }
});

test("sfx manifest matches the generator", { skip: skipReason }, () => {
  const out = path.join(tmp("sfx"), "manifest.json");
  const r = py("make_sfx.py", ["--manifest", out]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, "utf8")).effects, committed);
});

test("sfx generator writes 34 clean 48 kHz mono WAVs at -1 dBFS, deterministically", { skip: skipReason }, () => {
  const a = tmp("sfx-a"), b = tmp("sfx-b");
  assert.equal(py("make_sfx.py", ["--out", a]).status, 0);
  assert.equal(py("make_sfx.py", ["--out", b]).status, 0);
  const files = fs.readdirSync(a).filter((f) => f.endsWith(".wav"));
  assert.equal(files.length, 34);
  for (const f of files) {
    const w = readWav(path.join(a, f));
    assert.equal(w.tag, 1); assert.equal(w.bits, 16); assert.equal(w.channels, 1); assert.equal(w.rate, 48000);
    const peak = Math.max(...Array.from(w.samples, Math.abs)) / 32768;
    assert.ok(Math.abs(20 * Math.log10(peak) + 1) < 0.1, `${f} peak ${20 * Math.log10(peak)} dBFS`);
    const seconds = w.samples.length / w.rate;
    assert.ok(seconds >= 0.03 && seconds <= 2.5, `${f} length ${seconds}s`);
    assert.ok(w.samples.some((s) => Math.abs(s) > 500), `${f} is not silent`);
    assert.ok(Math.abs(w.samples[0]) < 800 && Math.abs(w.samples[w.samples.length - 1]) < 800, `${f} starts and ends without a click`);
    assert.ok(fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f))), `${f} is not deterministic`);
  }
  for (const e of committed.filter((x) => x.source.includes("make_sfx.py"))) assert.ok(files.includes(e.file), `${e.file} generated`);
});

test("every sound the build uses on its own exists in the library", () => {
  const build = fs.readFileSync(path.join(skill, "scripts", "build_reel.py"), "utf8");
  const used = new Set([...build.matchAll(/\bsfx\("([a-z-]+)"/g)].map((m) => m[1]));
  assert.ok(used.size >= 5);
  for (const name of used) assert.ok(committed.some((e) => e.name === name), `build_reel.py plays ${name}, which is not in the manifest`);
});
