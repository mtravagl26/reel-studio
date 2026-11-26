// Added by By Mel Ross (0.12.0). The home page: framing check and kind of reel.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ff, py, skill, skipReason, tmp } from "./reel-helpers.mjs";

const review = path.join(skill, "review");
/** A 4 s upright test clip, and a white-on-black oval matte standing in for the person: cy and ry as shares of the height. */
function clipWith({ size = "540x960", cy = 0.6, ry = 0.3, rx = 0.2, cx = 0.5, luma = null, fps = 30 } = {}) {
  const dir = tmp("home"), clip = path.join(dir, "take.mp4"), matte = path.join(dir, "matte.mkv");
  const src = luma == null ? `testsrc2=s=${size}:r=${fps}:d=4` : `color=c=0x${luma.toString(16).padStart(2, "0").repeat(3)}:s=${size}:r=${fps}:d=4`;
  ff(["-f", "lavfi", "-i", src, "-f", "lavfi", "-i", "sine=d=4", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", clip]);   // 0.37.2: with sound, like a real take
  ff(["-f", "lavfi", "-i", `color=c=black:s=270x480:r=10:d=4,geq=lum='if(lte(pow((X-W*${cx})/(W*${rx}),2)+pow((Y-H*${cy})/(H*${ry}),2),1),255,0)':cb=128:cr=128`, "-pix_fmt", "gray", "-c:v", "ffv1", matte]);
  return { dir, clip, matte };
}
const check = (c, env = {}) => { const r = py("framing_check.py", [c.clip, "--json"], { REEL_FRAMING_MATTE: c.matte, REELS_HOME: c.dir, ...env }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout.trim().split("\n").pop()); };
const state = (res, id) => res.checks.find((x) => x.id === id).state;

test("framing check: a well-framed clip is good; no headroom, sideways, dark and too-close each say retake with a fix", { skip: skipReason }, () => {
  const good = check(clipWith());                                   // head starts 30% down
  assert.equal(good.verdict, "good"); assert.deepEqual(good.checks.map((c) => c.id), ["upright", "length", "format", "movement", "light", "headroom", "safe", "whole"]);
  for (const id of ["upright", "length", "format", "movement", "headroom", "safe", "whole"]) assert.equal(state(good, id), "pass", id);
  assert.ok(Math.abs(good.head.top - 0.3) < 0.03, "head top found near 30%: " + good.head.top);

  const tight = check(clipWith({ cy: 0.38, ry: 0.3 }));              // head starts 8% down
  assert.equal(tight.verdict, "retake"); assert.equal(state(tight, "headroom"), "retake");
  assert.match(tight.checks.find((c) => c.id === "headroom").fix, /Step back or tilt the phone up/); assert.match(tight.headline, /A title has nowhere to go/);

  const snug = check(clipWith({ cy: 0.48, ry: 0.3 }));               // 18%: usable, with a note
  assert.equal(snug.verdict, "good"); assert.equal(state(snug, "headroom"), "note");

  const wide = check(clipWith({ size: "960x540" }));
  assert.equal(state(wide, "upright"), "retake"); assert.equal(wide.verdict, "retake");

  const dark = check(clipWith({ luma: 20 })); assert.equal(state(dark, "light"), "retake"); assert.match(dark.checks.find((c) => c.id === "light").fix, /Face a window/);
  const close = check(clipWith({ rx: 0.49, ry: 0.3 })); assert.equal(state(close, "whole"), "retake");
  const heavy = check(clipWith({ fps: 60 })); assert.equal(state(heavy, "upright"), "note"); assert.equal(heavy.verdict, "good");
});

test("framing check: with no way to find the head, the three head checks are skipped and said so, never passed", { skip: skipReason }, () => {
  const c = clipWith(), r = py("framing_check.py", [c.clip, "--json"], { REEL_FRAMING_MATTE: "", REEL_NO_CUTOUT: "1", REEL_FRAMING_NO_FACES: "1", REELS_HOME: c.dir });
  const res = JSON.parse(r.stdout.trim().split("\n").pop());
  for (const id of ["headroom", "safe", "whole"]) assert.equal(state(res, id), "skipped", id);
  assert.equal(res.verdict, "good"); assert.match(res.headline, /head checks could not run here/); assert.equal(res.head, null);
  const text = py("framing_check.py", [c.clip], { REEL_NO_CUTOUT: "1", REEL_FRAMING_NO_FACES: "1", REELS_HOME: c.dir }).stdout;
  assert.match(text, /skipped Space above your head/); assert.match(text, /^GOOD: Nothing wrong found, but/m);
});

test("home page: only built formats are offered, nothing loads from the internet, one data slot", () => {
  const html = fs.readFileSync(path.join(review, "home.html"), "utf8");
  assert.ok(/#f5f2ec/i.test(html) && /#0d2b2d/i.test(html), "cream and teal");
  assert.deepEqual(html.match(/https?:\/\/[a-z0-9.-]+\.(com|net|org)/gi) || [], [], "no outside address");
  assert.equal(html.split("/*HOME*/null").length, 2);
  const formats = JSON.parse(fs.readFileSync(path.join(skill, "assets", "formats.json"), "utf8")).formats;
  for (const f of formats.filter((x) => x.status === "ready")) for (const s of f.styles) assert.ok(s.ask && s.name && s.does, `${f.id}/${s.id} has the words for the request`);
  assert.ok(formats.some((f) => f.status === "not-built"), "unbuilt formats are listed in the file");
  assert.doesNotMatch(html, /coming soon/i);
});

test("home server: checks an uploaded clip, keeps it in the inbox, lists reels, refuses other sites and non-videos", { skip: skipReason }, async () => {
  const c = clipWith(), home = path.join(c.dir, "reels"); fs.mkdirSync(path.join(home, "2026-11-01-old"), { recursive: true });
  fs.writeFileSync(path.join(home, "2026-11-01-old", "edit.json"), "{}"); fs.mkdirSync(path.join(home, "themes"));
  const port = 6100 + Math.floor(Math.random() * 500);
  const p = spawn("node", [path.join(review, "home-server.mjs"), "--port", String(port)], { env: { ...process.env, REELS_HOME: home, REEL_FRAMING_MATTE: c.matte }, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
  for (let i = 0; i < 100 && !/Reel Studio home:/.test(out); i++) await new Promise((r) => setTimeout(r, 100));
  const base = `http://127.0.0.1:${port}`;
  try {
    assert.match(out, /Reel Studio home:/, "server started: " + out);
    const data = JSON.parse(/window\.REEL_HOME = (.*);\n/.exec(await (await fetch(base + "/")).text())[1]);
    assert.deepEqual(data.formats.map((f) => f.id), ["talking-head"], "only what is built");
    assert.deepEqual(data.reels.map((r) => [r.name, r.state]), [["2026-11-01-old", "in progress"]]); assert.equal(data.brand, false);
    const body = fs.readFileSync(c.clip);
    const j = await (await fetch(base + "/api/check?name=" + encodeURIComponent("My take (1).MOV"), { method: "POST", body })).json();
    assert.equal(j.ok, true, JSON.stringify(j)); assert.equal(j.result.verdict, "good"); assert.match(j.saved, /inbox\/My-take-1\.mov$/);
    assert.ok(fs.existsSync(path.join(home, "inbox", "My-take-1.mov")));
    assert.equal((await fetch(base + j.frame)).headers.get("content-type"), "image/jpeg");
    const again = await (await fetch(base + "/api/check?name=" + encodeURIComponent("My take (1).MOV"), { method: "POST", body })).json();
    assert.match(again.saved, /My-take-1-2\.mov$/, "a second clip with the same name does not overwrite the first");
    // audit 3: two uploads of one name at the same moment both land, under different names, and the page counts what is kept
    const pair = await Promise.all([1, 2].map(() => fetch(base + "/api/check?name=twin.mp4", { method: "POST", body }).then((r) => r.json())));
    assert.deepEqual(pair.map((x) => x.ok), [true, true], JSON.stringify(pair)); assert.notEqual(pair[0].saved, pair[1].saved);
    assert.deepEqual(fs.readdirSync(path.join(home, "inbox")).filter((n) => n.endsWith(".part")), [], "no half-written files left");
    const after = JSON.parse(/window\.REEL_HOME = (.*);\n/.exec(await (await fetch(base + "/")).text())[1]);
    assert.equal(after.kept.count, 4); assert.ok(after.kept.bytes > 0);
    assert.equal((await fetch(base + "/api/check?name=notes.txt", { method: "POST", body: "hi" })).status, 400);
    const junk = await fetch(base + "/api/check?name=junk.mp4", { method: "POST", body: "not a video" });
    assert.equal(junk.status, 400); assert.match((await junk.json()).error, /couldn't be read as a video/);
    assert.equal((await fetch(base + "/api/check?name=x.mp4", { method: "POST", body, headers: { origin: "https://example.test", "sec-fetch-site": "cross-site" } })).status, 403);
    assert.equal((await fetch(base + "/frame/..%2F..%2Fbrand.jpg")).status, 404);
  } finally { p.kill(); }
});
