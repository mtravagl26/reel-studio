// Added by By Mel Ross. Runs the two thumbnail studio tests from Claude Reel Editor (Nicola Pocock, MIT) under `npm test`.
// Both skip (exit 0) when the local engine fonts are not built; the browser test also skips without Google Chrome.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { run, root, skipReason } from "./reel-helpers.mjs";

test("thumbnail studio server", { skip: skipReason }, () => {
  const r = run("python3", ["-I", path.join(root, "tests", "test_thumbnail_studio.py")]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("thumbnail studio in a browser", { skip: skipReason, timeout: 120000 }, () => {
  const r = run("node", [path.join(root, "tests", "test_thumbnail_ui.mjs")]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
