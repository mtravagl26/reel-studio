#!/usr/bin/env python3
"""Added by By Mel Ross. Make a calm, loopable music bed to put under a voice, with no music to license.

It is original synthesis (soft pads, a gentle bell arpeggio, a low root note, a little echo), written for this project and
released under the project's license (Apache-2.0). No samples, no downloads, standard library only.

Usage: python3 make_music_bed.py [out.wav] [--seconds 32] [--seed 1] [--mood warm|bright|calm]
Default output: ~/reels/assets/music-bed.wav. Then in brand.json: "music": "~/reels/assets/music-bed.wav".
The loop is seamless (the last chord rings into the first), so mix_audio.py can repeat it for a reel of any length.
Takes about 10-20 seconds. It's a quiet bed, not a song: the voice is the point.
"""
import array, math, random, sys, wave
from pathlib import Path

SR = 48000
MOODS = {  # chord progressions as MIDI-note lists (root first); 4 chords, one per quarter of the loop
    "warm":   [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 59]],      # Cmaj7  Am7  Fmaj7  G6-ish
    "bright": [[50, 57, 61, 66], [47, 54, 57, 62], [43, 50, 54, 59], [45, 52, 57, 61]],      # D  Bm  G  A
    "calm":   [[45, 52, 55, 60], [41, 48, 52, 57], [48, 55, 59, 64], [43, 50, 53, 58]],      # Am7  Fmaj7  Cmaj7  Gm-ish
}


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def main():
    args = sys.argv[1:]
    pos, skip = [], False
    for x in args:
        if x.startswith("--"): skip = True
        elif skip: skip = False
        else: pos.append(x)
    out = Path(pos[0] if pos else "~/reels/assets/music-bed.wav").expanduser()
    opt = lambda k, d: args[args.index(k) + 1] if k in args else d
    total = float(opt("--seconds", 32)); rng = random.Random(int(opt("--seed", 1)))
    chords = MOODS[opt("--mood", "warm")]
    n = int(total * SR); L = [0.0] * n; R = [0.0] * n
    seg = total / len(chords)

    def add(buf, start, sig):
        for i, v in enumerate(sig): buf[(start + i) % n] += v          # wraps: the last chord rings into the first

    for ci, chord in enumerate(chords):
        s0 = int(ci * seg * SR); ln = int((seg + 2.4) * SR)               # each chord overlaps the next by 2.4 s
        env = [min(1.0, i / (1.6 * SR)) * min(1.0, (ln - i) / (2.4 * SR)) for i in range(ln)]
        for ni, m in enumerate(chord):
            for det, pan in ((-0.0035, 0.35), (0.0035, 0.65), (0.0, 0.5)):
                f = hz(m) * (1 + det); ph = rng.uniform(0, 6.28)
                sig = [0.05 * e * (math.sin(ph + 6.2832 * f * i / SR) + 0.25 * math.sin(2 * ph + 6.2832 * 2 * f * i / SR)) for i, e in enumerate(env)]
                add(L, s0, [v * (1 - pan) * 2 for v in sig]); add(R, s0, [v * pan * 2 for v in sig])
        root = chord[0] - 12                                                  # low root note
        sub = [0.07 * e * math.sin(6.2832 * hz(root) * i / SR) for i, e in enumerate(env)]
        add(L, s0, sub); add(R, s0, sub)
        steps = int(seg / 0.5)                                                # soft bell arpeggio, every half second, sparse
        for k in range(steps):
            if rng.random() < 0.45: continue
            m = chord[(k * 2 + rng.randrange(2)) % len(chord)] + 24
            t0 = int((ci * seg + k * 0.5) * SR); ln2 = int(1.6 * SR)
            f = hz(m); amp = 0.028 * rng.uniform(0.6, 1.0); pan = rng.uniform(0.3, 0.7)
            bell = [amp * math.exp(-3.2 * i / SR) * (math.sin(6.2832 * f * i / SR) + 0.3 * math.sin(6.2832 * 2.01 * f * i / SR)) for i in range(ln2)]
            add(L, t0, [v * (1 - pan) * 2 for v in bell]); add(R, t0, [v * pan * 2 for v in bell])
    for buf in (L, R):                                                        # a little echo, wrapped so the loop stays seamless
        for delay, g in ((int(0.31 * SR), 0.28), (int(0.47 * SR), 0.18), (int(0.73 * SR), 0.12)):
            src = buf[:]
            for i in range(n): buf[i] += g * src[i - delay]
    peak = max(max(abs(v) for v in L), max(abs(v) for v in R), 1e-9)
    a = array.array("h")
    for l, r in zip(L, R):
        a.append(int(l * 0.7 / peak * 32767)); a.append(int(r * 0.7 / peak * 32767))
    out.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(a.tobytes())
    print(out)


if __name__ == "__main__":
    main()
