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
const IDS = Object.keys(menu.looks);   // the menu decides which IDs exist (61 looks: H1-H20, C1-C16, L1-L25)

// ------------------------------------------------------------------------------------------------------ the menu itself
test("style menu: every ID is in the JSON and in the Markdown table, with a known status", () => {
  assert.equal(IDS.length, 61);
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
    for (const c of look.recipe?.cards || (look.recipe?.card ? [look.recipe.card] : [])) assert.match(build, new RegExp(`kind == "${c.type}"`), `${id}: build_reel.py has a "${c.type}" card`);
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
  assert.deepEqual(planned.map(([id]) => id).sort(), ["C14", "H18", "L18"], "0.19.0: the rest are built; these 3 are not recommended");
  for (const [id, l] of planned) {
    assert.equal(l.recipe, null, `${id}: no recipe until it is built`);
    for (const f of ["evidence", "fit_for_melissa", "fit_note", "trend_2026_11"]) assert.ok(!(f in l), `${id}: ${f} stays out of the shipped menu`);
    assert.doesNotMatch(JSON.stringify(l), /https?:\/\/|instagram|\$\d/i, `${id}: general wording only`);
    assert.ok(l.does && l.build, `${id}: says what it is and how it would be made`);
  }
  for (const [id, l] of Object.entries(menu.looks)) {   // no look carries links, quoted posts or private notes, built or not
    for (const f of ["evidence", "fit_for_melissa", "fit_note", "trend_2026_11"]) assert.ok(!(f in l), `${id}: ${f}`);
    assert.doesNotMatch(JSON.stringify(l), /https?:\/\/|instagram/i, `${id}`);
  }
  const page = read("review", "style-menu.html");
  assert.match(page, /USABLE\.has\(l\.status\)/); assert.doesNotMatch(/const USABLE = new Set\(\[[^\]]*\]\)/.exec(page)?.[0] || "", /planned/, "the looks page never offers a planned look");
});

// 0.19.0: the looks built from the planned list. Every recipe is built for real (all cards and caption settings in one reel
// each), and the things each look exists for are in the page.
test("every usable look's recipe builds, alone, with its own caption settings and stand-in pictures", { skip: skipReason }, () => {
  const caps = [{ start: 0.2, end: 3.6, words: [{ text: "this", t: 0.2, accent: true }, { text: "line", t: 1.0 }] }];
  const got = {};
  for (const [id, look] of Object.entries(menu.looks)) {
    const r = look.recipe; if (!r) continue;
    const brand = JSON.parse(JSON.stringify(r.brand || {}).replace(/\{reels\}|\{skill\}/g, "/nowhere"));
    let k = 0;
    const cards = (r.cards || (r.card ? [r.card] : [])).map((c0) => {
      const c = { ...c0, start: 0.3, end: 3.4 };
      if (c.type === "polaroids") c.src = Array.from({ length: r.needs_photos || 3 }, (_, j) => `shots/${"abc"[j % 3]}.png`);
      else if (["popup", "sticker"].includes(c.type)) c.src = `shots/${"abc"[k++ % 3]}.png`;
      else if (c.type === "page" && r.needs_photos) c.bg = "shots/a.png";
      else if (c.type === "roundup" && r.needs_photos) c.src = "shots/a.png";
      return c;
    });
    const reel = makeReel(cards, { brand: { ...brand, colors: { main: "#0d2b2d", pop: "#B9C8A5", light: "#f5f2ec", ...(brand.colors || {}) } }, captions: caps });
    const out = py("build_reel.py", [reel.reel], reel.env);
    assert.equal(out.status, 0, `${id}: ${out.stdout}${out.stderr}`.slice(-600));
    got[id] = fs.readFileSync(path.join(reel.reel, "proj", "index.html"), "utf8");
  }
  assert.ok(Object.keys(got).length >= 46, `${Object.keys(got).length} looks built`);
  assert.match(got.H6, /<span style="background:#B9C8A5;color:#0d2b2d[^"]*">161<\/span> days ago/, "a soft highlight on a white headline becomes a marker so the word can be read");
  assert.match(got.H7, /class="tl tsub"[^>]*>\(as a solo business owner\)/); assert.match(got.H7, /Georgia/);
  assert.match(got.H10, /class="tl tlab"[\s\S]*messy[\s\S]*mapped/);
  assert.match(got.H12, /class="quote"[^>]*><div>\u201c/); assert.match(got.H13, /class="quote"[\s\S]*class="pop"/, "2 cards from 1 look");
  assert.match(got.H15, /font-style:italic/); assert.doesNotMatch(got.H15.match(/class="tl" style="[^"]*"/)[0], /text-stroke/, "serif lines carry no outline");
  assert.match(got.C6, /class="cap capbg"[\s\S]*?<span class="cb" style="background:#FFFFFF/); assert.match(got.C10, /class="cb" style="background:rgba\(0,0,0,\.62\)/);
  assert.match(got.C9, /class="acc" style="[^"]*font-style:italic/);
  assert.match(got.L10, /class="page pblur"[\s\S]*class="pbg"/); assert.match(got.L11, /class="rup rsplit"[\s\S]*class="rtop"[\s\S]*app name[\s\S]*class="rface"><video[^>]*src="master\.mp4"/);
  assert.match(got.L1, /class="rup rslide"[\s\S]*class="rfull"><img[\s\S]*class="rinset"[^>]*><video[^>]*src="master\.mp4"/);
  assert.match(got.L25, /class="rup rchap"[\s\S]*class="rnum"[^>]*>01<[\s\S]*class="rname" style="font-family:Georgia/);
  assert.doesNotMatch(got.L25.match(/<div id="k0" class="rup rchap"[\s\S]*?<\/div><\/div><\/div>/)[0], /<video|<img/, "no picture of the speaker on a chapter card");
  assert.equal((got.L12.match(/class="pl"/g) || []).length, 6, "the cloud takes 6 pictures");
  assert.equal((got.L14.match(/class="tile" style="left:50px/g) || []).length, 4, "a column down the left side");
  assert.equal((got.L15.match(/class="colc"/g) || []).length, 3); assert.equal((got.L17.match(/class="chip"/g) || []).length, 5);
  assert.match(got.L16, /class="card" style="top:1000px"/); assert.match(got.L20, /class="pop" style="left:0px;top:\d+px;width:1080px/);
  assert.match(got.L23, /fix the basics<\/span>/i);
});

test("the pages and the storyboard handle a look made of several cards", () => {
  const page = read("review", "style-menu.html"), sb = read("scripts", "storyboard.py");
  assert.match(page, /for \(const c of r\.cards \|\| \(r\.card \? \[r\.card\] : \[\]\)\) card\(f, c\)/);
  for (const k of ["quote", "columns", "chips", "page", "cta", "tag", "sticker"]) assert.match(page, new RegExp(`kind === "${k}"`), `the looks page draws a ${k}`);
  assert.match(sb, /look_cards = r\.get\("cards"\)/); assert.match(sb, /accent == "first"/);
});

// Added by By Mel Ross: the Roundup layout (card "roundup": split L11, slide L1, chapter L25) for a "what I used this month" reel.
test("roundup card: split puts the picture on top and the face below, slide puts the face in a corner window, chapter is serif on plain colour", { skip: skipReason }, () => {
  const c = makeReel([
    { type: "roundup", look: "chapter", number: "01", text: "Granola", sub: "notes that write themselves", start: 0.1, end: 0.9 },
    { type: "roundup", look: "split", src: "shots/a.png", label: "Granola", face_y: 35, start: 1, end: 2 },
    { type: "roundup", look: "slide", src: "shots/b.png", corner: "top-left", inset_size: 240, start: 2, end: 3 },
    { type: "roundup", look: "slide", start: 3, end: 3.5 },
    { type: "roundup", look: "sideways", src: "shots/c.png", start: 3, end: 3.5 },
  ], { captions: [{ start: 0.2, end: 0.8, words: [{ text: "hidden", t: 0.2 }] }, { start: 1.2, end: 1.9, words: [{ text: "shown", t: 1.2 }] }] });
  const { r, html } = buildOf(c);
  assert.match(html, /id="k0" class="rup rchap"[^>]*background:#0d2b2d/, "chapter on the brand's main colour");
  assert.match(html, /class="rname" style="font-family:Georgia[^"]*;color:#f5f2ec">Granola</, "the name in the serif font, light on dark");
  assert.match(html, /class="rsub"[^>]*>notes that write themselves</);
  assert.match(html, /id="k1" class="rup rsplit"[\s\S]*?class="rtop"><img src="img\/[^"]+"[\s\S]*?class="rlabel"[^>]*>Granola<\/div><\/div><div class="rface"><video id="k1v" src="master\.mp4"[^>]*data-media-start="1(\.0)?"[^>]*object-position:50% 35%/);
  assert.match(html, /id="k2" class="rup rslide"[\s\S]*?class="rinset" style="left:48px;top:150px;width:240px;height:320px"><video id="k2v" src="master\.mp4"/);
  assert.match(r.stdout, /roundup card 3 \(slide\) needs a picture or screen recording/); assert.match(r.stdout, /look 'sideways' is not split, slide or chapter/);
  assert.doesNotMatch(html, /id="k3"|id="k4"/);
  assert.doesNotMatch(html, />hidden</, "captions step aside for the chapter card");
  assert.match(html, />shown</);
  const css = html.match(/\.rface \{[^}]*\}/)[0]; assert.match(css, /top: 960px/, "the face fills the bottom half");
});
