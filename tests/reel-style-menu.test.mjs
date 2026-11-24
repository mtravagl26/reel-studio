// Added by By Mel Ross (0.5.0). The Style Menu (looks by ID, new card types, storyboard checks), the permanent word list
// (brand.json "vocabulary" applied by auto_edit.py) and the audio crossfade at cuts (edl.json "xfade" in cut.py).
// No render is run here; the builds only write the HTML project.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ff, haveFfmpeg, havePython, py, run, root, skill, skipReason, tmp } from "./reel-helpers.mjs";

const read = (...p) => fs.readFileSync(path.join(skill, ...p), "utf8");
const menu = JSON.parse(read("assets", "style-menu.json"));
const IDS = Object.keys(menu.looks);   // the menu decides which IDs exist (59 looks: H1-H19, C1-C16, L1-L24)

// ------------------------------------------------------------------------------------------------------ the menu itself
test("style menu: every ID is in the JSON and in the Markdown table, with a known status", () => {
  assert.equal(IDS.length, 59);
  for (const id of IDS) assert.match(id, /^[HCL]\d+$/, `${id} is a hook, caption or layout ID`);
  const md = read("references", "style-menu.md");
  for (const id of IDS) {
    assert.match(md, new RegExp(`^\\| ${id} \\|`, "m"), `${id} has a row in references/style-menu.md`);
    const look = menu.looks[id];
    assert.ok(["built", "partial", "not-built", "cut-choice", "planned"].includes(look.status), `${id}: status ${look.status}`);
    assert.ok(look.name && look.group, `${id}: name and group`);
    if (look.status === "built" || look.status === "partial") assert.ok(look.recipe, `${id}: a built or partial look has a recipe`);
  }
});

test("style menu: the SKILL.md list of built looks matches the JSON", () => {
  const built = IDS.filter((id) => menu.looks[id].status === "built");
  const skillMd = read("SKILL.md");
  const line = skillMd.match(/Built: ([^;]+);/)?.[1] ?? "";
  const named = (id) => new RegExp(`\\b${id}\\b`).test(line);   // whole IDs: L1 is not "named" by L10
  for (const id of built) assert.ok(named(id), `${id} is built and named in SKILL.md`);
  for (const id of IDS.filter((x) => !built.includes(x))) assert.ok(!named(id), `${id} is not built and must not be named as built`);
});

test("style menu: every card recipe uses a card type that build_reel.py handles", () => {
  const build = read("scripts", "build_reel.py");
  for (const [id, look] of Object.entries(menu.looks)) {
    const type = look.recipe?.card?.type;
    if (type) assert.match(build, new RegExp(`kind == "${type}"`), `${id}: build_reel.py has a "${type}" card`);
  }
});

test("the new files carry no personal paths or email addresses", () => {
  const files = [
    read("assets", "style-menu.json"), read("references", "style-menu.md"), read("scripts", "storyboard.py"),
    read("SKILL.md"), read("scripts", "build_reel.py"), read("scripts", "auto_edit.py"), read("scripts", "cut.py"),
    fs.readFileSync(path.join(root, "brand", "brand.example.json"), "utf8"), fs.readFileSync(path.join(root, "brand", "brand.example.md"), "utf8"),
  ].join("\n");
  assert.doesNotMatch(files, /\/Users\/|\/home\/|iCloud|[\w.-]+@[\w-]+\.(com|org|net|io)/i);
});

test("handwriting font: Caveat ships with its SIL Open Font License beside it", () => {
  const dir = path.join(skill, "assets", "fonts");
  const font = fs.readFileSync(path.join(dir, "Caveat-700-latin.woff2"));
  assert.equal(font.subarray(0, 4).toString("ascii"), "wOF2", "a WOFF2 file");
  assert.ok(font.length > 10_000 && font.length < 200_000);
  const ofl = fs.readFileSync(path.join(dir, "OFL-Caveat.txt"), "utf8");
  assert.match(ofl, /Copyright 2014 The Caveat Project Authors/);
  assert.match(ofl, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(fs.readFileSync(path.join(root, "THIRD_PARTY_NOTICES.md"), "utf8"), /Caveat/);
});

// -------------------------------------------------------------------------------------------------------------- cards
function makeReel(cards, { brand = {}, captions = [] } = {}) {
  const dir = tmp("stylemenu"), reel = path.join(dir, "reel"), home = path.join(dir, "home"), engine = path.join(dir, "engine");
  fs.mkdirSync(reel); fs.mkdirSync(home); fs.mkdirSync(path.join(engine, "sfx"), { recursive: true }); fs.mkdirSync(path.join(reel, "shots"));
  fs.writeFileSync(path.join(engine, "gsap.min.js"), "/* gsap stand-in for the test */");
  ff(["-f", "lavfi", "-i", "testsrc2=s=270x480:r=30:d=4", "-f", "lavfi", "-i", "sine=f=220:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(reel, "master.mp4")]);
  for (const n of ["a", "b", "c"]) ff(["-f", "lavfi", "-i", "color=c=0xB9C8A5:s=200x200", "-frames:v", "1", path.join(reel, "shots", `${n}.png`)]);
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: { main: "#0d2b2d", pop: "#B9C8A5", light: "#f5f2ec" }, sfx: "none", ...brand }));
  fs.writeFileSync(path.join(reel, "edit.json"), JSON.stringify({ captions, punch: [], cards }));
  return { reel, env: { REELS_HOME: home, REEL_ENGINE: engine } };
}
function buildOf(c) {
  const r = py("build_reel.py", [c.reel], c.env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return { r, html: fs.readFileSync(path.join(c.reel, "proj", "index.html"), "utf8") };
}

test("title card: a handwritten overline above the headline, left aligned (H3), centred italic step label (L7)", { skip: skipReason }, () => {
  const c = makeReel([
    { type: "title", text: "ACME / OFFER", overline: "big news this week", align: "left", y: 95, size: 150, color: "#FFFFFF", start: 0.2, end: 1.8 },
    { type: "title", text: "the offer", overline: "step #2:", overline_font: "accent", align: "center", y: 95, start: 2, end: 3.5 },
  ]);
  const { html } = buildOf(c);
  assert.match(html, /big news this week/);
  assert.match(html, /step #2:/);
  assert.match(html, /font-family:"Caveat-hand"|Caveat-hand/, "the overline uses the handwriting font");
  assert.match(html, /text-align:left/);
  assert.match(html, /text-align:center/);
  assert.match(html, /@font-face \{ font-family: "Caveat-hand"; src: url\("fonts\/Caveat-700-latin\.woff2"\)/, "the bundled font is registered");
});

test("polaroids card (L2): one photo per source, tilted, a label strip, and a note when it would reach the eyes", { skip: skipReason }, () => {
  const c = makeReel([
    { type: "polaroids", src: ["shots/a.png", "shots/b.png", "shots/c.png"], label: "the proof", side: "left", start: 0.5, end: 3 },
    { type: "polaroids", src: "shots/a.png", side: "right", y: 400, size: 300, start: 1, end: 3 },
  ]);
  const { r, html } = buildOf(c);
  assert.equal((html.match(/id="k0p\d"/g) || []).length, 3, "three photos");
  assert.equal((html.match(/id="k1p\d"/g) || []).length, 1, "a single source string is one photo");
  assert.match(html, /id="k0l"[\s\S]*the proof/, "the label");
  assert.match(html, /clip-path:polygon\(/, "the label is a torn strip");
  assert.match(r.stdout, /card 1 \(polaroids\) reaches y/, "the second stack is low enough to warn about the eyes");
  assert.doesNotMatch(r.stdout, /card 0 \(polaroids\) reaches/);
});

test("xlist card (L6): sage checks by default, red X on request, one row per item, row times land each row", { skip: skipReason }, () => {
  const c = makeReel([
    { type: "xlist", items: ["no ads", "no funnel"], start: 0.5, end: 3, row_times: [0.8, 1.6] },
    { type: "xlist", items: ["no ads", { text: "no guesswork", mark: "check" }], mark: "x", start: 0.5, end: 3 },
  ]);
  const { html } = buildOf(c);
  assert.equal((html.match(/id="k0r\d"/g) || []).length, 2);
  assert.match(html, /M8 34C15 40/, "a check path");
  assert.match(html, /M12 14C22 24/, "a cross path");
  assert.match(html, /#D64545/, "the X is red");
  assert.match(html, /tl\.fromTo\("#k0r1 \.xt".*?,1\.6\)/, "row 2 lands at its row time");
});

test("stat card (L8): label, value, delta pill and sparkline are drawn from the data given", { skip: skipReason }, () => {
  const c = makeReel([
    { type: "stat", label: "Customers", value: "12,000", delta: "+12%", spark: [3, 4, 6, 5, 9], start: 0.5, end: 3 },
    { type: "stat", label: "Plain", value: "7", start: 1, end: 3 },
  ]);
  const { html } = buildOf(c);
  assert.match(html, /Customers/);
  assert.match(html, /12,000/);
  assert.match(html, /\+12%/);
  assert.match(html, /<polyline pathLength="1"/, "the sparkline");
  const second = html.slice(html.indexOf('id="k1"'));
  assert.doesNotMatch(second.slice(0, 700), /class="sd"|<polyline/, "no delta and no sparkline unless given");
});

test("tiles card (L4): built-in icons, a glyph fallback, a torn label and a grid that fits the width", { skip: skipReason }, () => {
  const c = makeReel([{ type: "tiles", label: "three things", tiles: [{ label: "Billing", icon: "dollar" }, { label: "Plans", icon: "target" }, { label: "Odd one", icon: "Z" }, "Plain"], start: 0.5, end: 3 }]);
  const { html } = buildOf(c);
  assert.equal((html.match(/id="k0t\d"/g) || []).length, 4);
  assert.match(html, /M12 3v18M16\.5 7\.5/, "the dollar icon");
  assert.match(html, />Z<\/span>/, "a short glyph is drawn as text");
  assert.match(html, /three things/);
  assert.match(html, /class="tp"/, "torn label");
  for (const m of html.matchAll(/id="k0t\d" class="tile" style="left:(\d+)px;top:\d+px;width:(\d+)px/g)) assert.ok(+m[1] >= 0 && +m[1] + +m[2] <= 1080, "tile inside the frame");
});

test("popup card with a caption (L9): a handwritten strip on the photo, and it shrinks out", { skip: skipReason }, () => {
  const c = makeReel([{ type: "popup", src: "shots/a.png", pos: "top-left", size: 330, rotate: -5, caption: "how is this real?!", start: 0.5, end: 3 }]);
  const { html } = buildOf(c);
  assert.match(html, /how is this real\?!/);
  assert.match(html, /tl\.to\("#k0",\{scale:0\.86/, "the exit");
  assert.match(html, /tl\.fromTo\("#k0 \.tp"/, "the caption fades in");
});

// -------------------------------------------------------------------------------------------------------- storyboard
test("storyboard.py refuses a reel without a master, an existing --out folder, and an unknown ID", { skip: skipReason }, () => {
  const dir = tmp("storyboard"), reel = path.join(dir, "reel"), out = path.join(dir, "out");
  fs.mkdirSync(reel);
  let r = py("storyboard.py", [reel, "--out", out, "--option", "A=H3"]);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /needs master\.mp4 and edit\.json/);
  fs.writeFileSync(path.join(reel, "master.mp4"), "x"); fs.writeFileSync(path.join(reel, "edit.json"), "{}");
  r = py("storyboard.py", [reel, "--out", path.join(reel, "sub"), "--option", "A=H3"]);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /new folder outside the reel folder/);
  fs.mkdirSync(out); fs.writeFileSync(path.join(out, "keep.txt"), "x");
  r = py("storyboard.py", [reel, "--out", out, "--option", "A=H3"]);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /already has files/);
  assert.equal(fs.readFileSync(path.join(out, "keep.txt"), "utf8"), "x", "nothing was overwritten");
  const fresh = path.join(dir, "fresh");
  r = py("storyboard.py", [reel, "--out", fresh, "--option", "A=H3,Q9"]);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /unknown Style Menu ID 'Q9'/);
  assert.ok(!fs.existsSync(fresh), "nothing is created for a bad request");
  assert.deepEqual(fs.readdirSync(reel).sort(), ["edit.json", "master.mp4"], "the reel folder is never written to");
});

// ----------------------------------------------------------------------------------------------------------- word list
function autoEdit(words, vocabulary, mode = "phrase") {
  const dir = tmp("vocab"), reel = path.join(dir, "reel"), home = path.join(dir, "home");
  fs.mkdirSync(reel); fs.mkdirSync(home);
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ captions: { mode }, ...(vocabulary ? { vocabulary } : {}) }));
  let t = 0;
  fs.writeFileSync(path.join(reel, "master_transcript.json"), JSON.stringify(words.map((text) => ({ text, start: (t += 0.4), end: t + 0.3 }))));
  const r = py("auto_edit.py", [reel], { REELS_HOME: home });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const edit = JSON.parse(fs.readFileSync(path.join(reel, "edit.json"), "utf8"));
  const groups = edit.captions.map((c) => c.words.map((w) => w.text));
  return Object.assign(groups.flat(), { groups });     // captions drop punctuation; the groups show where it split them
}
const CORR = { corrections: { akme: "Acme", "acme corp": "Acme Corp", "acme inc": "Acme" } };

test("word list: a single-word mishear is corrected and the sentence break after it stays", { skip: !havePython }, () => {
  assert.deepEqual([...autoEdit(["Welcome", "to", "Akme,", "everyone"], CORR, "word")], ["Welcome", "to", "Acme", "everyone"]);
  const out = autoEdit(["Hi", "Akme.", "Then", "we", "go"], CORR);
  assert.deepEqual(out.groups, [["Hi", "Acme"], ["Then", "we", "go"]], "the full stop after the corrected word still ends the caption");
});

test("word list: a two-word key matches case-insensitively and a two-word to one-word replacement drops the extra word", { skip: !havePython }, () => {
  assert.deepEqual([...autoEdit(["Ask", "ACME", "corp.", "today"], CORR, "word")], ["Ask", "Acme", "Corp", "today"]);
  assert.deepEqual([...autoEdit(["Ask", "acme", "inc.", "today"], CORR, "word")], ["Ask", "Acme", "today"]);
  assert.deepEqual(autoEdit(["Ask", "acme", "inc.", "today", "now"], CORR).groups, [["Ask", "Acme"], ["today", "now"]], "the dropped word's full stop moves to the corrected word");
});

test("word list: no vocabulary block, or no match, leaves the captions as Whisper wrote them", { skip: !havePython }, () => {
  assert.deepEqual([...autoEdit(["Akme", "wins"], null, "word")], ["Akme", "wins"]);
  assert.deepEqual([...autoEdit(["Akmed", "wins"], CORR, "word")], ["Akmed", "wins"], "whole words only");
});

// --------------------------------------------------------------------------------------------------- audio crossfade
function cutWith(xfade) {
  const dir = tmp("xfade"), reel = path.join(dir, "reel"), home = path.join(dir, "home");
  fs.mkdirSync(reel); fs.mkdirSync(home);
  ff(["-f", "lavfi", "-i", "testsrc2=s=270x480:r=30:d=4", "-f", "lavfi", "-i", "sine=f=330:r=48000:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(reel, "raw.mp4")]);
  ff(["-f", "lavfi", "-i", "sine=f=330:r=48000:d=4", path.join(reel, "voice.wav")]);
  fs.writeFileSync(path.join(reel, "edl.json"), JSON.stringify({ source: "raw.mp4", audio: "voice.wav", keep: [[0, 1], [1.5, 2.5], [3, 3.8]], ...(xfade ? { xfade } : {}) }));
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ resolution: [270, 480], enhance: { on: false } }));
  const r = py("cut.py", [reel], { REELS_HOME: home, REEL_NO_NICE: "1", REEL_NO_CUTOUT: "1", REEL_NO_AVCONVERT: "1" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const dur = (stream) => parseFloat(run("ffprobe", ["-v", "error", "-select_streams", stream, "-show_entries", "stream=duration", "-of", "csv=p=0", path.join(reel, "master.mp4")]).stdout);
  return { filter: fs.readFileSync(path.join(reel, "cut_filter.txt"), "utf8"), video: dur("v:0"), audio: dur("a:0") };
}

test("edl xfade: the audio is crossfaded at every join and stays as long as the picture", { skip: skipReason }, () => {
  const x = cutWith(0.035);
  assert.equal((x.filter.match(/acrossfade=d=0\.035/g) || []).length, 2, "two joins, two crossfades");
  assert.doesNotMatch(x.filter, /afade=/, "no dip-fade when crossfading");
  assert.ok(Math.abs(x.video - 2.8) < 0.08, `picture ${x.video}`);
  assert.ok(Math.abs(x.audio - x.video) < 0.08, `audio ${x.audio} matches picture ${x.video}`);
});

test("edl without xfade keeps the old short dip-fade at each join", { skip: skipReason }, () => {
  const x = cutWith(0);
  assert.match(x.filter, /afade=t=in/);
  assert.doesNotMatch(x.filter, /acrossfade/);
  assert.ok(Math.abs(x.video - 2.8) < 0.08 && Math.abs(x.audio - x.video) < 0.08);
});

// Added by By Mel Ross (menu-58 review): the planned looks ship to everyone who installs the plugin, so they carry general
// descriptions only: no links to other people's posts, no lines lifted from them, no private notes.
test("style menu: planned looks have no recipe, no links, no private notes, and are never offered as usable", () => {
  const planned = Object.entries(menu.looks).filter(([, l]) => l.status === "planned");
  assert.equal(planned.length, 39);
  for (const [id, l] of planned) {
    assert.equal(l.recipe, null, `${id}: no recipe until it is built`);
    for (const f of ["evidence", "fit_for_melissa", "fit_note", "trend_2026_11"]) assert.ok(!(f in l), `${id}: ${f} stays out of the shipped menu`);
    assert.doesNotMatch(JSON.stringify(l), /https?:\/\/|instagram|\$\d/i, `${id}: general wording only`);
    assert.ok(l.does && l.build, `${id}: says what it is and how it would be made`);
  }
  const page = read("review", "style-menu.html");
  assert.match(page, /USABLE\.has\(l\.status\)/); assert.doesNotMatch(/const USABLE = new Set\(\[[^\]]*\]\)/.exec(page)?.[0] || "", /planned/, "the looks page never offers a planned look");
});
