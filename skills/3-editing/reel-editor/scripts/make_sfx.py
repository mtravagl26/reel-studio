#!/usr/bin/env python3
"""Added by By Mel Ross. Generate the reel editor's sound-effects library.

Every effect here is original synthesis written for this project: plain Python (standard library only, no downloads,
no samples, no third-party audio). So there is nothing to license beyond the project's own license (Apache-2.0).
The six effects the reel editor started with (whoosh, swish, pop, snap, chime, typing) are still made by
setup_engine.sh with ffmpeg; this script adds the rest and writes the manifest that lists all of them.

Usage:
  python3 make_sfx.py [--out <engine/sfx folder>]   write the new .wav files (default: <skill>/engine/sfx)
  python3 make_sfx.py --manifest [path]             (re)write <skill>/assets/sfx-manifest.json (or the path given)
  python3 make_sfx.py --list                        print the library: name, category, length, default level
Files are 48 kHz, 16-bit, mono, peak-normalised to -1 dBFS; each effect's default level (gain_db) sits in the manifest.
"""
import array, json, math, random, struct, sys, wave
from pathlib import Path

SR = 48000
SKILL = Path(__file__).resolve().parent.parent
PI2 = 2 * math.pi


def N(sec):
    return max(1, int(sec * SR))


# ---- small DSP toolbox ------------------------------------------------------------------------------------------
def noise(rng, n):
    return [rng.uniform(-1, 1) for _ in range(n)]


def lowpass(x, fc):
    a = 1 - math.exp(-PI2 * fc / SR); y = 0.0; out = []
    for v in x:
        y += a * (v - y); out.append(y)
    return out


def highpass(x, fc):
    lp = lowpass(x, fc)
    return [v - l for v, l in zip(x, lp)]


def bandpass(x, lo, hi):
    return highpass(lowpass(x, hi), lo)


def svf_sweep(x, f0, f1, q=0.25, curve=1.0):
    """Band-pass filter whose centre glides from f0 to f1 Hz (state-variable filter; q small = narrow)."""
    n = len(x); low = band = 0.0; out = []
    for i, v in enumerate(x):
        fc = f0 * (f1 / f0) ** ((i / max(n - 1, 1)) ** curve)
        f = 2 * math.sin(math.pi * min(fc, 9000) / SR)
        low += f * band
        high = v - low - q * band
        band += f * high
        out.append(band)
    return out


def sine(freqs, phase0=0.0):
    """Sine with a per-sample frequency list (Hz)."""
    ph = phase0; out = []
    for f in freqs:
        ph += PI2 * f / SR; out.append(math.sin(ph))
    return out


def tone(f, n):
    return sine([f] * n)


def env_exp(n, rate):
    return [math.exp(-rate * i / SR) for i in range(n)]


def env_ad(n, attack, decay_rate):
    a = max(1, int(attack * SR))
    return [(i / a if i < a else math.exp(-decay_rate * (i - a) / SR)) for i in range(n)]


def mul(a, b):
    return [x * y for x, y in zip(a, b)]


def add(*sigs, n=None):
    n = n or max(len(s) for s in sigs)
    out = [0.0] * n
    for s in sigs:
        for i, v in enumerate(s):
            if i < n: out[i] += v
    return out


def scale(x, g):
    return [v * g for v in x]


def place(base, sig, t):
    """Add `sig` into `base` starting at t seconds (grows `base` if needed)."""
    s = int(t * SR); need = s + len(sig)
    if need > len(base): base.extend([0.0] * (need - len(base)))
    for i, v in enumerate(sig): base[s + i] += v
    return base


def fade(x, fin=0.004, fout=0.01):
    n = len(x); a, b = min(int(fin * SR), n // 2), min(int(fout * SR), n // 2)
    for i in range(a): x[i] *= i / a
    for i in range(b): x[n - 1 - i] *= i / b
    return x


def soft(x, drive=1.0):
    return [math.tanh(v * drive) for v in x]


def bell(f, dur, brightness=1.0, decay=3.0):
    """Struck-bell tone: inharmonic partials, each fading at its own rate."""
    n = N(dur); out = [0.0] * n
    for k, (r, amp, dec) in enumerate(((1, 1.0, 1.0), (2.0, 0.5, 1.6), (2.76, 0.35 * brightness, 2.2), (5.4, 0.2 * brightness, 3.5), (8.93, 0.1 * brightness, 5.0))):
        e = env_exp(n, decay * dec)
        s = tone(f * r, n)
        for i in range(n): out[i] += amp * e[i] * s[i]
    return fade(out, 0.001, 0.02)


# ---- the effects ------------------------------------------------------------------------------------------------
def whoosh_fast(rng):
    n = N(0.38); x = svf_sweep(noise(rng, n), 500, 4500, 0.35)
    e = [math.sin(math.pi * (i / n) ** 0.8) ** 2 for i in range(n)]
    return fade(mul(x, e))


def whoosh_slow(rng):
    n = N(0.95); x = svf_sweep(noise(rng, n), 250, 3000, 0.45)
    e = [math.sin(math.pi * (i / n) ** 0.9) ** 2 for i in range(n)]
    return fade(mul(x, e), 0.01, 0.05)


def whoosh_up(rng):
    n = N(0.65); x = svf_sweep(noise(rng, n), 300, 7000, 0.3, 1.4)
    e = [(i / n) ** 1.6 * (1 - (i / n) ** 12) for i in range(n)]
    return fade(mul(x, e), 0.01, 0.02)


def whoosh_down(rng):
    n = N(0.65); x = svf_sweep(noise(rng, n), 7000, 300, 0.3, 0.8)
    e = [(1 - i / n) ** 1.4 * min(1, i / (0.02 * SR)) for i in range(n)]
    return fade(mul(x, e), 0.004, 0.04)


def swoosh_soft(rng):
    n = N(0.8); x = lowpass(svf_sweep(noise(rng, n), 400, 2200, 0.7), 3500)
    e = [math.sin(math.pi * (i / n)) ** 3 for i in range(n)]
    return fade(mul(x, e), 0.02, 0.06)


def pop_soft(rng):
    n = N(0.16); f = [140 + 260 * math.exp(-i / SR * 60) for i in range(n)]
    return fade(mul(sine(f), env_exp(n, 28)), 0.001, 0.02)


def pop_bubble(rng):
    n = N(0.2); f = [300 + 700 * (i / n) ** 0.6 for i in range(n)]
    return fade(mul(sine(f), env_ad(n, 0.006, 22)), 0.001, 0.03)


def click(rng):
    n = N(0.06); c = highpass(noise(rng, n), 1500)
    ring = mul(tone(2400, n), env_exp(n, 140))
    return fade(add(mul(c, env_exp(n, 420)), scale(ring, 0.5)), 0.0003, 0.01)


def tick(rng):
    n = N(0.04); return fade(mul(add(tone(3200, n), scale(tone(6400, n), 0.4)), env_exp(n, 260)), 0.0003, 0.008)


def finger_snap(rng):
    n = N(0.22); crack = bandpass(noise(rng, n), 1800, 6500)
    body = mul(tone(210, n), env_exp(n, 55))
    return fade(add(mul(crack, env_exp(n, 160)), scale(body, 0.5)), 0.0003, 0.03)


def impact_low(rng):
    n = N(1.5); f = [32 + 70 * math.exp(-i / SR * 7) for i in range(n)]
    sub = mul(sine(f), env_exp(n, 2.4))
    thump = mul(lowpass(noise(rng, n), 220), env_exp(n, 22))
    return fade(soft(add(sub, scale(thump, 1.4)), 1.6), 0.0008, 0.12)


def impact_hit(rng):
    n = N(0.5); f = [45 + 110 * math.exp(-i / SR * 28) for i in range(n)]
    kick = mul(sine(f), env_exp(n, 9))
    crack = mul(bandpass(noise(rng, n), 1200, 5000), env_exp(n, 70))
    return fade(soft(add(kick, scale(crack, 0.7)), 1.8), 0.0005, 0.05)


def impact_cinematic(rng):
    n = N(2.2); f = [28 + 60 * math.exp(-i / SR * 5) for i in range(n)]
    boom = mul(sine(f), env_exp(n, 1.5))
    tail = mul(lowpass(noise(rng, n), 900), [math.exp(-1.7 * i / SR) * min(1, i / (0.03 * SR)) for i in range(n)])
    hit = mul(highpass(noise(rng, n), 800), env_exp(n, 40))
    return fade(soft(add(boom, scale(tail, 0.6), scale(hit, 0.35)), 1.4), 0.0008, 0.25)


def thud(rng):
    n = N(0.3); f = [60 + 80 * math.exp(-i / SR * 40) for i in range(n)]
    return fade(mul(sine(f), env_exp(n, 16)), 0.0008, 0.04)


def rise(rng):
    n = N(1.8); x = svf_sweep(noise(rng, n), 200, 6500, 0.3, 1.3)
    e = [(i / n) ** 1.8 for i in range(n)]
    tonal = mul(sine([180 * (6 ** ((i / n) ** 1.2)) for i in range(n)]), e)
    return fade(add(mul(x, e), scale(tonal, 0.18)), 0.02, 0.03)


def rise_tonal(rng):
    n = N(1.5); f = [220 * 4 ** ((i / n) ** 1.1) for i in range(n)]
    s = add(sine(f), scale(sine([v * 1.5 for v in f]), 0.4), scale(sine([v * 2.0 for v in f]), 0.25))
    return fade(mul(s, [(i / n) ** 1.5 for i in range(n)]), 0.02, 0.03)


def reverse_swell(rng):
    n = N(1.3); x = lowpass(noise(rng, n), 5000)
    crash = mul(x, [math.exp(-3.2 * i / SR) for i in range(n)])
    crash = svf_sweep(crash, 1200, 1200, 0.5)
    return fade(list(reversed(crash)), 0.02, 0.01)


def ding(rng):
    return bell(1568, 1.3)


def ding_soft(rng):
    return bell(1175, 0.9, 0.5, 3.8)


def ding_double(rng):
    out = []
    place(out, bell(1318, 0.9), 0.0); place(out, bell(1760, 1.2), 0.17)
    return out


def notification(rng):
    out = []
    place(out, bell(988, 0.5, 0.7, 4.0), 0.0); place(out, bell(1319, 0.9, 0.7, 3.5), 0.11)
    return out


def coin(rng):
    def note(f):
        n = N(0.5); s = add(tone(f, n), scale(tone(f * 2, n), 0.3))
        return fade(mul(s, env_ad(n, 0.002, 7)), 0.001, 0.05)
    out = []
    place(out, note(1976), 0.0); place(out, note(2637), 0.075)
    return out


def sparkle(rng):
    out = []
    t = 0.0
    for _ in range(11):
        f = rng.choice((2093, 2349, 2637, 3136, 3520, 3951, 4699))
        n = N(0.28); s = mul(tone(f, n), env_ad(n, 0.002, 14))
        place(out, scale(s, rng.uniform(0.35, 1.0)), t)
        t += rng.uniform(0.025, 0.07)
    return fade(out, 0.001, 0.08)


def success(rng):
    out = []
    for k, f in enumerate((784, 988, 1175, 1568)):
        place(out, bell(f, 0.8, 0.6, 4.5), 0.085 * k)
    return out


def error_buzz(rng):
    out = []
    for k in range(2):
        n = N(0.13); sq = [1.0 if math.sin(PI2 * 155 * i / SR) >= 0 else -1.0 for i in range(n)]
        place(out, fade(lowpass(sq, 1400), 0.004, 0.02), 0.17 * k)
    return out


def typing_keys(rng):
    out = []; t = 0.02
    for _ in range(12):
        n = N(0.05); c = mul(lowpass(noise(rng, n), rng.uniform(2800, 4200)), env_exp(n, 220))
        th = mul(tone(rng.uniform(150, 230), n), env_exp(n, 90))
        place(out, scale(add(c, scale(th, 0.7)), rng.uniform(0.55, 1.0)), t)
        t += rng.uniform(0.06, 0.14)
    return fade(out, 0.001, 0.03)


def typing_fast(rng):
    out = []; t = 0.0
    for _ in range(18):
        n = N(0.035); c = mul(lowpass(noise(rng, n), rng.uniform(3000, 4800)), env_exp(n, 300))
        place(out, scale(c, rng.uniform(0.5, 1.0)), t)
        t += rng.uniform(0.035, 0.075)
    return fade(out, 0.001, 0.03)


def paper_rustle(rng):
    n = N(0.95); mod = lowpass(noise(rng, n), 22)
    mod = [min(1.0, abs(v) * 7) ** 1.5 for v in mod]
    x = bandpass(noise(rng, n), 1400, 9000)
    e = [math.sin(math.pi * (i / n)) ** 0.6 for i in range(n)]
    return fade(mul(mul(x, mod), e), 0.01, 0.06)


def paper_flip(rng):
    n = N(0.36); x = svf_sweep(noise(rng, n), 900, 6500, 0.5)
    e = [math.sin(math.pi * (i / n) ** 0.6) ** 2 for i in range(n)]
    flutter = [0.6 + 0.4 * abs(math.sin(PI2 * 38 * i / SR)) for i in range(n)]
    return fade(mul(mul(x, e), flutter), 0.003, 0.03)


def page_turn(rng):
    out = []
    place(out, paper_flip(rng), 0.0)
    place(out, scale(click(rng), 0.5), 0.34)
    return out


def glitch(rng):
    out = []; t = 0.0
    while t < 0.45:
        seg_n = N(rng.uniform(0.018, 0.05)); f = rng.choice((220, 330, 440, 880, 1320, 1760))
        shape = rng.choice(("sq", "noise", "saw"))
        if shape == "sq": seg = [1.0 if math.sin(PI2 * f * i / SR) >= 0 else -1.0 for i in range(seg_n)]
        elif shape == "saw": seg = [((f * i / SR) % 1) * 2 - 1 for i in range(seg_n)]
        else: seg = noise(rng, seg_n)
        bits = rng.choice((3, 4, 5)); lv = 2 ** bits; hold = rng.choice((1, 2, 4, 8))
        seg = [round(((seg[(i // hold) * hold]) * 0.5 + 0.5) * lv) / lv * 2 - 1 for i in range(seg_n)]
        for rep in range(rng.choice((1, 2, 3))):
            place(out, scale(seg, 0.8), t); t += seg_n / SR
        t += rng.choice((0, 0, 0.012, 0.03))
    return fade(out, 0.0005, 0.03)


def glitch_long(rng):
    out = []; t = 0.0
    while t < 0.9:
        part = glitch(rng)
        place(out, scale(part[:N(rng.uniform(0.12, 0.3))], 0.9), t)
        t += rng.uniform(0.1, 0.22)
    return fade(out, 0.0005, 0.05)


def digital_error(rng):
    out = []; t = 0.0
    for f in (1760, 1320, 1760, 880, 1760, 440):
        n = N(0.045); sq = [1.0 if math.sin(PI2 * f * i / SR) >= 0 else -1.0 for i in range(n)]
        place(out, scale(fade(sq, 0.001, 0.005), 0.7), t); t += 0.055
    return out


def camera_shutter(rng):
    out = []
    for t, g in ((0.0, 1.0), (0.055, 0.7)):
        n = N(0.05); c = mul(bandpass(noise(rng, n), 1500, 7000), env_exp(n, 170))
        k = mul(tone(310, n), env_exp(n, 120))
        place(out, scale(add(c, scale(k, 0.5)), g), t)
    return fade(out, 0.0004, 0.03)


# name -> (function, seed, category, description, default gain in dB). Gain evens out how loud each one feels.
LIBRARY = {
    "whoosh-fast":      (whoosh_fast,      11, "whoosh",   "quick air whoosh for fast cuts and cards sliding in", 0),
    "whoosh-slow":      (whoosh_slow,      12, "whoosh",   "long soft whoosh for big moves and scene changes", 0),
    "whoosh-up":        (whoosh_up,        13, "whoosh",   "rising whoosh that ends on a beat, for reveals", 1),
    "whoosh-down":      (whoosh_down,      14, "whoosh",   "falling whoosh, for something leaving or dropping", 2),
    "swoosh-soft":      (swoosh_soft,      15, "whoosh",   "airy gentle swoosh, the quiet option", 1),
    "pop-soft":         (pop_soft,         21, "pop",      "soft round pop for a tag or word appearing", -4),
    "pop-bubble":       (pop_bubble,       22, "pop",      "bubbly rising pop", -4),
    "click":            (click,            31, "ui",       "clean interface click", 4),
    "tick":             (tick,             32, "ui",       "tiny tick for counters and list rows", 1),
    "finger-snap":      (finger_snap,      33, "snap",     "finger-snap style accent", 4),
    "impact-low":       (impact_low,       41, "impact",   "deep sub boom for a big statement", -5),
    "impact-hit":       (impact_hit,       42, "impact",   "short punchy hit for a title landing", -4),
    "impact-cinematic": (impact_cinematic, 43, "impact",   "long cinematic boom with a tail", -5),
    "thud":             (thud,             44, "impact",   "small soft thud", -1),
    "rise":             (rise,             51, "rise",     "noise riser (1.8 s) that builds into a reveal; end it on the beat", 4),
    "rise-tonal":       (rise_tonal,       52, "rise",     "musical rising sweep (1.5 s)", -2),
    "reverse-swell":    (reverse_swell,    53, "rise",     "reversed swell into a hit", 4),
    "ding":             (ding,             61, "ding",     "bright bell ding for a win or a tip", 0),
    "ding-soft":        (ding_soft,        62, "ding",     "softer, lower ding", -2),
    "ding-double":      (ding_double,      63, "ding",     "two-note ding", 0),
    "notification":     (notification,     64, "ding",     "phone-style notification chime", -1),
    "coin":             (coin,             65, "ding",     "two-note coin pickup, used by the call-to-action pill", -2),
    "sparkle":          (sparkle,          66, "ding",     "glitter of high pings, used by the follow card", -3),
    "success":          (success,          67, "ding",     "four-note rising success jingle", -1),
    "error-buzz":       (error_buzz,       68, "ding",     "double low buzz for a wrong answer", -12),
    "typing-keys":      (typing_keys,      71, "typing",   "12 keystrokes, relaxed pace", 3),
    "typing-fast":      (typing_fast,      72, "typing",   "18 quick keystrokes", 4),
    "paper-rustle":     (paper_rustle,     81, "paper",    "paper rustling", 4),
    "paper-flip":       (paper_flip,       82, "paper",    "one quick page flip", -2),
    "page-turn":        (page_turn,        83, "paper",    "page flip with a soft settle", 0),
    "glitch":           (glitch,           91, "glitch",   "short digital stutter", -11),
    "glitch-long":      (glitch_long,      92, "glitch",   "longer glitch burst", -9),
    "digital-error":    (digital_error,    93, "glitch",   "bleepy digital error", -12),
    "camera-shutter":   (camera_shutter,   94, "ui",       "camera shutter, for a photo or screenshot moment", 3),
}

# The six the reel editor shipped with, still made by setup_engine.sh (ffmpeg); listed here so the manifest is complete.
LEGACY = {
    "whoosh": ("whoosh", "air whoosh (original reel-editor sound)", 0),
    "swish":  ("whoosh", "short swish (original reel-editor sound)", 0),
    "pop":    ("pop",    "pop (original reel-editor sound)", 0),
    "snap":   ("snap",   "snap (original reel-editor sound)", 0),
    "chime":  ("ding",   "chime (original reel-editor sound)", 0),
    "typing": ("typing", "typing (original reel-editor sound)", 0),
}

LICENSE_NEW = "Original synthesis by By Mel Ross, written for this project; no third-party samples. Apache-2.0 (the project license)."
LICENSE_LEGACY = "Synthesised by setup_engine.sh (ffmpeg lavfi generators) from Claude Reel Editor by Nicola Pocock. MIT."


def render(name):
    fn, seed, *_ = LIBRARY[name]
    x = fn(random.Random(seed))
    peak = max(max(abs(v) for v in x), 1e-9)
    return [v * 0.891 / peak for v in x]          # -1 dBFS


def write_wav(path, x):
    a = array.array("h", (max(-32767, min(32767, int(round(v * 32767)))) for v in x))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(a.tobytes())


def manifest():
    items = []
    for name, (cat, desc, gain) in LEGACY.items():
        items.append({"name": name, "file": f"{name}.wav", "category": cat, "description": desc, "gain_db": gain,
                      "source": "scripts/setup_engine.sh (ffmpeg synthesis)", "license": LICENSE_LEGACY, "third_party": False})
    for name, (fn, seed, cat, desc, gain) in LIBRARY.items():
        items.append({"name": name, "file": f"{name}.wav", "category": cat, "description": desc, "gain_db": gain,
                      "source": f"scripts/make_sfx.py (seed {seed})", "license": LICENSE_NEW, "third_party": False})
    return {"about": "Sound-effects library for the reel editor. gain_db is each effect's default level offset; brand.json "
                     "\"sfx_volume\" adds a per-effect change on top. Every file is generated, none is downloaded.",
            "effects": items}


def main():
    args = sys.argv[1:]
    if "--manifest" in args:
        i = args.index("--manifest")
        p = Path(args[i + 1]).expanduser() if len(args) > i + 1 and not args[i + 1].startswith("--") else SKILL / "assets" / "sfx-manifest.json"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(manifest(), indent=2) + "\n"); print(p); return
    if "--list" in args:
        for name, (fn, seed, cat, desc, gain) in LIBRARY.items():
            print(f"{name:18s} {cat:8s} {len(render(name)) / SR:4.2f}s  {gain:+d} dB  {desc}")
        return
    out = Path(args[args.index("--out") + 1]).expanduser() if "--out" in args else SKILL / "engine" / "sfx"
    out.mkdir(parents=True, exist_ok=True)
    for name in LIBRARY:
        p = out / f"{name}.wav"
        if p.exists() and p.stat().st_size > 0: continue
        write_wav(p, render(name))
    print(f"sound-effects library ready: {len(LIBRARY)} generated + {len(LEGACY)} from setup_engine.sh -> {out}")


if __name__ == "__main__":
    main()
