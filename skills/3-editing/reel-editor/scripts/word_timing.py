#!/usr/bin/env python3
"""Added by By Mel Ross (0.29.0): tighter word times from local Whisper, and a check of word times against the audio.

Local Whisper's word times run late by about 0.1 to 0.5 s, by a different amount for each word, so captions show up
after the word is said. Two parts:

1. retime(src, words): run whisper-cli once more with its built-in word alignment (--dtw, the model's alignment heads),
   then move each word's start to the aligned time. The words and their spelling stay as they were; only the times move.
   If whisper-cli or its model is missing, or the run fails, the words come back unchanged with a reason.
2. lag(src, times): measure how late (+) or early (-) word times are against the audio. Only words that start after a
   quiet stretch are measured, because there the start of the sound is clear; in fast speech it isn't.

Usage: python3 word_timing.py retime <video-or-audio> <words.json>     rewrites words.json with the tighter times
       python3 word_timing.py check  <video-or-audio> <words.json>     prints how late the word starts run
"""

import array, difflib, json, math, re, shutil, statistics, subprocess, sys, tempfile
from pathlib import Path

WHISPER = Path("~/.cache/hyperframes/whisper").expanduser()


def find_whisper():
    cli = shutil.which("whisper-cli") or next((str(p) for p in WHISPER.rglob("whisper-cli") if p.is_file()), None)
    model = (
        next(iter(sorted((WHISPER / "models").glob("ggml-small*.bin"))), None)
        if (WHISPER / "models").exists()
        else None
    )
    return cli, model


def dtw_preset(model):
    """ggml-small.en.bin -> small.en, ggml-base-q5_1.bin -> base: the name whisper-cli's --dtw wants."""
    m = re.match(r"ggml-(tiny|base|small|medium|large-v[123](?:-turbo)?|large-v3-turbo)(\.en)?", Path(model).name)
    return (m.group(1) + (m.group(2) or "")) if m else None


norm = lambda s: re.sub(r"[^a-z0-9']", "", s.lower())


def dtw_words(full_json):
    """Words and their aligned start times from whisper-cli -ojf output (t_dtw is in hundredths of a second)."""
    out = []
    for seg in full_json.get("transcription", []):
        for tok in seg.get("tokens", []):
            text, t = tok.get("text", ""), tok.get("t_dtw", -1)
            if not text or text.startswith("[_") or text.startswith("<|"):
                continue
            if text.startswith(" ") or not out:
                if norm(text) or not out:
                    out.append([text.strip(), t / 100 if t is not None and t >= 0 else None])
                else:
                    out[-1][0] += text.strip()
            else:
                out[-1][0] += text
                if out[-1][1] is None and t is not None and t >= 0:
                    out[-1][1] = t / 100
    return [(w, t) for w, t in out if norm(w) and t is not None]


def snap(words, aligned, most=0.8):
    """Move each word's start to its aligned time. Words are matched by spelling, in order. A match more than `most`
    seconds away is ignored. A word with no match moves by the same amount as the word before it. Ends follow the starts
    and stop at the next word. Returns (new words, number moved, median move)."""
    a = [norm(w["text"]) for w in words]
    b = [norm(t) for t, _ in aligned]
    shift = [None] * len(words)
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            i, j = blk.a + k, blk.b + k
            d = aligned[j][1] - words[i]["start"]
            if abs(d) <= most:
                shift[i] = d
    moved = [d for d in shift if d is not None]
    last = 0.0
    for i in range(len(shift)):
        if shift[i] is None:
            shift[i] = last
        last = shift[i]
    starts = []
    for i, w in enumerate(words):
        s = max(0.0, w["start"] + shift[i])
        if starts and s < starts[-1] + 0.02:
            s = starts[-1] + 0.02
        starts.append(s)
    out = []
    for i, w in enumerate(words):
        e = w["end"] + shift[i]
        if i + 1 < len(words):
            e = min(e, starts[i + 1] - 0.01)
        out.append({**w, "start": round(starts[i], 3), "end": round(max(e, starts[i] + 0.08), 3)})
    return out, len(moved), (statistics.median(moved) if moved else 0.0)


def retime(src, words):
    """Tighter times for local Whisper's words. Returns (words, message)."""
    if not words:
        return words, "no words"
    cli, model = find_whisper()
    preset = dtw_preset(model) if model else None
    if not (cli and model and preset):
        return words, "whisper-cli or its speech model isn't installed yet"
    with tempfile.TemporaryDirectory() as tmp:
        wav, base = Path(tmp) / "v16.wav", Path(tmp) / "dtw"
        r = subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vn", "-ar", "16000", "-ac", "1", str(wav)],
            capture_output=True,
        )
        if r.returncode != 0:
            return words, "couldn't read the audio"
        # -nfa: whisper.cpp turns flash attention on by default, and then quietly skips the word alignment.
        run = lambda extra: subprocess.run(
            [cli, "-m", str(model), "-f", str(wav), "-dtw", preset, "-ojf", "-np", *extra, "-of", str(base)],
            capture_output=True,
            text=True,
        )
        r = run(["-nfa"])
        if r.returncode != 0 and "nfa" in (r.stderr or ""):
            r = run([])  # an older whisper-cli with no -nfa flag
        if r.returncode != 0 or not base.with_suffix(".json").exists():
            return words, "whisper-cli's word alignment didn't run: " + (r.stderr or "").strip()[-160:]
        try:
            aligned = dtw_words(json.loads(base.with_suffix(".json").read_text(errors="replace")))
        except (ValueError, KeyError) as e:
            return words, f"couldn't read the alignment ({e})"
    new, n, med = snap(words, aligned)
    if n < max(3, len(words) // 3):
        return words, f"only {n} of {len(words)} words lined up, so the times were left as they were"
    return new, f"{n} of {len(words)} words moved to the aligned time (typical move {med:+.2f} s)"


# ---- the check -------------------------------------------------------------------------------------------------------
HOP = 0.01  # 10 ms frames


def levels(src):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(src), "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
        capture_output=True,
        check=True,
    ).stdout
    pcm = array.array("h")
    pcm.frombytes(raw[: len(raw) // 2 * 2])
    n = int(16000 * HOP)
    return [
        20 * math.log10(max(1.0, math.sqrt(sum(x * x for x in pcm[i : i + n]) / n)) / 32768)
        for i in range(0, len(pcm) - n, n)
    ]


def lag(src, times, quiet=0.15):
    """How late each measurable word time runs against the audio. `times` is a list of word start times on the same
    clock as `src`. Measured only where a word's sound starts after at least `quiet` seconds of quiet. Returns
    {"n", "median", "p90", "lags"}; median and p90 are None when fewer than 3 words could be measured."""
    lev = levels(src)
    if not lev:
        return {"n": 0, "median": None, "p90": None, "lags": []}
    floor, peak = sorted(lev)[len(lev) // 10], sorted(lev)[int(len(lev) * 0.98)]
    on = max(floor + 12, peak - 30)
    loud = [v > on for v in lev]
    q = int(quiet / HOP)
    onsets = [i * HOP for i in range(q, len(loud)) if loud[i] and not any(loud[i - q : i])]
    lags = []
    for t in times:
        near = [o for o in onsets if t - 0.6 <= o <= t + 0.3]
        if near:
            lags.append(round(t - min(near, key=lambda o: abs(o - t)), 3))
    if len(lags) < 3:
        return {"n": len(lags), "median": None, "p90": None, "lags": lags}
    s = sorted(abs(x) for x in lags)
    return {
        "n": len(lags),
        "median": round(statistics.median(lags), 3),
        "p90": round(s[round(0.9 * (len(s) - 1))], 3),
        "lags": lags,
    }


def say(r, what="word starts"):
    if r["median"] is None:
        return f"{what}: NOT CHECKED (only {r['n']} words start after a pause; need 3)"
    m = r["median"]
    how = "on time" if abs(m) < 0.05 else f"{abs(m):.2f} s {'late' if m > 0 else 'early'}"
    return f"{what}: {how} on average, within {r['p90']:.2f} s for 9 in 10 ({r['n']} words after a pause measured)"


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] not in ("retime", "check"):
        sys.exit(__doc__)
    src, wf = Path(sys.argv[2]).expanduser(), Path(sys.argv[3]).expanduser()
    ws = json.load(open(wf))
    if sys.argv[1] == "retime":
        ws, msg = retime(src, ws)
        json.dump(ws, open(wf, "w"))
        print("word times:", msg)
    print(say(lag(src, [w["start"] for w in ws])))
