#!/usr/bin/env node
// Added by By Mel Ross (0.14.0). Print what was done to a reel, in plain lines, counted from its own files.
// Usage: node receipt.mjs <reel-folder>     Paste the lines to the person when you deliver.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as core from "./editor-core.mjs";

const reel = path.resolve(process.argv[2] || ".");
const read = (f, dflt) => { try { return JSON.parse(fs.readFileSync(path.join(reel, f), "utf8")); } catch { return dflt; } };
const edl = read("edl.json", null), edit = read("edit.json", null);
if (!edl || !edit) { console.error("This reel has no edit yet (edl.json and edit.json)."); process.exit(1); }
const state = read("editor/state.json", null) || { speed: edl.speed || 1, xfade: 0, pieces: (edl.keep || []).map(([a, b], i) => ({ id: "p" + (i + 1), a, b, kept: true })) };
let srcDur = null;
try {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.resolve(reel, edl.source || "raw.mp4")], { encoding: "utf8" });
  srcDur = Number(r.stdout.trim()) || null;
} catch {}
for (const l of core.receipt({ state, edit, srcDur, themeName: edit.theme || null, kitName: edit.kit && edit.kit !== "none" ? edit.kit : null })) console.log("- " + l.text);
