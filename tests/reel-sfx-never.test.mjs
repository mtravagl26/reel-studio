// Added by By Mel Ross (0.24.0). brand.json "sfx_never": ["pop"] keeps a sound out of every reel: automatic, swapped in, or placed by hand.
// The build also says so when automatic sounds play on top of sounds the person placed. No render is run: the build writes sfx_events.json.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ff, py, skipReason, tmp } from "./reel-helpers.mjs";

function build({ brand = {}, placed = [], sfx }) {
  const dir = tmp("sfx-never"), reel = path.join(dir, "reel"), home = path.join(dir, "home"), engine = path.join(dir, "engine");
  fs.mkdirSync(reel); fs.mkdirSync(home); fs.mkdirSync(path.join(engine, "sfx"), { recursive: true });
  fs.writeFileSync(path.join(engine, "gsap.min.js"), "/* gsap stand-in for the test */");
  for (const n of ["swish", "pop", "tick"]) ff(["-f", "lavfi", "-i", "sine=f=440:d=0.3", path.join(engine, "sfx", `${n}.wav`)]);
  ff(["-f", "lavfi", "-i", "testsrc2=s=270x480:r=30:d=4", "-f", "lavfi", "-i", "sine=f=220:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(reel, "master.mp4")]);
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: { main: "#0d2b2d", pop: "#B9C8A5", light: "#f5f2ec" }, sfx: "subtle", ...brand }));
  fs.writeFileSync(path.join(reel, "edit.json"), JSON.stringify({ captions: [], punch: [], ...(sfx ? { sfx } : {}), sfx_events: placed,
    cards: [{ type: "note", text: "a note", start: 0.5, end: 2, sfx: { name: "pop", db: -13 } }, { type: "note", text: "another", start: 2.2, end: 3.5 }] }));
  const r = py("build_reel.py", [reel], { REELS_HOME: home, REEL_ENGINE: engine });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return { names: JSON.parse(fs.readFileSync(path.join(reel, "sfx_events.json"), "utf8")).map((e) => e.name), out: r.stdout };
}

test("without sfx_never every sound plays, the pop included", { skip: skipReason }, () => {
  const { names } = build({ placed: [{ name: "tick", t: 1 }] });
  assert.ok(names.includes("pop") && names.includes("tick") && names.includes("swish"), names.join());
});

test("sfx_never drops the sound everywhere: swapped in, automatic and placed by hand", { skip: skipReason }, () => {
  const { names, out } = build({ brand: { sfx_never: ["pop", "swish"] }, placed: [{ name: "pop", t: 1 }, { name: "tick", t: 2 }] });
  assert.deepEqual([...new Set(names)], ["tick"]);
  assert.match(out, /left out \(brand\.json sfx_never: pop, swish\)/);
});

test("the build says when automatic sounds play on top of placed ones, and stays quiet otherwise", { skip: skipReason }, () => {
  assert.match(build({ placed: [{ name: "tick", t: 1 }] }).out, /automatic sounds are playing on top of 1 you placed/);
  assert.doesNotMatch(build({ sfx: "none", placed: [{ name: "tick", t: 1 }] }).out, /automatic sounds/);
  assert.doesNotMatch(build({}).out, /automatic sounds are playing on top/);
});

test("sfx_never written as one name without brackets still bans it, and sounds that were off anyway aren't counted", { skip: skipReason }, () => {
  assert.ok(!build({ brand: { sfx_never: "pop" } }).names.includes("pop"));
  assert.doesNotMatch(build({ brand: { sfx_never: ["pop"] }, sfx: "none" }).out, /left out/);
});
