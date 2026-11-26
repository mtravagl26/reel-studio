// Added by By Mel Ross (0.26.0). Captions high or low, captions moved for part of a reel, captions stepping aside for a
// graphic, the Instagram overlay, looks on the home page, the false-start finder, and the caption-fix carry-over that
// copied a neighbouring word's text.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ff, py, skipReason, tmp, pageText } from "./reel-helpers.mjs";

const skill = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "3-editing", "reel-editor"), review = path.join(skill, "review");
const pyrun = (code, ...args) => { const f = path.join(tmp("pyrun"), "t.py"); fs.writeFileSync(f, code); const r = spawnSync("python3", [f, path.join(skill, "scripts"), ...args], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };

function build({ edit = {}, brand = {} }) {
  const dir = tmp("layout"), reel = path.join(dir, "reel"), home = path.join(dir, "home"), engine = path.join(dir, "engine");
  fs.mkdirSync(reel); fs.mkdirSync(home); fs.mkdirSync(path.join(engine, "sfx"), { recursive: true });
  fs.writeFileSync(path.join(engine, "gsap.min.js"), "/* stand-in */");
  ff(["-f", "lavfi", "-i", "color=c=gray:s=270x480:r=30:d=6", "-f", "lavfi", "-i", "sine=f=220:d=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(reel, "master.mp4")]);
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: { main: "#0d2b2d", pop: "#B9C8A5", light: "#f5f2ec" }, sfx: "none", ...brand }));
  const caps = [0, 1, 2, 3, 4].map((k) => ({ start: k + 0.1, end: k + 1, words: [{ text: "line", t: k + 0.1 }, { text: String(k), t: k + 0.5 }] }));
  fs.writeFileSync(path.join(reel, "edit.json"), JSON.stringify({ captions: caps, punch: [], cards: [], ...edit }));
  const r = py("build_reel.py", [reel], { REELS_HOME: home, REEL_ENGINE: engine });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const html = fs.readFileSync(path.join(reel, "proj", "index.html"), "utf8");
  const tops = {}; for (const m of html.matchAll(/id="c(\d+)" class="cap[^"]*" style="top:(\d+)px/g)) tops[m[1]] = Number(m[2]);
  return { html, tops };
}

test("layout: captions at the bottom by default, above the head with captions-high, and text graphics move to the lower third", { skip: skipReason }, () => {
  const low = build({ edit: { cards: [{ type: "tag", text: "NEW", start: 0, end: 1, quiet: false }] } });
  assert.equal(low.tops["0"], 1250); assert.match(low.html, /class="tagw" style="top:300px"/);
  const high = build({ edit: { layout: "captions-high", cards: [{ type: "tag", text: "NEW", start: 0, end: 1, quiet: false }, { type: "card", title: "3", rows: ["a", "b", "c"], start: 2, end: 3, quiet: false }] } });
  assert.equal(high.tops["0"], 290); assert.match(high.html, /class="tagw" style="top:1180px"/);
  assert.match(high.html, /class="card[^"]*" style="top:(\d+)px/); assert.ok(Number(high.html.match(/class="card[^"]*" style="top:(\d+)px/)[1]) > 900, "the list sits low");
  const every = build({ brand: { layout: "captions-high" } }); assert.equal(every.tops["0"], 290, "brand.json sets it for every reel");
  const back = build({ brand: { layout: "captions-high" }, edit: { layout: "captions-low" } }); assert.equal(back.tops["0"], 1250, "this reel can say otherwise");
});

test("a caption can be moved or hidden, and captions under a graphic move to the other zone instead of vanishing", { skip: skipReason }, () => {
  const r = build({ edit: { captions: [
    { start: 0.1, end: 1, pos: "top", words: [{ text: "up", t: 0.1 }] }, { start: 1.1, end: 2, pos: "middle", words: [{ text: "mid", t: 1.1 }] },
    { start: 2.1, end: 3, pos: "hide", words: [{ text: "gone", t: 2.1 }] }, { start: 3.1, end: 4, words: [{ text: "low", t: 3.1 }] },
    { start: 4.1, end: 5, words: [{ text: "covered", t: 4.1 }] }],
    cards: [{ type: "card", title: "list", rows: ["a", "b", "c"], y: 1000, start: 4.0, end: 5.5, quiet: false }] } });
  assert.equal(r.tops["0"], 290); assert.equal(r.tops["1"], 900); assert.equal(r.tops["2"], undefined, "hidden");
  assert.equal(r.tops["3"], 1250); assert.equal(r.tops["4"], 290, "moved to the top while the list covers the bottom");
});

test("false starts: doubled words, restarts, broken-off words and retakes are found; real repeats are left alone", () => {
  const o = pyrun(`
import json, sys
sys.path.insert(0, sys.argv[1])
import false_starts as F
def W(text, start=0.0, step=0.3, dur=0.25):
    out = []; t = start
    for tok in text.split():
        d = 0.1 if tok.endswith("~") else dur
        out.append({"text": tok.rstrip("~"), "s": round(t, 2), "e": round(t + d, 2)}); t += step + (0.3 if tok.endswith("~") else 0)
    return out
cases = {
  "doubled": W("names that start with with GPT."),
  "restart": W("The app you, the app you open is the car."),
  "cutoff": W("I want to expl~ explain this."),
  "retake": W("A model is the engine of AI. A model is the engine behind AI."),
  "clean": W("Knock knock. Never never give up. That that is."),
  "already": W("with with GPT."),
}
out = {}
for k, ws in cases.items():
    f = F.find(ws, [0] if k == "already" else [])
    out[k] = [[f_["kind"], " ".join(ws[i]["text"] for i in f_["w"])] for f_ in f]
print(json.dumps(out))
`);
  assert.deepEqual(o.doubled, [["doubled", "with"]]);
  assert.deepEqual(o.restart, [["restart", "The app you,"]]);
  assert.deepEqual(o.cutoff, [["cut-off", "expl"]]);
  assert.deepEqual(o.retake, [["retake", "A model is the engine of AI."]]);
  assert.deepEqual(o.clean, [], "knock knock, never never, that that stay");
  assert.deepEqual(o.already, [], "a word Claude already cut is not listed again");
});

test("a caption fix is not copied onto a neighbouring word that starts within 0.03 s (the Model reel's 'with with')", { skip: skipReason }, () => {
  const dir = tmp("capfix2"), reel = path.join(dir, "r"); fs.mkdirSync(path.join(reel, "editor"), { recursive: true });
  const cap = (a, b, c) => ({ captions: [{ start: 20.9, end: 21.5, words: [{ text: a, t: 20.91, accent: false }, { text: b, t: 20.94, accent: false }, { text: c, t: 21.32, accent: false }] }], cards: [], hash: "h" });
  fs.writeFileSync(path.join(reel, "editor", "import-base.json"), JSON.stringify({ edit: cap("start", "with", "GPT"), keep: [[0, 60]], speed: 1 }));
  fs.writeFileSync(path.join(reel, "edit.json"), JSON.stringify(cap("start", "with", "GPT")));
  fs.writeFileSync(path.join(reel, "edl.json"), JSON.stringify({ keep: [[0, 60]] }));
  const o = pyrun(`
import json, sys
sys.path.insert(0, sys.argv[1])
import touchups
t = touchups.collect(sys.argv[2])
e = json.load(open(sys.argv[2] + "/edit.json"))
kept, lost = touchups.apply(t, e, [[0, 60]], 1.0)
print(json.dumps({"fixes": t["words"], "words": [w["text"] for w in e["captions"][0]["words"]]}))
`, reel);
  assert.deepEqual(o.fixes, [], "nothing was changed, so nothing is a fix");
  assert.deepEqual(o.words, ["start", "with", "GPT"]);
});

test("the pages: captions spot on both pages, move some captions, the Instagram overlay, looks on the home page, false-start labels", () => {
  const rv = pageText(path.join(review, "reel-review.html")), ed = pageText(path.join(review, "editor.html")), home = fs.readFileSync(path.join(review, "home.html"), "utf8");
  for (const t of ["Captions above your head instead?", "Above my head", "Move some captions", "Hide them", "Show what Instagram covers", "falseStarts", "Bottom (lower third)"]) assert.ok(rv.includes(t), t);
  for (const t of ["Where captions sit", 'data-a="layout"', "Show what Instagram covers", 'href="/styles"']) assert.ok(ed.includes(t), t);
  for (const t of ["Pick a look", "My brand as it is", "Arched title with a sparkle wave", 'href="/looks"']) assert.ok(home.includes(t), t);
  assert.match(fs.readFileSync(path.join(review, "editor-server.mjs"), "utf8"), /"\/api\/layout"/);
  const menu = JSON.parse(fs.readFileSync(path.join(skill, "assets", "style-menu.json"), "utf8")).looks;
  assert.equal(menu.H20.status, "built"); assert.equal(menu.H20.recipe.card.type, "arctitle");
});

test("home page: the looks gallery saves picks, and they go into the request", { skip: skipReason }, async () => {
  const home = tmp("homepicks"), port = 4870 + Math.floor(Math.random() * 40);
  const srv = spawn("node", [path.join(review, "home-server.mjs"), "--port", String(port)], { env: { ...process.env, REELS_HOME: home }, stdio: "ignore" });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let k = 0; k < 40; k++) { try { await fetch(base + "/looks"); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
    const page = await (await fetch(base + "/looks")).text();
    assert.match(page, /"saveUrl":"\/api\/home-picks"/); assert.match(page, /"H20"/);
    const r = await (await fetch(base + "/api/home-picks", { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ ids: ["H20", "ZZ9"], theme: "bold" }) })).json();
    assert.deepEqual(r.picks.ids, ["H20"], "unknown looks are dropped"); assert.equal(r.picks.theme, "bold");
    const bad = await fetch(base + "/api/home-picks", { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ theme: "../x" }) });
    assert.equal(bad.status, 400);
    assert.match(await (await fetch(base + "/")).text(), /"picks":\{"ids":\["H20"\]/);
  } finally { srv.kill(); }
});

test("word timing: whisper-cli's aligned times replace late Whisper times, and the check measures them against the audio (0.29.0)", { skip: skipReason }, () => {
  const dir = tmp("wordtiming"), home = path.join(dir, "home"), bin = path.join(dir, "bin");
  fs.mkdirSync(path.join(home, ".cache/hyperframes/whisper/models"), { recursive: true }); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(home, ".cache/hyperframes/whisper/models/ggml-small.en.bin"), "stand-in");
  // a stand-in whisper-cli: refuses to align unless flash attention is off, then writes the -ojf JSON with t_dtw
  fs.writeFileSync(path.join(bin, "whisper-cli"), `#!/usr/bin/env python3
import json, sys
a = sys.argv
assert "-nfa" in a and a[a.index("-dtw") + 1] == "small.en", a
toks = [{"text": "[_BEG_]", "t_dtw": -1}] + [{"text": " " + w, "t_dtw": int(k * 100 + 100)} for k, w in enumerate(["one", "two", "three", "four", "five"])]
json.dump({"transcription": [{"tokens": toks}]}, open(a[a.index("-of") + 1] + ".json", "w"))
`, { mode: 0o755 });
  const wav = path.join(dir, "v.wav");
  ff(["-f", "lavfi", "-i", "aevalsrc='" + [1, 2, 3, 4, 5].map((k) => `sin(2*PI*220*t)*between(t,${k},${k + 0.4})`).join("+") + "+0.001*random(0)':s=16000:d=6", wav]);
  const late = ["one", "two", "three", "four", "five"].map((w, k) => ({ text: w, start: k + 1.3, end: k + 1.6 }));
  const words = path.join(dir, "w.json"); fs.writeFileSync(words, JSON.stringify(late));
  const r = spawnSync("python3", [path.join(skill, "scripts", "word_timing.py"), "retime", wav, words], { encoding: "utf8", env: { ...process.env, HOME: home, PATH: bin + ":" + process.env.PATH } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /5 of 5 words moved/); assert.match(r.stdout, /word starts: on time/);
  assert.deepEqual(JSON.parse(fs.readFileSync(words, "utf8")).map((w) => w.start), [1, 2, 3, 4, 5]);
  const c = spawnSync("python3", [path.join(skill, "scripts", "word_timing.py"), "check", wav, words], { encoding: "utf8" });
  fs.writeFileSync(words, JSON.stringify(late));
  const c2 = spawnSync("python3", [path.join(skill, "scripts", "word_timing.py"), "check", wav, words], { encoding: "utf8" });
  assert.match(c.stdout, /on time/); assert.match(c2.stdout, /0\.30 s late on average/);
  // no whisper-cli: the words are kept as they were, with a reason
  fs.writeFileSync(words, JSON.stringify(late));
  const n = spawnSync("python3", [path.join(skill, "scripts", "word_timing.py"), "retime", wav, words], { encoding: "utf8", env: { ...process.env, HOME: dir, PATH: "/usr/bin:/bin" } });
  assert.match(n.stdout, /isn't installed yet/); assert.equal(JSON.parse(fs.readFileSync(words, "utf8"))[0].start, 1.3);
});

test("caption_lead shows captions earlier; edit.json wins over brand.json (0.29.0)", { skip: skipReason }, () => {
  const at = (html, k) => Number(html.match(new RegExp(`"#c${k}",\\{autoAlpha:1\\},([\\d.]+)\\)`))[1]);
  const base = build({}), lead = build({ edit: { caption_lead: 0.2 } }), all = build({ brand: { caption_lead: 0.3 } }), off = build({ brand: { caption_lead: 0.3 }, edit: { caption_lead: 0 } }), big = build({ edit: { caption_lead: 9 } });
  assert.equal(at(base.html, 1), 1.1);
  assert.ok(Math.abs(at(lead.html, 1) - 0.9) < 0.001, "0.2 s earlier for this reel");
  assert.ok(Math.abs(at(all.html, 2) - 1.8) < 0.001, "brand.json sets it for every reel");
  assert.equal(at(off.html, 1), 1.1, "this reel can say 0");
  assert.ok(Math.abs(at(big.html, 1) - 0.6) < 0.001, "capped at 0.5 s");
  assert.equal(at(lead.html, 0), 0, "never before 0");
});

test("a note or list card before a stat, tiles or labelled picture card builds (the tape() name isn't reused)", { skip: skipReason }, () => {
  const r = build({ edit: { cards: [
    { type: "note", text: "a note", start: 0.2, end: 0.6 },
    { type: "card", title: "my list", rows: ["one", "two"], start: 0.7, end: 1.0 },
    { type: "stat", value: "12", label: "hours", start: 1.1, end: 1.5 },
    { type: "tiles", label: "my tools", tiles: ["a", "b", "c"], start: 1.6, end: 2.0 },
  ] } });
  assert.match(r.html, /class="notew"/); assert.match(r.html, /12/); assert.match(r.html, /my tools/);
});
