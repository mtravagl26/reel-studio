#!/usr/bin/env python3
"""Added by By Mel Ross (0.9.0). Writes the 7 "curated" sound effects of the FavStash SFX pack from scratch.

The pack used to ship 7 recordings supplied from a personal sound library, which the code licence did not cover. These are
replacements with the same file names, lengths and roles, synthesised here with nothing but the Python standard library, so every
sound in the repository is original and Apache-2.0. Deterministic: the same bytes every run.

  python3 scripts/make_curated_sfx.py          rewrite the 7 files and their manifest entries
"""
import hashlib, json, math, struct, wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACK = ROOT / "skills/3-editing/edit-video/assets/sfx"
SR = 48000
TAU = 2 * math.pi


class Noise:
    """A small fixed-seed generator, so the noise is the same on every machine."""
    def __init__(self, seed): self.s = seed
    def __call__(self):
        self.s = (self.s * 1103515245 + 12345) & 0x7FFFFFFF
        return self.s / 0x3FFFFFFF - 1.0


def one_pole(xs, hz, high=False):
    a = math.exp(-TAU * hz / SR); y = 0.0; out = []
    for x in xs:
        y = (1 - a) * x + a * y
        out.append(x - y if high else y)
    return out


def band(xs, lo, hi): return one_pole(one_pole(xs, lo, high=True), hi)
def env(t, attack, decay): return min(t / attack, 1.0) * math.exp(-t / decay) if t >= 0 else 0.0


def click(n, at, seed, lo, hi, decay, gain):
    noise = Noise(seed); raw = band([noise() for _ in range(n)], lo, hi)
    return [raw[i] * env(i / SR - at, 0.0006, decay) * gain for i in range(n)]


def shutter(dur, hits):
    n = int(dur * SR); out = [0.0] * n
    for k, (at, gain) in enumerate(hits):
        for i, v in enumerate(click(n, at, 7 + k, 1400, 7000, 0.012, gain)): out[i] += v
        for i in range(n):                                                    # the small mechanical "thunk" under each click
            t = i / SR - at
            if t >= 0: out[i] += 0.35 * gain * math.sin(TAU * 240 * t) * math.exp(-t / 0.018)
    return out


def ui_pop(dur=0.2):
    out = []; ph = 0.0
    for i in range(int(dur * SR)):
        t = i / SR; f = 380 + 620 * (1 - math.exp(-t / 0.02)); ph += TAU * f / SR
        out.append(math.sin(ph) * env(t, 0.002, 0.045))
    return out


def ui_click(dur=0.3):
    n = int(dur * SR); tick = click(n, 0.0, 21, 2500, 9000, 0.004, 0.9)
    return [tick[i] + 0.5 * math.sin(TAU * 1750 * i / SR) * env(i / SR, 0.0005, 0.012) for i in range(n)]


def zoom_swish(dur=0.76):
    n = int(dur * SR); noise = Noise(33); out = []; lo = hi = 0.0
    for i in range(n):
        t = i / SR; x = noise(); shape = math.sin(math.pi * t / dur) ** 2          # rises to the middle of the move, then falls away
        cut = 500 + 5200 * shape; a = math.exp(-TAU * cut / SR)
        lo = (1 - a) * x + a * lo; b = math.exp(-TAU * (cut * 0.35) / SR); hi = (1 - b) * lo + b * hi
        out.append((lo - hi) * shape * 1.6)
    return out


def hook_impact(dur=1.9):
    n = int(dur * SR); hit = click(n, 0.0, 51, 60, 2600, 0.03, 0.8); out = []; ph = 0.0
    for i in range(n):
        t = i / SR; f = 46 + 70 * math.exp(-t / 0.05); ph += TAU * f / SR
        out.append(hit[i] + math.sin(ph) * env(t, 0.003, 0.42) + 0.25 * math.sin(2 * ph) * env(t, 0.003, 0.16))
    return out


def metallic_riser(dur=1.64):
    n = int(dur * SR); out = []; phases = [0.0] * 5; ratios = [1.0, 1.52, 2.14, 2.76, 3.41]   # uneven partials read as metal
    for i in range(n):
        t = i / SR; p = t / dur; f = 320 * (2 ** (1.6 * p)); v = 0.0
        for k, r in enumerate(ratios):
            phases[k] += TAU * f * r / SR; v += math.sin(phases[k]) / (k + 1.5)
        swell = p ** 2.2 * (1 - max(0.0, (p - 0.965) / 0.035))                                # builds, then stops clean on the reveal
        out.append(v * swell * (0.8 + 0.2 * math.sin(TAU * (6 + 10 * p) * t)))
    return out


SOUNDS = {
    "camera-shutter": lambda: shutter(0.31, [(0.004, 1.0), (0.105, 0.8)]),
    "camera-shutter-light": lambda: shutter(0.16, [(0.004, 0.7)]),
    "ui-pop": ui_pop,
    "ui-click": ui_click,
    "zoom-swish": zoom_swish,
    "hook-impact": hook_impact,
    "metallic-riser": metallic_riser,
}
PROVENANCE = "Synthesised by scripts/make_curated_sfx.py (By Mel Ross); contains no third-party recording. Replaces a recording of the same name that was supplied from a personal library."


def write(path, samples):
    peak = max(abs(v) for v in samples) or 1.0                      # written at a -8 dB peak, like the rest of the pack
    fade = int(0.004 * SR)                                                     # 4 ms out, so no file ends on a click
    data = bytearray()
    for i, v in enumerate(samples):
        g = min(1.0, (len(samples) - 1 - i) / fade)
        data += struct.pack("<h", int(max(-1.0, min(1.0, v / peak * 0.398 * g)) * 32767))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(bytes(data))


if __name__ == "__main__":
    manifest = json.load(open(PACK / "manifest.json"))
    by_id = {s["id"]: s for s in manifest["sounds"]}
    for name, make in SOUNDS.items():
        out = PACK / "curated" / f"{name}.wav"; samples = make(); write(out, samples)
        entry = by_id[name]
        entry["durationSeconds"] = round(len(samples) / SR, 2)
        entry["sha256"] = hashlib.sha256(out.read_bytes()).hexdigest()
        entry["license"] = "Apache-2.0"; entry["provenance"] = PROVENANCE
        for stale in ("sourceFileName", "sourceTrimStartSeconds", "preparedTargetPeakDb"): entry.pop(stale, None)
        print(f"{name}: {entry['durationSeconds']} s")
    json.dump(manifest, open(PACK / "manifest.json", "w"), indent=2); open(PACK / "manifest.json", "a").write("\n")
