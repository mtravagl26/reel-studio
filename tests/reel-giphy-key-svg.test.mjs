// Added by By Mel Ross (0.15.0). The pages save the GIPHY key themselves, and an SVG file can be a graphic.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { skill, skipReason, tmp } from "./reel-helpers.mjs";

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
  const save = (key, headers = {}) => fetch(base + "/api/giphy-key-save", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ key }) });
  const up = (name, body) => fetch(base + "/api/review-upload?name=" + encodeURIComponent(name), { method: "POST", body });
  try {
    assert.match(out, /Reel Studio for/, "server started: " + out);
    assert.deepEqual(await (await fetch(base + "/api/review-giphy-key")).json(), { key: null });
    for (const bad of ["", "has spaces in it", "short", "../../etc/passwd", "abc\nELEVENLABS_API_KEY=x"]) {
      const r = await save(bad); assert.equal(r.status, 400, JSON.stringify(bad)); assert.equal((await r.json()).ok, false);
    }
    assert.equal(fs.readFileSync(envFile, "utf8"), "ELEVENLABS_API_KEY=keepme\nGIPHY_API_KEY=\n", "a refused key changes nothing");
    assert.equal((await save("AbCdEfGh1234567890abcdefGHIJKLmn", { origin: "https://example.test", "sec-fetch-site": "cross-site" })).status, 403, "another site can't set the key");
    const ok = await (await save("  GIPHY_API_KEY=AbCdEfGh1234567890abcdefGHIJKLmn ")).json();
    assert.deepEqual(ok, { ok: true, tested: false }, "pasting the whole line works too");
    assert.equal(fs.readFileSync(envFile, "utf8"), "ELEVENLABS_API_KEY=keepme\nGIPHY_API_KEY=AbCdEfGh1234567890abcdefGHIJKLmn\n");
    assert.equal(fs.statSync(envFile).mode & 0o777, 0o600, "only the person can read the file");
    assert.deepEqual(await (await fetch(base + "/api/review-giphy-key")).json(), { key: "AbCdEfGh1234567890abcdefGHIJKLmn" }, "search works without restarting the link");
    await save("ZZZZEfGh1234567890abcdefGHIJKLmn");
    assert.equal(fs.readFileSync(envFile, "utf8").match(/GIPHY_API_KEY=/g).length, 1, "a new key replaces the old one");

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
  const rv = fs.readFileSync(path.join(review, "reel-review.html"), "utf8"), ed = fs.readFileSync(path.join(review, "editor.html"), "utf8");
  for (const [n, h] of [["review", rv], ["touch-ups", ed]]) {
    assert.match(h, /\/api\/giphy-key-save/, n); assert.match(h, /Paste your GIPHY key/, n); assert.match(h, /API \(not SDK\)/, n);
    assert.match(h, /type\s*=\s*"password"/, n + ": the key is hidden while typed"); assert.match(h, /\.svg/, n);
    assert.doesNotMatch(h, /tell Claude "add my GIPHY key"|set up GIPHY for the reel editor/, n + ": no trip back to chat");
  }
});

test("the pages explain themselves: tips beside the terms, the cover step last, and a Popups box that says what to do first", () => {
  const rv = fs.readFileSync(path.join(review, "reel-review.html"), "utf8"), ed = fs.readFileSync(path.join(review, "editor.html"), "utf8"), th = fs.readFileSync(path.join(review, "thumbnail.html"), "utf8");
  for (const [n, h] of [["review", rv], ["touch-ups", ed]]) {
    const tips = JSON.parse(/const TIPS = (\[[\s\S]*?\n\]);/.exec(h)[1]);
    assert.ok(tips.length >= 10, `${n}: ${tips.length} tips`);
    for (const [sel, starts, tip] of tips) { assert.ok(sel && starts, n); assert.ok(tip.length > 20 && tip.length < 240 && !/[\u2014]/.test(tip), `${n}: "${starts}" tip is one or two plain sentences`); }
    assert.match(h, /e\.preventDefault\(\); e\.stopPropagation\(\);/, n + ": a ? inside a section title does not open the section");
  }
  for (const [n, h] of [["review", rv], ["touch-ups", ed], ["cover", th]]) assert.match(h, /1 Review<\/a>\s*<a[^>]*data-step="touchups"[^>]*>2 Touch-ups<\/a>\s*<a[^>]*data-step="cover"[^>]*>3 Cover<\/a>/, n + ": the cover is the last step");
  assert.match(ed, /First pause the video at the moment you want it/); assert.match(ed, /From this computer/); assert.match(ed, /Pick a file to use it again/); assert.match(ed, /Special effect/);
  assert.match(fs.readFileSync(path.join(skill, "SKILL.md"), "utf8"), /Before step 1: they choose the kind of reel/);
});
