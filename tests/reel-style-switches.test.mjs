// Added by By Mel Ross (0.22.0). Three small style switches in scripts/build_reel.py:
//   a caption can carry its own height ("y"), a tag can set its text colour ("text_color"),
//   and the dot in a list card's header can be turned off ("dot": false on a card, "list_dot": false in brand.json).
// Each one changes nothing when it is not used. No render is run: the build writes proj/index.html and the test reads it.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ff, py, skipReason, tmp } from "./reel-helpers.mjs";

function makeReel({ cards = [], captions = [], brand = {} }) {
  const dir = tmp("style-switches"), reel = path.join(dir, "reel"), home = path.join(dir, "home"), engine = path.join(dir, "engine");
  fs.mkdirSync(reel); fs.mkdirSync(home); fs.mkdirSync(path.join(engine, "sfx"), { recursive: true });
  fs.writeFileSync(path.join(engine, "gsap.min.js"), "/* gsap stand-in for the test */");
  ff(["-f", "lavfi", "-i", "testsrc2=s=270x480:r=30:d=4", "-f", "lavfi", "-i", "sine=f=220:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(reel, "master.mp4")]);
  fs.writeFileSync(path.join(home, "brand.json"), JSON.stringify({ colors: { main: "#0d2b2d", pop: "#B9C8A5", light: "#f5f2ec" }, sfx: "none", ...brand }));
  fs.writeFileSync(path.join(reel, "edit.json"), JSON.stringify({ captions, punch: [], cards }));
  const r = py("build_reel.py", [reel], { REELS_HOME: home, REEL_ENGINE: engine });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return fs.readFileSync(path.join(reel, "proj", "index.html"), "utf8");
}
const word = (text, t) => ({ text, t, accent: false });

test("a caption can carry its own height; the others keep the brand's", { skip: skipReason }, () => {
  const html = makeReel({
    brand: { captions: { y: 1300 } },
    captions: [
      { start: 0.2, end: 1.5, words: [word("low", 0.2), word("one", 0.6)] },
      { start: 1.6, end: 3, words: [word("high", 1.6), word("one", 2)], y: 380 },
      { start: 3, end: 3.8, words: [word("bad", 3), word("y", 3.2)], y: "not a number" },
    ],
  });
  const tops = [...html.matchAll(/class="cap[^"]*" style="top:(\d+)px/g)].map((m) => Number(m[1]));
  assert.deepEqual(tops, [1300, 380, 1300], "own y, brand y, and a bad y falls back to the brand's");
});

test("a tag can set its text colour; without it the style carries no colour of its own", { skip: skipReason }, () => {
  const html = makeReel({ cards: [
    { type: "tag", text: "white words", start: 0.5, end: 1.5, color: "#D58C6D", text_color: "#FFFFFF" },
    { type: "tag", text: "plain words", start: 2, end: 3 },
  ] });
  assert.match(html, /<span class="tag" style="background:#D58C6D;color:#FFFFFF;[^"]*">white words</);
  assert.match(html, /<span class="tag" style="background:#B9C8A5;(?!color)[^"]*">plain words</);
});

test("the dot in a list header: on by default, off with the card's dot or brand.json list_dot, the card wins", { skip: skipReason }, () => {
  const card = (title, extra = {}) => ({ type: "card", title, rows: ["a", "b"], start: 0.5, end: 3, ...extra });
  const header = (html, title) => html.match(new RegExp(`<div class="ch"[^>]*>((?:<i></i>)?)${title}</div>`))[1];
  let html = makeReel({ cards: [card("plain"), card("nodot", { dot: false })] });
  assert.equal(header(html, "plain"), "<i></i>", "unchanged by default");
  assert.equal(header(html, "nodot"), "", "a card can turn it off");
  html = makeReel({ brand: { list_dot: false }, cards: [card("brandoff"), card("cardon", { dot: true })] });
  assert.equal(header(html, "brandoff"), "", "brand.json list_dot: false turns it off for every list");
  assert.equal(header(html, "cardon"), "<i></i>", "a card's own dot wins over the brand");
});
