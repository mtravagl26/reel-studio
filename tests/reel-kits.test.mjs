// Added by By Mel Ross (0.11.0). Material kits: cards built from pictures of real paper, tape, labels and stickers.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ff, py, skill, skipReason, tmp } from "./reel-helpers.mjs";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const CARDS = [
  { type: "card", title: "my team", rows: ["one", "two", "three"], start: 0.2, end: 1.5 },
  { type: "tag", text: "step 1", start: 1.6, end: 2.4 },
  { type: "note", text: "the fix / is <b>boring", start: 2.5, end: 3.5 },
];
function makeReel(extra = {}, brand = {}) {
  const dir = tmp("kits"), reel = path.join(dir, "reel"), home = path.join(dir, "home"), engine = path.join(dir, "engine");
  fs.mkdirSync(reel); fs.mkdirSync(home); fs.mkdirSync(path.join(engine, "sfx"), { recursive: true });
  fs.writeFileSync(path.join(engine, "gsap.min.js"), "/* gsap stand-in for the test */");
  ff(["-f", "lavfi", "-i", "testsrc2=s=270x480:r=30:d=4", "-f", "lavfi", "-i", "sine=f=220:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(reel, "master.mp4")]);
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: { main: "#0d2b2d", pop: "#B9C8A5", light: "#f5f2ec" }, sfx: "none", ...brand }));
  fs.writeFileSync(path.join(reel, "edit.json"), JSON.stringify({ captions: [], punch: [], cards: CARDS, ...extra }));
  const env = { REELS_HOME: home, REEL_ENGINE: engine };
  return { dir, reel, home, env, build: (args = []) => py("build_reel.py", [reel, ...args], env), html: () => fs.readFileSync(path.join(reel, "proj", "index.html"), "utf8") };
}

test("no kit: every card is drawn the plain way, and the new note card works on a plain sheet", { skip: skipReason }, () => {
  const c = makeReel(), r = c.build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const h = c.html();
  assert.doesNotMatch(h, /kit\//); assert.match(h, /class="card"><div class="ch"/); assert.match(h, /<span class="tag" style="background:#B9C8A5/);
  assert.match(h, /class="note" style="background:#f5f2ec;color:#0d2b2d;[^"]*"><i class="ptape"><\/i><div>the fix<\/div><div>is &lt;b&gt;boring<\/div>/, "two lines, a drawn tape strip, text escaped");
  assert.ok(!fs.existsSync(path.join(c.reel, "proj", "kit")));
});

test("the stand-in kit: list, label and note are built from its pictures, and the build says it is placeholder art", { skip: skipReason }, () => {
  const c = makeReel({ kit: "standin" }), r = c.build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /NOTE \(tell them\): the kit "Stand-in paper" is stand-in art/); assert.match(r.stdout, /^kit: standin$/m);
  const h = c.html();
  assert.match(h, /class="card kcard" style="background-image:url\(kit\/paper\.png\)"><img class="ktape" src="kit\/tape\.png"/);
  assert.match(h, /<img class="kst" src="kit\/n1\.png" \/>one/); assert.match(h, /<img class="kst" src="kit\/n3\.png" \/>three/);
  assert.match(h, /class="tag ktag" style="background-image:url\(kit\/label\.png\);color:#2b2b2b/, "the kit's ink color on the label");
  assert.match(h, /class="note knote" style="background-image:url\(kit\/paper\.png\);color:#2b2b2b/);
  for (const f of ["paper.png", "tape.png", "label.png", "n1.png", "n2.png", "n3.png"]) assert.ok(fs.existsSync(path.join(c.reel, "proj", "kit", f)), f + " copied into the build");
  assert.ok(!fs.existsSync(path.join(c.reel, "proj", "kit", "n5.png")), "only what the reel uses is copied");
  const off = c.build(["--kit", "none"]); assert.equal(off.status, 0); assert.doesNotMatch(c.html(), /kit\//, "--kit none switches it off for one build");
});

test("your own kit wins over a built-in one, a partial kit falls back part by part, and a card can opt out", { skip: skipReason }, () => {
  const c = makeReel({}, { kit: "desk" }), mine = path.join(c.home, "kits", "desk");
  fs.mkdirSync(mine, { recursive: true }); fs.writeFileSync(path.join(mine, "sheet.png"), PNG);
  fs.writeFileSync(path.join(mine, "kit.json"), JSON.stringify({ name: "Desk", materials: { paper: "sheet.png", tape: { file: "gone.png" }, label: { file: "../../brand.json" } } }));
  const edit = JSON.parse(fs.readFileSync(path.join(c.reel, "edit.json"), "utf8")); edit.cards[2].kit = false;
  fs.writeFileSync(path.join(c.reel, "edit.json"), JSON.stringify(edit));
  const r = c.build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /warning: kit desk: tape: gone\.png is missing/); assert.match(r.stdout, /warning: kit desk: label: .* must be a \.png or \.webp file name inside the kit folder/);
  assert.doesNotMatch(r.stdout, /stand-in art/);
  const h = c.html();
  assert.match(h, /class="card kcard" style="background-image:url\(kit\/sheet\.png\)"><div class="kh"/, "paper used, no tape picture");
  assert.match(h, /<b style="background:#B9C8A5"><\/b>one/, "no stickers in this kit: the plain dot");
  assert.match(h, /<span class="tag" style="background:#B9C8A5/, "no usable label: the plain pill");
  assert.match(h, /class="note" style="background:#f5f2ec/, 'the note said "kit": false');
  const missing = makeReel({ kit: "nope" }), m = missing.build();
  assert.equal(m.status, 0); assert.match(m.stdout, /warning: material kit 'nope' not found/); assert.doesNotMatch(missing.html(), /kit\//);
});

test("kit.py lists and checks kits; every stand-in picture exists and is marked as a placeholder", { skip: skipReason }, () => {
  const c = makeReel();
  assert.match(py("kit.py", ["list"], c.env).stdout, /standin\s+Stand-in paper: .*\[stand-in art\]/);
  const ok = py("kit.py", ["check", "standin"], c.env);
  assert.equal(ok.status, 0, ok.stdout); assert.match(ok.stdout, /has: paper, tape, label, sticker 1, sticker 2, sticker 3, sticker 4, sticker 5/);
  const kit = JSON.parse(fs.readFileSync(path.join(skill, "kits", "standin", "kit.json"), "utf8"));
  assert.equal(kit.placeholder, true);
  const menu = JSON.parse(fs.readFileSync(path.join(skill, "assets", "style-menu.json"), "utf8")).looks;
  assert.equal(menu.L10.recipe.card.type, "note");
});
