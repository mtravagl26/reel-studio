#!/usr/bin/env python3
"""Added by By Mel Ross. Final mix for a rendered reel: voice + music bed + sound effects, at social-video loudness.

  voice    the cut's own audio (master.mp4), cleaned already by clean_audio.sh
  music    brand.json "music" (or edit.json "music"): a file of the person's own. It follows the voice: it dips while
           they speak and comes back up in the gaps, and it fades in and out.
  effects  <reel>/sfx_events.json, written by build_reel.py, mixed from engine/sfx (see assets/sfx-manifest.json)

Three levels, in dB, in brand.json (all optional):
  "mix": {"voice": 0,        voice level
          "music": -14,      music bed in the gaps, relative to the voice's loudness (LU)
          "duck": -10,       extra dip for the music while the voice is speaking
          "effects": 0,      all sound effects together (each effect also has its own level: "sfx_volume")
          "lufs": -16,       final loudness (-16 matches the voice chain in clean_audio.sh; use -14 for a loud, music-led reel)
          "true_peak": -2}   highest peak allowed, in dBTP (no clipping; use -1.5 with -14)
Finishing: soft limiter, two-pass loudness normalisation, then a check of the result (loudness, true peak, clipped
samples) that is printed and saved to <reel>/mix_report.json.

Usage: python3 mix_audio.py <reel-folder> [--video final.mp4] [--out final_ln.mp4] [--stems-dir DIR]
  --stems-dir  also writes voice.wav, music_ducked.wav, sfx.wav (the three stems as they enter the mix) for inspection
Standard library + ffmpeg only.
"""
import array, json, math, os, re, struct, subprocess, sys, tempfile, wave
from pathlib import Path

SR = 48000
HERE = Path(__file__).resolve().parent
ENGINE = Path(os.environ.get("REEL_ENGINE") or HERE.parent / "engine")      # REEL_ENGINE: for tests
DEFAULTS = {"voice": 0.0, "music": -14.0, "duck": -10.0, "effects": 0.0, "lufs": -16.0, "true_peak": -2.0,
            "hold": 0.45, "attack": 0.12, "release": 0.6, "fade_in": 0.5, "fade_out": 1.2}
FR = 0.01            # envelope step: 10 ms


def sh(cmd, **kw):
    return subprocess.run([str(c) for c in cmd], check=True, capture_output=True, text=True, **kw)


def dur_of(p):
    return float(sh(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).stdout)


def has_audio(p):
    return bool(sh(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", p]).stdout.strip())


# ---- voice activity -> music gain envelope ------------------------------------------------------------------------
def pcm16(path, sr=16000):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"],
                         check=True, capture_output=True).stdout
    a = array.array("h"); a.frombytes(raw[: len(raw) // 2 * 2]); return a


def speech_mask(a, sr=16000):
    """True per 10 ms where the voice is speaking. Adaptive: the noise floor and the speech level come from the clip itself."""
    hop, win = int(sr * FR), int(sr * 0.03)
    lev = []
    for i in range(0, max(len(a) - win, 1), hop):
        seg = a[i:i + win]
        ms = sum(x * x for x in seg) / max(len(seg), 1)
        lev.append(10 * math.log10(max(ms, 1.0) / 32768 ** 2))
    if not lev: return []
    s = sorted(lev); floor, top = s[len(s) // 10], s[int(len(s) * 0.95)]
    thr = max(floor + 9.0, top - 24.0, -62.0)
    return [v > thr for v in lev]


def close_gaps(mask, hold, pre=0.1, post=0.15):
    """Speech runs separated by less than `hold` seconds are one run (no pumping between words); runs are widened a little."""
    n = len(mask); out = mask[:]
    i = 0
    while i < n:
        if mask[i]:
            j = i
            while j < n and mask[j]: j += 1
            k = j
            while k < n and not mask[k]: k += 1
            if k < n and (k - j) * FR < hold:
                for x in range(j, k): out[x] = True
            i = j
        else:
            i += 1
    w = out[:]
    a, b = int(pre / FR), int(post / FR)
    for i, v in enumerate(out):
        if v:
            for x in range(max(0, i - a), min(n, i + b + 1)): w[x] = True
    return w


def gain_curve(mask, duck_db, attack, release):
    """dB per 10 ms: 0 in gaps, duck_db while speaking, with slow rises and early (look-ahead) dips."""
    depth = abs(duck_db) or 1.0
    tgt = [duck_db if v else 0.0 for v in mask]
    up, down = depth * FR / max(release, FR), depth * FR / max(attack, FR)
    g = tgt[:]
    for i in range(1, len(g)): g[i] = min(g[i], g[i - 1] + up)            # rises slowly
    for i in range(len(g) - 2, -1, -1): g[i] = min(g[i], g[i + 1] + down)  # starts falling before the voice comes in
    return g


def write_gain_wav(path, g_db, total):
    n = int(total / FR) + 2
    g_db = (g_db + [g_db[-1] if g_db else 0.0] * n)[:n]
    a = array.array("h", (int(round(min(1.0, 10 ** (v / 20)) * 32767)) for v in g_db))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(int(1 / FR)); w.writeframes(a.tobytes())
    return n


# ---- sound-effects stem -------------------------------------------------------------------------------------------
def read_wav_mono(path):
    with wave.open(str(path), "rb") as w:
        ch, sw, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    if sw != 2: raise ValueError(f"{path}: only 16-bit wav supported")
    a = array.array("h"); a.frombytes(raw)
    if ch > 1: a = array.array("h", (sum(a[i:i + ch]) // ch for i in range(0, len(a) - ch + 1, ch)))
    if sr != SR: raise ValueError(f"{path}: expected {SR} Hz, got {sr}")
    return a


def write_wav_f32(path, x, sr=SR):
    data = array.array("f", x).tobytes()
    hdr = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE" + b"fmt " + struct.pack("<IHHIIHH", 16, 3, 1, sr, sr * 4, 4, 32) \
        + b"data" + struct.pack("<I", len(data))
    Path(path).write_bytes(hdr + data)


def sfx_stem(events, total, path):
    n = int(total * SR) + 1
    buf = array.array("f", bytes(4 * n))
    cache, used = {}, 0
    for e in events:
        f = ENGINE / "sfx" / f"{e['name']}.wav"
        if not f.exists():
            print(f"warning: sound effect {e['name']!r} not found in engine/sfx - skipped"); continue
        if f not in cache: cache[f] = read_wav_mono(f)
        w, g = cache[f], 10 ** (float(e.get("db", 0)) / 20) / 32768
        s = int(float(e["t"]) * SR)
        if s < 0 or s >= n: continue
        ln = min(len(w), n - s)
        if e.get("dur"): ln = min(ln, int(float(e["dur"]) * SR))
        tail = min(ln, int(0.02 * SR)) if ln < len(w) else 0          # cut-short effect: 20 ms fade so it doesn't click
        for i in range(ln):
            fade = (ln - i) / tail if tail and ln - i < tail else 1.0
            buf[s + i] += w[i] * g * fade
        used += 1
    write_wav_f32(path, buf)
    return used


# ---- loudness -----------------------------------------------------------------------------------------------------
def loudnorm_stats(src, extra=""):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(src), "-af", f"{extra}loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json",
                        "-f", "null", "-"], capture_output=True, text=True)
    m = re.search(r"\{.*?\}", r.stderr, re.S)
    return json.loads(m.group(0)) if m else None


def measure(src):
    """Integrated loudness and true peak (EBU R128), plus whether the waveform reaches full scale (clipping)."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(src), "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    I = re.findall(r"\bI:\s+(-?[\d.]+) LUFS", r)
    tp = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", r)
    r2 = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(src), "-vn", "-af", "astats=measure_perchannel=none", "-f", "null", "-"],
                        capture_output=True, text=True).stderr
    pk = re.findall(r"Peak level dB:\s+(-?[\d.]+|-inf)", r2)
    peak = float(pk[-1]) if pk and pk[-1] != "-inf" else -99.0
    return {"lufs": float(I[-1]) if I else None, "true_peak_db": float(tp[-1]) if tp else None,
            "clipped_samples": 1 if peak >= -0.05 else 0}


def main():
    args = sys.argv[1:]
    if not args: sys.exit(__doc__)
    reel = Path(args[0]).expanduser().resolve()
    opt = lambda k, d=None: args[args.index(k) + 1] if k in args else d
    video = reel / opt("--video", "final.mp4"); out = reel / opt("--out", "final_ln.mp4")
    stems = Path(opt("--stems-dir")).expanduser() if opt("--stems-dir") else None
    home = Path(os.environ.get("REELS_HOME", "~/reels")).expanduser()
    brand = json.load(open(home / "brand.json")) if (home / "brand.json").exists() else {}
    edit = json.load(open(reel / "edit.json")) if (reel / "edit.json").exists() else {}
    cfg = {**DEFAULTS, **brand.get("mix", {}), **edit.get("mix", {})}
    music = edit.get("music") or brand.get("music")
    music = Path(os.path.expanduser(music)) if music else None
    if music and not music.is_absolute() and (reel / music).exists(): music = reel / music
    if music and not music.exists():
        print(f"warning: music file not found, mixing without it: {music}"); music = None
    ev_path = reel / "sfx_events.json"
    events = json.load(open(ev_path)) if ev_path.exists() else []

    voice_src = reel / "master.mp4"
    if cfg.get("legacy") or not voice_src.exists() or not has_audio(voice_src): voice_src = video   # legacy: effects are already inside final.mp4
    total = dur_of(video)
    tmp = Path(tempfile.mkdtemp(prefix="mix_")); report = {"music": bool(music), "effects": 0}
    try:
        voice = tmp / "voice.wav"
        sh(["ffmpeg", "-v", "error", "-y", "-i", voice_src, "-vn", "-ac", "2", "-ar", SR, "-t", f"{total:.3f}",
            "-af", f"apad=whole_dur={total:.3f},volume={cfg['voice']}dB", voice])
        inputs, graph, mix_in = ["-i", voice], ["[0:a]anull[v]"], ["[v]"]
        n_in = 1
        gain = None
        if music:
            vstat = loudnorm_stats(voice)
            vlufs = float(vstat["input_i"]) if vstat and vstat.get("input_i") not in (None, "-inf") else cfg["lufs"]
            mstat = loudnorm_stats(music)
            mlufs = float(mstat["input_i"]) if mstat else -20.0
            mgain = max(-40.0, min(30.0, (vlufs + cfg["music"]) - mlufs))
            mask = close_gaps(speech_mask(pcm16(voice)), cfg["hold"])
            gain = tmp / "gain.wav"
            g = gain_curve(mask, cfg["duck"], cfg["attack"], cfg["release"])
            write_gain_wav(gain, g, total)
            speaking = sum(mask) * FR
            report.update({"voice_lufs": round(vlufs, 1), "music_gap_level_lu": cfg["music"], "music_under_voice_lu": cfg["music"] + cfg["duck"],
                           "speech_seconds": round(speaking, 1), "gap_seconds": round(total - speaking, 1)})
            inputs += ["-stream_loop", "-1", "-i", music, "-i", gain]
            fo = max(0.0, total - cfg["fade_out"])
            graph += [f"[1:a]atrim=0:{total:.3f},asetpts=PTS-STARTPTS,aformat=channel_layouts=stereo,aresample={SR},volume={mgain:.2f}dB,"
                      f"afade=t=in:d={cfg['fade_in']},afade=t=out:st={fo:.3f}:d={cfg['fade_out']}[m0]",
                      f"[2:a]aresample={SR},pan=stereo|c0=c0|c1=c0[g]",
                      "[m0][g]amultiply[m]"]
            mix_in.append("[m]"); n_in += 2
        if events:
            sx = tmp / "sfx.wav"
            report["effects"] = sfx_stem(events, total, sx)
            inputs += ["-i", sx]
            idx = n_in
            graph.append(f"[{idx}:a]aformat=channel_layouts=stereo,volume={cfg['effects']}dB[s]")
            mix_in.append("[s]"); n_in += 1
        mixed = tmp / "mix.wav"
        graph.append("".join(mix_in) + f"amix=inputs={len(mix_in)}:duration=longest:normalize=0,atrim=0:{total:.3f},"
                     "alimiter=limit=0.89:attack=5:release=60:level=disabled[mix]")
        sh(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(graph), "-map", "[mix]", "-c:a", "pcm_f32le", "-ar", SR, mixed])

        if stems:
            stems.mkdir(parents=True, exist_ok=True)
            sh(["ffmpeg", "-v", "error", "-y", "-i", voice, stems / "voice.wav"])
            if music:
                g2 = [f for f in graph if f.startswith("[1:a]") or f.startswith("[2:a]") or f.startswith("[m0]")]
                sh(["ffmpeg", "-v", "error", "-y", "-stream_loop", "-1", "-i", music, "-i", gain, "-filter_complex",
                    ";".join(g2).replace("[1:a]", "[0:a]").replace("[2:a]", "[1:a]"), "-map", "[m]", "-t", f"{total:.3f}", "-c:a", "pcm_s16le", stems / "music_ducked.wav"])
            if events: sh(["ffmpeg", "-v", "error", "-y", "-i", tmp / "sfx.wav", "-c:a", "pcm_s16le", stems / "sfx.wav"])

        # two-pass loudness normalisation, then the finished audio is muxed under the untouched video
        tgt, tp = cfg["lufs"], cfg["true_peak"]
        r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", mixed, "-af", f"loudnorm=I={tgt}:TP={tp}:LRA=7:print_format=json", "-f", "null", "-"],
                           capture_output=True, text=True)
        st = json.loads(re.search(r"\{.*?\}", r.stderr, re.S).group(0))
        ln = (f"loudnorm=I={tgt}:TP={tp}:LRA=7:measured_I={st['input_i']}:measured_TP={st['input_tp']}:measured_LRA={st['input_lra']}:"
              f"measured_thresh={st['input_thresh']}:offset={st['target_offset']}:linear=true")
        sh(["ffmpeg", "-v", "error", "-y", "-i", video, "-i", mixed, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
            "-af", ln + f",alimiter=limit={10 ** (tp / 20):.3f}:level=disabled", "-ar", SR, "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", out])
        res = measure(out)
        report.update({"lufs": res["lufs"], "true_peak_db": res["true_peak_db"], "clipped_samples": res["clipped_samples"],
                       "target_lufs": tgt, "max_true_peak_db": tp, "levels": {k: cfg[k] for k in ("voice", "music", "duck", "effects")}})
        ok = res["lufs"] is not None and abs(res["lufs"] - tgt) <= 1.0 and (res["true_peak_db"] is None or res["true_peak_db"] <= -1.0) and res["clipped_samples"] == 0
        report["pass"] = bool(ok)
        (reel / "mix_report.json").write_text(json.dumps(report, indent=1) + "\n")
        print(f"mix: {res['lufs']} LUFS (target {tgt}), true peak {res['true_peak_db']} dBTP (limit -1.0), clipped samples {res['clipped_samples']}, "
              f"music {'yes' if music else 'no'}, effects {report['effects']}  ->  {'PASS' if ok else 'CHECK'}")
        print(out)
    finally:
        import shutil; shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
