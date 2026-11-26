// Added by By Mel Ross (0.27.0). "Show me on my clip" (look_preview.py, stills of picked looks on the person's footage) and
// "Put it here" (a picked layout look pinned to a line). storyboard.py itself needs Chrome and HyperFrames, so a stand-in
// takes its place here and records what it was asked to do.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ff, py, skipReason, tmp } from "./reel-helpers.mjs";

const skill = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "3-editing", "reel-editor"), review = path.join(skill, "review");
function stub(dir) {
  const f = path.join(dir, "fake_storyboard.py");
  fs.writeFileSync(f, `import sys, json
from pathlib import Path
a = sys.argv; out = Path(a[a.index("--out") + 1]); out.mkdir(parents=True)
reel = Path(a[1]); assert (reel / "master.mp4").exists() and (reel / "edit.json").exists()
json.dump({"reel": str(reel), "option": a[a.index("--option") + 1], "at": a[a.index("--at") + 1], "content": json.load(open(a[a.index("--content") + 1])),
           "caps": len(json.load(open(reel / "edit.json"))["captions"]), "home": __import__("os").environ.get("REELS_HOME")}, open(out / "args.json", "w"))
(out / "storyboard.jpg").write_bytes(b"\\xff\\xd8\\xff\\xd9")
print("note: Option A: a note")
`);
  return f;
}
const clip = (f, d = 8) => ff(["-f", "lavfi", "-i", `testsrc2=s=640x360:r=30:d=${d}`, "-f", "lavfi", "-i", `sine=d=${d}`, "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", f]);

test("look_preview: a raw clip gets a reel-sized copy and sample captions; the example brand stands in; pinned looks get their moment", { skip: skipReason }, () => {
  const dir = tmp("lp"), home = path.join(dir, "home"); fs.mkdirSync(home); clip(path.join(dir, "c.mp4"));
  const r = py("look_preview.py", [path.join(dir, "c.mp4"), "--out", path.join(dir, "o"), "--ids", "H3,L8", "--theme", "bold", "--at", "L8=5"], { REELS_HOME: home, REEL_STORYBOARD: stub(dir) });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout.trim().split("\n").pop(), /storyboard\.jpg$/); assert.match(r.stdout, /no brand settings yet/);
  const a = JSON.parse(fs.readFileSync(path.join(dir, "o", "board", "args.json"), "utf8"));
  assert.equal(a.option, "A=H3,L8,theme:bold"); assert.deepEqual(a.content.at, { L8: 5 });
  const m = a.at.split(",").map(Number); assert.ok(m.includes(5) && m[0] < 1.5, "a moment near the start for the hook, and the pinned one: " + a.at);
  assert.ok(a.caps >= 3, "sample captions"); assert.equal(a.home, path.join(dir, "o", "home"));
  assert.notEqual(py("look_preview.py", [path.join(dir, "c.mp4"), "--out", path.join(dir, "o2"), "--theme", "../x"], { REELS_HOME: home }).status, 0, "a bad theme name is refused");
  assert.notEqual(py("look_preview.py", [path.join(dir, "nothing"), "--out", path.join(dir, "o3"), "--ids", "H3"], { REELS_HOME: home }).status, 0, "no clip");
});

test("home page: Show me on my clip needs a checked clip, then makes stills of it; the gallery has the button", { skip: skipReason }, async () => {
  const dir = tmp("lphome"), home = path.join(dir, "reels"), port = 4910 + Math.floor(Math.random() * 40);
  fs.mkdirSync(home);
  const srv = spawn("node", [path.join(review, "home-server.mjs"), "--port", String(port)], { env: { ...process.env, REELS_HOME: home, REEL_STORYBOARD: stub(dir) }, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`, post = (b) => fetch(base + "/api/look-preview", { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify(b) }).then((r) => r.json());
  try {
    for (let k = 0; k < 40; k++) { try { await fetch(base + "/looks"); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
    const page = await (await fetch(base + "/looks")).text();
    assert.match(page, /"preview":true/); assert.match(page, /Show me on my clip/);
    let j = await post({ ids: ["H20"] }); assert.equal(j.ok, false); assert.match(j.error, /Check a clip first/);
    fs.mkdirSync(path.join(home, "inbox")); clip(path.join(home, "inbox", "take1.mp4"));
    j = await post({ ids: [] }); assert.match(j.error, /at least 1 look/);
    j = await post({ ids: ["H20", "bad id"], theme: "bold" }); assert.equal(j.ok, true, j.error); assert.deepEqual(j.ids, ["H20"]);
    for (let k = 0; k < 100 && j.state === "running"; k++) { await new Promise((r) => setTimeout(r, 200)); j = await (await fetch(base + "/api/look-preview")).json(); }
    assert.equal(j.state, "done", JSON.stringify(j)); assert.deepEqual(j.notes, ["You have no brand settings yet, so these stills use the example colors and fonts.", "a note"]);
    const img = await fetch(base + "/look-preview.jpg"); assert.equal(img.status, 200); assert.equal(img.headers.get("content-type"), "image/jpeg");
  } finally { srv.kill(); }
});

test("Put it here: the reel link's gallery lists the reel's lines, keeps a picked look's line, and writes it into the request", () => {
  const sm = fs.readFileSync(path.join(review, "style-menu.html"), "utf8"), srv = fs.readFileSync(path.join(review, "editor-server.mjs"), "utf8");
  for (const t of ["Where: Claude picks the moment", "at the line", "in the raw clip", 'id="seeit"', "Your picks on your clip"]) assert.ok(sm.includes(t), t);
  assert.match(srv, /function lookLines/); assert.match(srv, /"\/api\/look-preview"/); assert.match(srv, /at\[k\] = \+\(\+v\)\.toFixed\(2\)/);
  assert.match(fs.readFileSync(path.join(skill, "scripts", "storyboard.py"), "utf8"), /cards, used, skipped = \(?\s*\[\],\s*\[\],\s*\[\]/, "storyboard sets these for every option");
});
