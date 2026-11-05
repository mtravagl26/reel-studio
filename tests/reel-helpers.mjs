// Added by By Mel Ross. Shared helpers for the reel-editor tests: skill paths, small synthetic media made with ffmpeg,
// and measurements. Tests skip (not fail) when ffmpeg or python3 isn't on the machine.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("..", import.meta.url));
export const skill = path.join(root, "skills", "3-editing", "reel-editor");
export const scripts = path.join(skill, "scripts");

const has = (cmd, args = ["-version"]) => spawnSync(cmd, args, { encoding: "utf8" }).status === 0;
export const haveFfmpeg = has("ffmpeg");
export const havePython = has("python3", ["--version"]);
export const haveVp9 = haveFfmpeg && /libvpx-vp9/.test(spawnSync("ffmpeg", ["-hide_banner", "-encoders"], { encoding: "utf8" }).stdout);
export const skipReason = !havePython ? "python3 not installed" : !haveFfmpeg ? "ffmpeg not installed" : false;

export const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `reel-${name}-`));

export function run(cmd, args, env = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", env: { ...process.env, ...env, HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1" } });
}
export const py = (script, args, env) => run("python3", [path.join(scripts, script), ...args], env);
export const ff = (args) => {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(" ")}\n${r.stderr}`);
};

/** Reads a 16-bit PCM WAV: { rate, channels, samples:Int16Array (interleaved) }. */
export function readWav(file) {
  const b = fs.readFileSync(file);
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) {
    const id = b.toString("ascii", p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === "fmt ") fmt = { tag: b.readUInt16LE(p + 8), channels: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === "data") data = b.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size % 2);
  }
  return { ...fmt, samples: new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.length)) };
}

/** Mean level (dB) of an audio file between t0 and t1 seconds, from ffmpeg's volumedetect. */
export function meanDb(file, t0, t1) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-ss", String(t0), "-t", String(t1 - t0), "-i", file, "-vn", "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  const m = r.stderr.match(/mean_volume:\s*(-?[\d.]+|-inf) dB/);
  return m ? (m[1] === "-inf" ? -99 : parseFloat(m[1])) : -99;
}
