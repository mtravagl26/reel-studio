// Added by By Mel Ross (themes, 0.8.0). A theme is the look of a reel, laid over brand.json: fonts, caption look, title look, card
// shapes. The brand's own colours and identity stay as they are.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ff, py, run, scripts, skill, skipReason, tmp } from "./reel-helpers.mjs";

const NAMES = ["editorial", "bold", "handwritten", "whimsical", "minimal"];
const BRAND = { name: "Test Co", colors: { main: "#112233", pop: "#aabbcc", light: "#fdfdfd" }, sfx: "none",
  fonts: { head: { family: "Georgia", weight: 700 } }, captions: { size: 92, y: 1250 } };

function makeReel(brand = BRAND, edit = {}) {
  const dir = tmp("themes"), reel = path.join(dir, "reel"), home = path.join(dir, "home"), engine = path.join(dir, "engine");
  fs.mkdirSync(reel); fs.mkdirSync(home); fs.mkdirSync(path.join(engine, "sfx"), { recursive: true });
  fs.writeFileSync(path.join(engine, "gsap.min.js"), "/* gsap stand-in for the test */");
  ff(["-f", "lavfi", "-i", "testsrc2=s=270x480:r=30:d=3", "-f", "lavfi", "-i", "sine=f=220:d=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(reel, "master.mp4")]);
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify(brand));
  fs.writeFileSync(path.join(reel, "edit.json"), JSON.stringify({ punch: [],
    captions: [{ start: 1.6, end: 2.6, words: [{ text: "one", t: 1.6 }, { text: "clip", t: 2.0, accent: true }] }],
    cards: [{ type: "title", start: 0.2, end: 1.4, text: "five / tools", overline: "for owners" }, { type: "tag", start: 1.6, end: 2.6, text: "step one" }], ...edit }));
  return { reel, home, env: { REELS_HOME: home, REEL_ENGINE: engine } };
}
const build = (c, args = []) => py("build_reel.py", [c.reel, ...args], c.env);
const html = (c) => fs.readFileSync(path.join(c.reel, "proj", "index.html"), "utf8");
const themePy = (code, env) => run("python3", ["-c", `import sys, json; sys.path.insert(0, ${JSON.stringify(scripts)}); import theme\n${code}`], env);

test("the 5 built-in themes are complete: fonts on disk with a licence, nothing that is not styling", { skip: skipReason }, () => {
  for (const n of NAMES) {
    const dir = path.join(skill, "themes", n), t = JSON.parse(fs.readFileSync(path.join(dir, "theme.json"), "utf8"));
    assert.ok(t.name && t.summary, `${n}: name and summary`);
    for (const role of ["head", "body", "accent"]) assert.ok(t.brand.fonts[role]?.file, `${n}: ${role} font`);
    for (const k of Object.keys(t.brand)) assert.ok(!["name", "vocabulary", "deliver_dir", "mix", "enhance"].includes(k), `${n}: a theme does not touch brand.${k}`);
    for (const k of ["main", "pop", "light"]) assert.equal(t.brand.colors?.[k], undefined, `${n}: the brand's own colours stay`);
    assert.doesNotMatch(JSON.stringify(t.css), /<|url\(|@import|expression\(/i, `${n}: css is rules only`);
  }
  const shared = fs.readdirSync(path.join(skill, "themes", "_fonts"));
  for (const f of shared.filter((x) => /\.(ttf|otf|woff2?)$/.test(x))) {
    const fam = f.split(/[-.]/)[0];
    assert.ok(shared.includes(`OFL-${fam}.txt`), `${f} ships with its licence`);
  }
});

test("no theme: the brand is used exactly as written", { skip: skipReason }, () => {
  const c = makeReel();
  const r = build(c);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /^theme:/m);
  assert.match(html(c), /Georgia/);
});

for (const n of NAMES) {
  test(`theme ${n}: builds, brings its fonts, keeps the brand's colours`, { skip: skipReason }, () => {
    const c = makeReel({ ...BRAND, theme: n });
    const r = build(c);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, new RegExp(`^theme: ${n}$`, "m"));
    assert.doesNotMatch(r.stdout, /font file not found/, "the theme's bundled fonts are found");
    const h = html(c), t = JSON.parse(fs.readFileSync(path.join(skill, "themes", n, "theme.json"), "utf8"));
    assert.ok(h.includes(`"${t.brand.fonts.head.family}-head"`), "head font face from the theme");
    assert.doesNotMatch(h, /Georgia-head/, "the theme's font replaces the brand's");
    assert.ok(/#112233|#aabbcc|#fdfdfd/i.test(h), "brand colours are used");
    assert.doesNotMatch(h, /@(main|pop|light|head|body|accent|hand)\b/, "every colour and font token is filled in");
  });
}

test("--theme and edit.json pick a theme for one reel; theme_overrides keeps one thing your own way", { skip: skipReason }, () => {
  const c = makeReel({ ...BRAND, theme: "editorial", theme_overrides: { captions: { size: 40 } } }, { theme: "bold" });
  assert.match(build(c).stdout, /^theme: bold$/m, "edit.json wins over brand.json");
  assert.match(build(c, ["--theme", "whimsical"]).stdout, /^theme: whimsical$/m, "--theme wins over both");
  const r = themePy(`b = theme.load_brand(${JSON.stringify(c.home)}, name="bold"); print(json.dumps({"size": b["captions"]["size"], "case": b["captions"]["case"], "name": b["name"], "cap": b["colors"]["caption"]}))`);
  assert.deepEqual(JSON.parse(r.stdout), { size: 40, case: "sentence", name: "Test Co", cap: "#112233" });
});

test("an unknown theme falls back to the brand with a warning; a theme folder in ~/reels/themes wins over the built-in one", { skip: skipReason }, () => {
  const c = makeReel({ ...BRAND, theme: "nope" });
  const r = build(c);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /warning: theme 'nope' not found/);
  const mine = path.join(c.home, "themes", "bold"); fs.mkdirSync(mine, { recursive: true });
  fs.writeFileSync(path.join(mine, "theme.json"), JSON.stringify({ name: "My bold", brand: { captions: { size: 33 } }, css: ['.cap { color: @pop; }<script>x</script>'] }));
  const out = themePy(`b = theme.load_brand(${JSON.stringify(c.home)}, name="bold"); print(b["captions"]["size"]); print(theme.css_for(b, {"head": "'X'"}))`);
  assert.match(out.stdout, /^33$/m);
  assert.match(out.stdout, /\.cap \{ color: #aabbcc; \}/);
  assert.doesNotMatch(out.stdout, /<script>/, "tags are stripped from theme css");
  assert.equal(themePy(`print(theme.load_brand(${JSON.stringify(c.home)}, name="../../etc").get("_theme"))`).stdout.trim().split("\n").pop(), "None", "a theme name is a plain folder name");
});

test("minimal theme: one-word lowercase captions low at the left edge, cream caps titles, the hook's spaced line, a red X sticker (0.32.0)", { skip: skipReason }, () => {
  const c = makeReel();
  const r = build(c, ["--theme", "minimal"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const h = html(c);
  assert.match(h, /@font-face \{ font-family: "Instrument Serif-head"; src: url\("fonts\/InstrumentSerif-Regular.ttf"\)/);
  assert.match(h, /@font-face \{ font-family: "Shadows Into Light-accent"/);
  assert.match(h, /\.cap \{ left: 40px; right: auto; max-width: 380px; text-align: left; text-transform: lowercase;/, "captions pinned to the left edge from theme.json, no engine change");
  assert.match(h, /id="c0" class="cap[^"]*" style="top:1180px;[^"]*color:#F3E7C9/, "small cream captions low on the left, clear of most hair");
  assert.match(h, /\.title \.tl:not\(\.tsub\):not\(\.ol\):not\(\.tlab\) \{ text-transform: uppercase; \}/);
  assert.match(h, /\.title:has\(\.tsub\) \{ top: 150px !important; \}/, "a title with a sub line is the hook, at the top");
  assert.match(h, /class="title"[^>]*top:980px;color:#F5EDB8/, "titles sit over the torso in warm cream");
  const t = JSON.parse(fs.readFileSync(path.join(skill, "themes", "minimal", "theme.json"), "utf8"));
  assert.equal(t.brand.captions.mode, "word");
  const x = fs.readFileSync(path.join(skill, "themes", "minimal", "red-x.svg"), "utf8");
  assert.match(x, /^<svg[^>]*stroke="#D93A2F"/); assert.doesNotMatch(x, /<script|href=/i);
});
