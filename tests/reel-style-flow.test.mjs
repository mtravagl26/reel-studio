// Added by By Mel Ross (0.10.0). The looks page, the style card, the labelled QA report and notes that become rules.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { py as pyRun, skill, skipReason, tmp } from "./reel-helpers.mjs";
const py = (script, args, env) => { const r = pyRun(script, args, env); assert.equal(r.status, 0, `${script}: ${r.stderr}`); return r.stdout; };

const review = path.join(skill, "review");
const menu = JSON.parse(fs.readFileSync(path.join(skill, "assets", "style-menu.json"), "utf8")).looks;
const mkHome = (brand = {}) => {
  const dir = tmp("styleflow"), home = path.join(dir, "reels"), reel = path.join(home, "r1");
  fs.mkdirSync(reel, { recursive: true });
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: { main: "#0d2b2d", pop: "#B9C8A5" }, ...brand }));
  return { dir, home, reel };
};

test("looks page: one palette, nothing from the internet, a data slot, and a sketch for every card type the menu uses", () => {
  const html = fs.readFileSync(path.join(review, "style-menu.html"), "utf8");
  assert.ok(/#f5f2ec/i.test(html) && /#0d2b2d/i.test(html), "cream and teal");
  assert.deepEqual(html.match(/https?:\/\/[a-z0-9.-]+\.(com|net|org)/gi) || [], [], "no outside address");
  assert.equal(html.split("/*MENU*/null").length, 2, "exactly one data slot");
  const kinds = new Set(Object.values(menu).map((l) => l.recipe?.card?.type).filter(Boolean));
  for (const k of kinds) assert.ok(html.includes(`kind === "${k}"`), `a sketch for ${k} cards`);
  const extras = JSON.parse(fs.readFileSync(path.join(skill, "assets", "style-extras.json"), "utf8")).extras;
  for (const x of extras) assert.ok(html.includes(`d === "${x.draw}"`), `a sketch for the ${x.name} extra`);
});

test("style_menu_page.py writes one stand-alone file with the looks and themes inside it", { skip: skipReason }, () => {
  const c = mkHome(), out = path.join(c.dir, "looks.html");
  py("style_menu_page.py", ["--out", out], { REELS_HOME: c.home });
  const html = fs.readFileSync(out, "utf8"), data = JSON.parse(/window\.STYLE_MENU = (.*);\n/.exec(html)[1]);
  assert.equal(data.looks.length, Object.keys(menu).length); assert.equal(data.canSave, false);
  assert.deepEqual(data.themes.map((t) => t.id).sort(), ["bold", "editorial", "handwritten", "whimsical"]);
});

test("style card: 6 lines from picks, theme and brand; picks that are not built are named, not used", { skip: skipReason }, () => {
  const c = mkHome({ pacing: "tight" });
  let out = py("style_card.py", [c.reel], { REELS_HOME: c.home }).split("\n").filter(Boolean);
  assert.deepEqual(out.map((l) => l.split(/\s+/)[0]), ["Hook", "Captions", "Layout", "Motion", "Sound", "Colour"]);
  assert.match(out[0], /not decided yet/); assert.match(out[3], /tight pacing, 1\.1x speed/); assert.match(out[5], /your brand as it is/);
  fs.writeFileSync(path.join(c.reel, "style-picks.json"), JSON.stringify({ ids: ["H3", "C3", "L8"], theme: "bold" }));
  out = py("style_card.py", [c.reel], { REELS_HOME: c.home }).split("\n");
  assert.match(out[0], /H3 Handwritten overline/); assert.match(out[1], /C3 One word at a time; one word at a time/);
  assert.match(out[2], /L8 Stat card pop/); assert.match(out[5], /bold theme/i);
  out = py("style_card.py", [c.reel, "--looks", "h1,L6,Z9"], { REELS_HOME: c.home });
  assert.match(out, /Layout\s+L6 Red X list/); assert.match(out, /NOTE \(tell them\): Z9 is not in the Style Menu/);
  assert.match(out, /NOTE \(tell them\): H1 \(Logo-swap title\) is not built yet/); assert.doesNotMatch(out, /Hook\s+H1/);
  fs.writeFileSync(path.join(c.reel, "edit.json"), JSON.stringify({ cards: [{ type: "title", text: "big / news" }, { type: "stat" }, { type: "tag", off: true }], sfx_events: [{ name: "pop", t: 1 }] }));
  fs.rmSync(path.join(c.reel, "style-picks.json"));
  out = py("style_card.py", [c.reel], { REELS_HOME: c.home });
  assert.match(out, /Hook\s+title card "big\s+news"/); assert.match(out, /in the edit now: 1 stat/); assert.match(out, /a sound as each card comes on, plus 1 placed by hand/); assert.match(out, /title card "big news"/);
});

test("notes: once is a note, twice is a rule in brand.md, the same sitting counts once, forget removes both", { skip: skipReason }, () => {
  const c = mkHome(), env = { REELS_HOME: c.home };
  fs.writeFileSync(path.join(c.home, "brand.md"), "# Brand\n\n## Rules\n\n- never outline captions\n\n## Voice\n\nplain\n");
  assert.match(py("notes.py", ["add", "captions-smaller", "make the captions a bit smaller", "--reel", "r1"], env), /noted once/);
  assert.match(py("notes.py", ["add", "captions-smaller", "captions smaller again", "--reel", "r1"], env), /already noted today/);
  assert.match(py("notes.py", ["list"], env), /HEARD ONCE[\s\S]*captions-smaller: make the captions a bit smaller/);
  assert.match(py("notes.py", ["add", "captions-smaller", "captions are too big", "--reel", "r2"], env), /^RULE: captions are too big/);
  const md = fs.readFileSync(path.join(c.home, "brand.md"), "utf8");
  assert.match(md, /## Rules\n\n- never outline captions\n- captions are too big <!-- note: captions-smaller -->\n\n## Voice/, "the rule sits under Rules, before the next heading");
  assert.match(py("notes.py", ["list"], env), /RULES[^\n]*\n  captions-smaller: captions are too big\nHEARD ONCE[^\n]*\n  none/);
  assert.match(py("notes.py", ["forget", "captions-smaller"], env), /forgot/);
  assert.doesNotMatch(fs.readFileSync(path.join(c.home, "brand.md"), "utf8"), /captions are too big/);
  assert.match(fs.readFileSync(path.join(c.home, "brand.md"), "utf8"), /never outline captions/);
  const c2 = mkHome();                                              // no brand.md yet: it is made, with a Rules heading
  py("notes.py", ["add", "fewer-zooms", "too many zooms", "--reel", "a"], { REELS_HOME: c2.home });
  py("notes.py", ["add", "fewer-zooms", "too many zooms", "--reel", "b"], { REELS_HOME: c2.home });
  assert.match(fs.readFileSync(path.join(c2.home, "brand.md"), "utf8"), /^## Rules\n\n- too many zooms/);
  const c3 = mkHome(); fs.writeFileSync(path.join(c3.home, "brand.md"), "# Brand\nwarm and plain");   // a brand.md with no Rules heading
  py("notes.py", ["add", "k", "one", "--reel", "a"], { REELS_HOME: c3.home }); py("notes.py", ["add", "k", "two", "--reel", "b"], { REELS_HOME: c3.home });
  assert.match(fs.readFileSync(path.join(c3.home, "brand.md"), "utf8"), /^# Brand\nwarm and plain\n\n## Rules\n\n- two <!-- note: k -->\n$/);
});

test("studio server: /styles serves the looks for this reel and saves picks, refusing looks that are not built", { skip: skipReason }, async () => {
  const c = mkHome(); fs.mkdirSync(path.join(c.reel, "review_db", "reel"), { recursive: true });
  fs.writeFileSync(path.join(c.reel, "review_db", "reel", "current.json"), JSON.stringify({ title: "t", words: [] }));
  const port = 5500 + Math.floor(Math.random() * 500);
  const p = spawn("node", [path.join(review, "studio-server.mjs"), c.reel, "--port", String(port)], { env: { ...process.env, REELS_HOME: c.home }, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
  for (let i = 0; i < 100 && !/Reel Studio for/.test(out); i++) await new Promise((r) => setTimeout(r, 100));
  const base = `http://127.0.0.1:${port}`, post = (body) => fetch(base + "/api/style-picks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    assert.match(out, /Reel Studio for/, "server started: " + out);
    const html = await (await fetch(base + "/styles")).text();
    const data = JSON.parse(/window\.STYLE_MENU = (.*);\n/.exec(html)[1]);
    assert.equal(data.reel, "r1"); assert.equal(data.canSave, true); assert.ok(data.looks.some((l) => l.id === "L8"));
    const saved = await (await post({ ids: ["H3", "H1", "L8", "nope", "L8"], theme: "bold" })).json();
    assert.deepEqual(saved.picks, { ids: ["H3", "L8"], extras: [], theme: "bold" }, "H1 is not built and nope is not a look");
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(c.reel, "style-picks.json"), "utf8")), { ids: ["H3", "L8"], extras: [], theme: "bold" });
    assert.ok(data.extras.some((x) => x.id === "A1"), "animations are on the page");   // 0.10.1
    assert.deepEqual((await (await post({ ids: [], extras: ["A1", "A6", "zz"], theme: "" })).json()).picks, { ids: [], extras: ["A1", "A6"], theme: "" });
    const cardOut = py("style_card.py", [c.reel], { REELS_HOME: c.home });
    assert.match(cardOut, /Layout\s+A1 Picture carousel \(needs 3 or more pictures or screenshots\); A6 GIFs that pop up/);
    assert.equal((await post({ ids: [], theme: "../x" })).status, 400);
    assert.equal((await fetch(base + "/api/style-picks", { method: "POST", headers: { "content-type": "application/json", origin: "https://example.test", "sec-fetch-site": "cross-site" }, body: "{}" })).status, 403, "another site can't change picks");
    assert.match(await (await fetch(base + "/review")).text(), /href="\/styles"/);
  } finally { p.kill(); }
});
