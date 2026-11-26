// Added by By Mel Ross (0.15.0). The pages save the GIPHY key themselves, and an SVG file can be a graphic.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { py, skill, skipReason, tmp, pageText } from "./reel-helpers.mjs";
const core = await import(new URL("../skills/3-editing/reel-editor/review/editor-core.mjs", import.meta.url));

const review = path.join(skill, "review");

test("the pages save a GIPHY key to this computer, keep other keys, and take SVG pictures with anything that could run removed", { skip: skipReason }, async () => {
  const dir = tmp("gkey"), home = path.join(dir, "reels"), reel = path.join(home, "r1");
  fs.mkdirSync(path.join(reel, "review_db", "reel"), { recursive: true });
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: { main: "#0d2b2d", pop: "#B9C8A5", light: "#f5f2ec" } }));
  fs.writeFileSync(path.join(reel, "review_db", "reel", "current.json"), JSON.stringify({ title: "t", words: [] }));
  const envFile = path.join(dir, ".config", "reels", ".env");
  fs.mkdirSync(path.dirname(envFile), { recursive: true }); fs.writeFileSync(envFile, "ELEVENLABS_API_KEY=keepme\nGIPHY_API_KEY=\n");
  const port = 6100 + Math.floor(Math.random() * 500);
  const p = spawn("node", [path.join(review, "studio-server.mjs"), reel, "--port", String(port)], { env: { ...process.env, REELS_HOME: home, HOME: dir, GIPHY_API_KEY: "", REEL_GIPHY_NO_CHECK: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
  for (let i = 0; i < 100 && !/Reel Studio for/.test(out); i++) await new Promise((r) => setTimeout(r, 100));
  const base = `http://127.0.0.1:${port}`;
  const save = (key, headers = {}, agree = true) => fetch(base + "/api/giphy-key-save", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ key, agree }) });
  const up = (name, body) => fetch(base + "/api/review-upload?name=" + encodeURIComponent(name), { method: "POST", body });
  try {
    assert.match(out, /Reel Studio for/, "server started: " + out);
    assert.deepEqual(await (await fetch(base + "/api/review-giphy-key")).json(), { key: null });
    for (const bad of ["", "has spaces in it", "short", "../../etc/passwd", "abc\nELEVENLABS_API_KEY=x"]) {
      const r = await save(bad); assert.equal(r.status, 400, JSON.stringify(bad)); assert.equal((await r.json()).ok, false);
    }
    assert.equal(fs.readFileSync(envFile, "utf8"), "ELEVENLABS_API_KEY=keepme\nGIPHY_API_KEY=\n", "a refused key changes nothing");
    // GIPHY is opt-in (license review 2026-11-17): a good key without the warning box ticked is refused and nothing is written.
    const noAgree = await save("AbCdEfGh1234567890abcdefGHIJKLmn", {}, false);
    assert.equal(noAgree.status, 400); assert.match((await noAgree.json()).error, /GIPHY warning/);
    assert.equal(fs.readFileSync(envFile, "utf8"), "ELEVENLABS_API_KEY=keepme\nGIPHY_API_KEY=\n", "no tick, nothing saved");
    assert.equal((await save("AbCdEfGh1234567890abcdefGHIJKLmn", { origin: "https://example.test", "sec-fetch-site": "cross-site" })).status, 403, "another site can't set the key");
    const ok = await (await save("  GIPHY_API_KEY=AbCdEfGh1234567890abcdefGHIJKLmn ")).json();
    assert.deepEqual(ok, { ok: true, tested: false }, "pasting the whole line works too");
    assert.equal(fs.readFileSync(envFile, "utf8"), "ELEVENLABS_API_KEY=keepme\nGIPHY_API_KEY=AbCdEfGh1234567890abcdefGHIJKLmn\nGIPHY_OPT_IN=1\n");
    assert.equal(fs.statSync(envFile).mode & 0o777, 0o600, "only the person can read the file");
    assert.deepEqual(await (await fetch(base + "/api/review-giphy-key")).json(), { key: "AbCdEfGh1234567890abcdefGHIJKLmn" }, "search works without restarting the link");
    await save("ZZZZEfGh1234567890abcdefGHIJKLmn");
    assert.equal(fs.readFileSync(envFile, "utf8").match(/GIPHY_API_KEY=/g).length, 1, "a new key replaces the old one");
    assert.equal(fs.readFileSync(envFile, "utf8").match(/GIPHY_OPT_IN=1/g).length, 1, "the opt-in is written once");
    fs.writeFileSync(envFile, "ELEVENLABS_API_KEY=keepme\nGIPHY_API_KEY=AbCdEfGh1234567890abcdefGHIJKLmn\n");
    assert.deepEqual(await (await fetch(base + "/api/review-giphy-key")).json(), { key: null }, "a key saved before the opt-in stays off until the box is ticked");

    const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="300" viewBox="0 0 100 50" onload="alert(1)">
      <script>alert(2)</script><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><iframe src="https://example.test"></iframe></body></foreignObject>
      <image href="https://example.test/track.png"/><use xlink:href="#a"/><a href="javascript:alert(3)"><rect id="a" width="100" height="50" fill="#B9C8A5" onclick="x()"/></a></svg>`;
    const j = await (await up("My Logo.svg", svg)).json();
    assert.equal(j.ok, true, JSON.stringify(j)); assert.match(j.upload.src, /^popups\/[a-z0-9]+-My-Logo\.svg$/);
    assert.equal(j.upload.w, 300); assert.equal(j.upload.h, 150, "height worked out from the viewBox"); assert.equal(j.upload.video, false);
    const kept = fs.readFileSync(path.join(reel, j.upload.src), "utf8");
    assert.doesNotMatch(kept, /script|onload|onclick|foreignObject|iframe|javascript:|example\.test/i);
    assert.match(kept, /<rect id="a" width="100" height="50" fill="#B9C8A5"\s*\/>/); assert.match(kept, /xlink:href="#a"/, "links inside the picture stay");
    const got = await fetch(base + "/files/" + j.upload.src);
    assert.equal(got.headers.get("content-type"), "image/svg+xml"); assert.match(got.headers.get("content-security-policy"), /default-src 'none'.*sandbox/);
    const no = await up("fake.svg", "just some text"); assert.equal(no.status, 400); assert.match((await no.json()).error, /not an SVG/);
    assert.equal(fs.readdirSync(path.join(reel, "popups")).filter((n) => /fake/.test(n)).length, 0);
    assert.equal((await up("big.svg", "<svg>" + " ".repeat(5e6 + 10) + "</svg>")).status, 400);
    assert.match((await (await up("notes.txt", "x")).json()).error, /svg/);
  } finally { p.kill(); }
});

test("both pages ask for the GIPHY key themselves and accept SVG files", () => {
  const rv = pageText(path.join(review, "reel-review.html")), ed = pageText(path.join(review, "editor.html"));
  for (const [n, h] of [["review", rv], ["touch-ups", ed]]) {
    assert.match(h, /GIPHY's rules say apps should not store copies of GIPHY content/, n + ": the full warning before it is turned on");
    assert.match(h, /a reel you post with one may (go against|conflict with)/, n); assert.match(h, /Powered By/, n); assert.match(h, /agree/, n + ": the tick box is sent");
    assert.match(h, /\/api\/giphy-key-save/, n); assert.match(h, /Paste your GIPHY key/, n); assert.match(h, /API \(not SDK\)/, n);
    assert.match(h, /type\s*=\s*"password"/, n + ": the key is hidden while typed"); assert.match(h, /\.svg/, n);
    assert.doesNotMatch(h, /tell Claude "add my GIPHY key"|set up GIPHY for the reel editor/, n + ": no trip back to chat");
  }
});

test("the pages explain themselves: tips beside the terms, the cover step last, and a Popups box that says what to do first", () => {
  const rv = pageText(path.join(review, "reel-review.html")), ed = pageText(path.join(review, "editor.html")), th = fs.readFileSync(path.join(review, "thumbnail.html"), "utf8");
  for (const [n, h] of [["review", rv], ["touch-ups", ed]]) {
    const tips = JSON.parse(/const TIPS = (\[[\s\S]*?\n\]);/.exec(h)[1]);
    assert.ok(tips.length >= 10, `${n}: ${tips.length} tips`);
    for (const [sel, starts, tip] of tips) { assert.ok(sel && starts, n); assert.ok(tip.length > 20 && tip.length < 240 && !/[\u2014]/.test(tip), `${n}: "${starts}" tip is one or two plain sentences`); }
    assert.match(h, /e\.preventDefault\(\); e\.stopPropagation\(\);/, n + ": a ? inside a section title does not open the section");
  }
  for (const [n, h] of [["review", rv], ["touch-ups", ed], ["cover", th]]) assert.match(h, /1 Edit<\/a>\s*<a[^>]*data-step="cover"[^>]*>2 Cover<\/a>\s*<a[^>]*data-step="caption"[^>]*>3 Caption<\/a>/, n + ": cover, then caption, after Edit");
  assert.match(ed, /First pause the video at the moment you want it/); assert.match(ed, /From this computer/); assert.match(ed, /Pick a file to use it again/); assert.match(ed, /Special effect/);
  assert.match(fs.readFileSync(path.join(skill, "SKILL.md"), "utf8"), /Before step 1: they choose the kind of reel/);
});

// 0.16.0
test("touch-ups: a new picture goes in the middle, a second one pairs up, lists and popup labels can be changed", () => {
  const o = { dur: 20 };
  let edit = { captions: [], cards: [], sfx_events: [] };
  let r = core.applyOp(edit, { op: "card_add", card: { type: "popup", start: 2, src: "popups/a.png" } }, o); edit = r.edit;
  assert.equal(edit.cards[0].pos, "center"); assert.ok(!r.info.paired);
  r = core.applyOp(edit, { op: "card_add", card: { type: "popup", start: 3, src: "popups/b.png" } }, o); edit = r.edit;
  assert.deepEqual(edit.cards.map((c) => c.pos), ["side-left", "side-right"]); assert.equal(r.info.paired, true);
  r = core.applyOp(edit, { op: "card_add", card: { type: "popup", start: 12, src: "popups/c.png" } }, o); edit = r.edit;
  assert.equal(edit.cards[2].pos, "center", "not on screen with the others");
  assert.equal(core.applyOp(edit, { op: "card_add", card: { type: "popup", start: 15, src: "popups/v.clip.mp4" } }, o).edit.cards.find((c) => /clip/.test(c.src)).pos, "center", "video clips go in the middle too");
  assert.deepEqual(core.popupBox({ src: "popups/a.png" }, 400, 200), { left: 360, top: 870, w: 360, h: 180 }, "no place set = the middle");
  assert.deepEqual(core.popupBox({ src: "popups/a.png", pos: "side-left", size: 700 }, 400, 200), { left: 28, top: 835, w: 500, h: 250 });
  assert.deepEqual(core.popupBox({ src: "popups/a.png", pos: "side-right" }, 400, 200), { left: 552, top: 870, w: 360, h: 180 });
  edit = core.applyOp(edit, { op: "card_set", i: 0, set: { layer: "behind", caption: " post it " } }, o).edit;
  assert.equal(edit.cards[0].layer, "behind"); assert.equal(edit.cards[0].caption, "post it");
  edit = core.applyOp(edit, { op: "card_set", i: 0, set: { caption: "", layer: "front" } }, o).edit;
  assert.ok(!("caption" in edit.cards[0])); assert.ok(!("layer" in edit.cards[0]));
  r = core.applyOp(edit, { op: "card_add", card: { type: "card", start: 5 } }, o); edit = r.edit; const li = r.info.index;
  assert.equal(edit.cards[li].type, "card"); assert.equal(edit.cards[li].end, 9); assert.ok(edit.cards[li].rows.length >= 1);
  edit = core.applyOp(edit, { op: "card_set", i: li, set: { title: "my AI team", rows: ["Claude", "", "  Wispr Flow ", "Canva"] } }, o).edit;
  assert.deepEqual(edit.cards[li].rows, ["Claude", "Wispr Flow", "Canva"]); assert.equal(edit.cards[li].title, "my AI team");
  assert.throws(() => core.applyOp(edit, { op: "card_set", i: li, set: { rows: ["", " "] } }, o), /at least 1 row/);
  const ed = pageText(path.join(review, "editor.html")), rv = pageText(path.join(review, "reel-review.html"));
  for (const t of ["In front of my face", "Behind my head", "Handwritten label under it", "List title", "+ Add a list at this point", "Left of a pair"]) assert.ok(ed.includes(t), t);
  for (const t of ["Middle (covers part of my face)", "Behind my head (Mac only)", "function placer"]) assert.ok(rv.includes(t), t);
});

test("a caption fix stays on the word it was made on when timing moves, and says so when that word is gone", { skip: skipReason }, () => {
  const code = `
import json, sys
sys.path.insert(0, sys.argv[1])
import touchups
keep = [[0, 10]]
def edit(words): return {"captions": [{"start": 0, "end": 5, "words": [{"text": t, "t": at, "accent": False} for t, at in words]}], "cards": [], "hash": "h"}
touch = {"speed": 1.0, "dropped": [], "words": [{"src": 1.0, "text": "to", "accent": False, "was": "too"}], "cards": {"added": [], "changed": [], "deleted": []}, "sounds": {"added": [], "changed": [], "deleted": []}, "extra": {}}
out = {}
for name, words in (("same", [("it", 0.5), ("too", 1.0), ("a", 1.5)]), ("moved", [("it", 0.5), ("a", 1.01), ("too", 1.4)]), ("gone", [("it", 0.5), ("a", 1.0), ("friend", 1.5)])):
    e = edit(words); kept, lost = touchups.apply(touch, e, keep, 1.0)
    out[name] = {"words": [w["text"] for w in e["captions"][0]["words"]], "kept": kept, "lost": lost}
print(json.dumps(out))
`;
  const f = path.join(tmp("capfix"), "t.py"); fs.writeFileSync(f, code);
  const r = spawnSync("python3", [f, path.join(skill, "scripts")], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr); const o = JSON.parse(r.stdout);
  assert.deepEqual(o.same.words, ["it", "to", "a"]);
  assert.deepEqual(o.moved.words, ["it", "a", "to"], "the fix follows its word; the neighbour is left alone");
  assert.deepEqual(o.gone.words, ["it", "a", "friend"], "no word is changed when the fixed word is not there");
  assert.match(o.gone.lost.join(" "), /caption fix "too" to "to".*left alone/);
});

test("the color box: 3 colors for this reel or for every reel, used by the build and kept through a re-import", { skip: skipReason }, async () => {
  const dir = tmp("colors"), home = path.join(dir, "reels"), reel = path.join(home, "r1");
  fs.mkdirSync(reel, { recursive: true });
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: { main: "#0d2b2d", pop: "#B9C8A5", light: "#f5f2ec" }, theme: "whimsical" }));
  fs.writeFileSync(path.join(reel, "edit.json"), JSON.stringify({ colors: { main: "#112233", pop: "not a color", extra: "#000000" } }));
  const code = 'import json,sys\nsys.path.insert(0, sys.argv[1])\nimport theme\nb = theme.load_brand(sys.argv[2], sys.argv[3], None, True)\nprint(json.dumps({"c": b["colors"], "over": b["_theme"]["cards"]["title"]["overline_color"]}))';
  const f = path.join(dir, "t.py"); fs.writeFileSync(f, code);
  const r = spawnSync("python3", [f, path.join(skill, "scripts"), home, reel], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr);
  const got = JSON.parse(r.stdout);
  assert.equal(got.c.main, "#112233"); assert.equal(got.c.pop, "#B9C8A5", "a bad value is ignored"); assert.ok(!("extra" in got.c));
  fs.writeFileSync(path.join(reel, "edit.json"), JSON.stringify({ colors: { pop: "#FF0066" } }));
  assert.equal(JSON.parse(spawnSync("python3", [f, path.join(skill, "scripts"), home, reel], { encoding: "utf8" }).stdout).over, "#FF0066", "the theme takes its accent from this reel's pop color");
  const ed = pageText(path.join(review, "editor.html")), rv = pageText(path.join(review, "reel-review.html")), srv = fs.readFileSync(path.join(review, "editor-server.mjs"), "utf8");
  for (const t of ["Use for this reel", "Use for every reel", "Back to my brand colors", 'type="color"']) assert.ok(ed.includes(t), t);
  assert.match(rv, /Colors for this reel/); assert.match(rv, /S\.colors = null/); assert.match(srv, /"\/api\/colors"/);
  assert.match(fs.readFileSync(path.join(review, "core.js"), "utf8"), /if \(d\.colors\) parts\.push\(d\.colors\)/);
});

// 0.17.0
test("live preview: the server builds the reel page in its own folder, serves it with a driver, and reuses converted clips", { skip: skipReason }, async () => {
  const ed = pageText(path.join(review, "editor.html")), srv = fs.readFileSync(path.join(review, "editor-server.mjs"), "utf8"), build = fs.readFileSync(path.join(skill, "scripts", "build_reel.py"), "utf8");
  for (const t of ['id="live"', 'id="liveOn"', "/api/live", "reelLive.sync(v.currentTime", "liveSoon()"]) assert.ok(ed.includes(t), t);
  for (const t of ["proj_live", "REEL_PROJ_DIR: tmpDir", "window.reelLive=", 'p.startsWith("/live/")', "A render is running. The live preview comes back"]) assert.ok(srv.includes(t), t);
  assert.match(build, /if os\.environ\.get\("REEL_PROJ_DIR"\):\s+proj = Path\(os\.environ\["REEL_PROJ_DIR"\]\)/); assert.match(build, /ASSET_CACHE = reel \/ "\.asset-cache"/);
  assert.doesNotMatch(srv.split("const LIVE_DRIVER")[1].split("`;")[0], /https?:\/\//, "the driver loads nothing from outside");
});

// 0.19.0: sound effects are on by default and are the person's choice, never a theme's.
test("sound effects are on by default, no theme turns them off, and one reel or every reel can be switched", { skip: skipReason }, async () => {
  const themes = path.join(skill, "themes");
  for (const n of fs.readdirSync(themes)) { const f = path.join(themes, n, "theme.json"); if (fs.existsSync(f)) assert.ok(!("sfx" in (JSON.parse(fs.readFileSync(f, "utf8")).brand || {})), `${n} does not set sound effects`); }
  assert.equal(JSON.parse(fs.readFileSync(path.join(skill, "..", "..", "..", "brand", "brand.example.json"), "utf8")).sfx, "subtle", "a new brand file starts with sounds on");
  const dir = tmp("sfxdef"), home = path.join(dir, "reels"), reel = path.join(home, "r1"); fs.mkdirSync(reel, { recursive: true });
  const code = 'import json,sys\nsys.path.insert(0, sys.argv[1])\nimport theme\nprint(json.dumps(theme.load_brand(sys.argv[2], sys.argv[3], None, True).get("sfx", "subtle")))';
  const f = path.join(dir, "t.py"); fs.writeFileSync(f, code);
  const eff = (brand, edit) => { fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: { main: "#0d2b2d", pop: "#B9C8A5", light: "#f5f2ec" }, ...brand })); fs.writeFileSync(path.join(reel, "edit.json"), JSON.stringify(edit));
    const r = spawnSync("python3", [f, path.join(skill, "scripts"), home, reel], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  assert.equal(eff({}, {}), "subtle"); assert.equal(eff({ theme: "editorial" }, {}), "subtle", "the Editorial theme used to switch sounds off");
  assert.equal(eff({ sfx: "none", theme: "bold" }, {}), "none", "the brand's own choice holds under any theme");
  assert.equal(eff({ sfx: "none" }, { sfx: "subtle" }), "subtle", "on for this reel"); assert.equal(eff({}, { sfx: "none" }), "none", "off for this reel");
  const ed = pageText(path.join(review, "editor.html")), rv = pageText(path.join(review, "reel-review.html"));
  assert.match(ed, /data-a="sfx-master" data-v="off" data-s="reel"/); assert.match(ed, /always on/); assert.match(rv, /Sound effects on/); assert.match(rv, /S\.sfxAll = v/);
});

// 0.20.0: the caption step
test("caption step: the script checks drafts against Instagram's limits, the page saves and writes caption.txt, delivery copies it", { skip: skipReason }, async () => {
  const dir = tmp("caption"), home = path.join(dir, "reels"), reel = path.join(home, "r1"); fs.mkdirSync(reel, { recursive: true });
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: { main: "#0d2b2d", pop: "#B9C8A5", light: "#f5f2ec" } }));
  fs.writeFileSync(path.join(home, "brand.md"), "# Brand\n\n## Rules\n- no long dashes\n- digits for numbers\n");
  fs.writeFileSync(path.join(reel, "edit.json"), JSON.stringify({ captions: [{ start: 0, end: 2, words: [{ text: "Match", t: 0 }, { text: "the", t: 0.4 }, { text: "model", t: 0.8 }] }] }));
  const cap = (...a) => spawnSync("python3", [path.join(skill, "scripts", "caption.py"), ...a], { encoding: "utf8" });
  const brief = cap("brief", reel); assert.equal(brief.status, 0, brief.stderr);
  for (const t of ["Match the model", "no long dashes", "at most 125 characters", "3 to 5", "No invented stories"]) assert.ok(brief.stdout.includes(t), t);
  assert.equal(cap("check", reel).status, 1, "no drafts yet");
  const body = (n) => "A line about the reel. ".repeat(n).trim();
  const good = { platform: "instagram", keyword: "REEL", gift: "the link", chosen: null, drafts: [
    { id: "short", hook: "First hook", body: body(3), cta: "", hashtags: ["#one", "two", "#three"] },
    { id: "medium", hook: "Second hook", body: body(12), cta: "", hashtags: ["#one", "#two", "#three", "#four"] },
    { id: "long", hook: "Third hook", body: body(30), cta: "Tell me yours below.", hashtags: ["#one", "#two", "#three", "#four", "#five"] }] };
  fs.writeFileSync(path.join(reel, "caption.json"), JSON.stringify(good));
  const ok = cap("check", reel); assert.equal(ok.status, 0, ok.stdout);
  assert.match(cap("text", reel, "short").stdout, /^First hook\n\nA line[\s\S]*\n\nComment REEL and I'll send you the link\.\n\n#one #two #three\n$/);
  const bad = JSON.parse(JSON.stringify(good)); bad.drafts[0].hook = "x".repeat(126); bad.drafts[1].hashtags = ["#a", "#b", "#c", "#d", "#e", "#f"]; bad.drafts[2].hook = "Second hook"; bad.drafts[2].body += " #tag";
  fs.writeFileSync(path.join(reel, "caption.json"), JSON.stringify(bad));
  const no = cap("check", reel); assert.equal(no.status, 1);
  for (const t of ["the hook is 126 characters", "6 hashtags", "2 of them are the same", "hashtags go in the hashtags list"]) assert.ok(no.stdout.includes(t), t + "\n" + no.stdout);

  // style, emojis and the kind of ask
  const styled = { ...JSON.parse(JSON.stringify(good)), tone: "sarcastic", emoji: 1, ask: "follow", more: "AI words" };
  fs.writeFileSync(path.join(reel, "caption.json"), JSON.stringify(styled));
  const b2 = cap("brief", reel).stdout; for (const t of ["sarcastic: aimed at the situation", "a few (1 or 2)", "THE ASK: follow for more AI words", '"written": {"tone": "sarcastic", "emoji": 1}']) assert.ok(b2.includes(t), t + "\n" + b2);
  const c2 = cap("check", reel); assert.equal(c2.status, 1); assert.match(c2.stdout, /short: 0 emojis; they asked for a few/);
  for (const x of styled.drafts) x.body += " \u2728";
  styled.drafts[2].cta = ""; fs.writeFileSync(path.join(reel, "caption.json"), JSON.stringify(styled));
  assert.equal(cap("check", reel).status, 0, cap("check", reel).stdout); assert.match(cap("text", reel, "long").stdout, /\n\nFollow for more AI words\.\n\n#one/);
  styled.ask = "none"; fs.writeFileSync(path.join(reel, "caption.json"), JSON.stringify(styled));
  assert.equal(cap("check", reel).status, 0, "no ask is allowed"); assert.doesNotMatch(cap("text", reel, "short").stdout, /Comment|Follow/);

  fs.writeFileSync(path.join(reel, "caption.json"), JSON.stringify(good));
  const port = 6700 + Math.floor(Math.random() * 500), base = `http://127.0.0.1:${port}`;
  const p = spawn("node", [path.join(review, "editor-server.mjs"), reel, "--port", String(port)], { env: { ...process.env, REELS_HOME: home, GIPHY_API_KEY: "" }, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
  for (let i = 0; i < 100 && !/http:\/\//.test(out); i++) await new Promise((r) => setTimeout(r, 100));
  const post = (b, h = {}) => fetch(base + "/api/caption", { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(b) });
  try {
    assert.match(await (await fetch(base + "/caption")).text(), /Write the caption/);
    const v = await (await fetch(base + "/api/caption")).json();
    assert.equal(v.caption.drafts.length, 3); assert.equal(v.limits.hashtagsMax, 5); assert.deepEqual(v.caption.drafts[0].hashtags, ["#one", "#two", "#three"]); assert.equal(v.links.caption, "/caption");
    assert.equal((await post(good, { origin: "https://example.test", "sec-fetch-site": "cross-site" })).status, 403);
    const edited = JSON.parse(JSON.stringify(good)); edited.keyword = "models!"; edited.gift = "my cheat sheet"; edited.chosen = "medium"; edited.drafts[1].hashtags = "#a #b #c #d #e #f #g"; edited.drafts[1].hook = "New\nhook";
    const s1 = await (await post(edited)).json(); assert.equal(s1.ok, true, JSON.stringify(s1));
    assert.equal(s1.caption.keyword, "MODELS"); assert.equal(s1.caption.drafts[1].hashtags.length, 5, "never more than 5"); assert.equal(s1.caption.drafts[1].hook, "New hook");
    assert.match(fs.readFileSync(path.join(reel, "caption.txt"), "utf8"), /^New hook\n\n[\s\S]*Comment MODELS and I'll send you my cheat sheet\.\n\n#a #b #c #d #e\n$/);
    assert.deepEqual(v.settings, { tone: "mine", emoji: 0, ask: "keyword", more: "" }); assert.equal(v.tones.sarcastic, "Sarcastic");
    const s3 = await (await post({ ...edited, tone: "witty", emoji: 2, ask: "save", written: { tone: "mine", emoji: 0 } })).json();
    assert.equal(s3.settings.tone, "witty"); assert.equal(s3.settings.emoji, 2); assert.deepEqual(s3.written, { tone: "mine", emoji: 0 });
    assert.match(fs.readFileSync(path.join(reel, "caption.txt"), "utf8"), /\n\nSave this so you can find it later\.\n\n#a/, "the closing line follows the kind of ask");
    assert.equal((await (await post({ ...edited, tone: "rude", emoji: 9, ask: "spam" })).json()).settings.tone, "mine", "an unknown style falls back");
    const big = JSON.parse(JSON.stringify(good)); big.drafts[2].body = "x".repeat(2200);
    const s2 = await post(big); assert.equal(s2.status, 400); assert.match((await s2.json()).error, /Instagram holds 2200/);
    edited.chosen = null; await post(edited); assert.ok(!fs.existsSync(path.join(reel, "caption.txt")), "nothing chosen, no file");
  } finally { p.kill(); }
  const cp = fs.readFileSync(path.join(review, "caption.html"), "utf8");
  for (const t of ['id="tones"', 'id="emojis"', 'id="asks"', "Take the emojis out now", "Follow for more", "Rewrite the Instagram captions"]) assert.ok(cp.includes(t), t);
  for (const f of ["editor.html", "reel-review.html", "thumbnail.html", "caption.html"]) assert.match(fs.readFileSync(path.join(review, f), "utf8"), /data-step="caption"[^>]*>3 Caption</, f + " has the caption step");
  assert.match(fs.readFileSync(path.join(skill, "scripts", "deliver.sh"), "utf8"), /caption\.txt" "\$DIR\/\$NAME caption\.txt"/);
  assert.match(fs.readFileSync(path.join(skill, "SKILL.md"), "utf8"), /references\/caption\.md/);
});
