#!/usr/bin/env python3
"""Find the best short clips inside one long recording, then set one up as a reel folder.
Added by By Mel Ross. The idea (transcript first, score each moment, make sure a clip stands alone, spread the picks
across the recording) is written from scratch here; no code from another project.

Usage:
  python3 find_clips.py candidates <transcript.json> [--min 30] [--max 60] [--top 12] [--out clips_candidates.json] [--overlap]
      Reads a word list [{"text","start","end"}, ...] (what transcribe.py writes). Builds windows that start at a
      sentence start and end at a sentence end, scores them, and writes a ranked shortlist (JSON + a readable .md).
      The picks never overlap unless --overlap is given (then the same moment can appear with different start and end).
  python3 find_clips.py extract <video> <clips_candidates.json> --pick 1,3 [--reels-home DIR] [--date YYYY-MM-DD]
  python3 find_clips.py extract <video> <clips_candidates.json> --span START END --name short-name
      Makes one reel folder per clip: raw.<ext> (an instant APFS clone, or a copy), edl.json with the span to keep,
      the full transcript.json, source_dir.txt. Never cuts or re-encodes anything, never overwrites a folder.

The scores are a pre-ranking from the words and timing alone (hook, standalone, value, energy, platform fit, each
0-5). They do not understand the topic. The editor reads the shortlist and decides; the person approves before any cut."""
import json, re, shutil, statistics, subprocess, sys
from datetime import date
from pathlib import Path

WEAK_OPENERS = {"and", "but", "so", "because", "which", "that", "then", "also", "or", "plus", "anyway", "cause", "well"}
PRONOUN_OPENERS = {"it", "it's", "they", "they're", "he", "she", "this", "these", "those", "them", "their", "its"}
BACK_REFS = ["as i said", "like i said", "as i mentioned", "like i mentioned", "i mentioned", "as we discussed", "we talked about",
             "earlier", "going back to", "back to what", "the first one", "the second one", "the last one", "that thing",
             "that one", "like before", "as before", "remember when", "as i was saying"]
POWER_WORDS = {"never", "stop", "biggest", "mistake", "secret", "truth", "why", "how", "worst", "best", "nobody", "everyone",
               "wrong", "actually", "honestly", "problem", "myth", "real", "hardest", "easiest", "only"}
PAYOFF = ["that's why", "that is why", "which means", "the point is", "the takeaway", "so the lesson", "in other words",
          "the result", "bottom line", "that's the", "here's the", "what matters", "so if you"]
LIST_MARKERS = {"first", "second", "third", "one", "two", "three", "four", "five", "step", "number", "next", "finally"}
REACTIONS = {"absolutely", "right", "yeah", "yes", "mmhmm", "mhm", "uhhuh", "okay", "ok", "exactly", "definitely", "sure", "wow",
             "great", "nice", "gotcha", "interesting", "perfect", "totally", "true", "correct", "good", "thanks", "thank"}
CUT_INS = {"mmhmm", "mhm", "uhhuh"}
FILLERS = {"um", "uh", "umm", "uhm", "erm", "hmm", "mm"}
FILLER_PHRASES = ["you know", "kind of", "sort of", "i mean", "basically"]
STOP = set("a an the and or but if so of to in on at for with from by as is are was were be been it its this that these those i you he she we they my your our their me him her us them do does did have has had not no yes just very really can will would could should".split())


def norm(t):
    return re.sub(r"[^a-z0-9']", "", t.lower())


def load_words(path):
    words = [w for w in json.load(open(path)) if str(w.get("text", "")).strip()]
    for w in words:
        w["start"], w["end"] = float(w["start"]), float(w["end"])
    return words


def sentences(words):
    """Splits at . ? ! or at a gap over 0.9 s; a run of more than 30 words also splits at a gap over 0.5 s."""
    out, cur = [], []
    for i, w in enumerate(words):
        cur.append(i)
        gap = words[i + 1]["start"] - w["end"] if i + 1 < len(words) else 99
        ended = bool(re.search(r"[.?!][\"')\]]*$", w["text"].strip())) or gap > 0.9 or (len(cur) > 30 and gap > 0.5)
        if ended:
            out.append((cur[0], cur[-1]))
            cur = []
    if cur:
        out.append((cur[0], cur[-1]))
    return out


def edges(words, a, b):
    """Cut edges for words a..b: into the quiet gap, at most 0.25 s before the first word and 0.30 s after the last."""
    prev_end = words[a - 1]["end"] if a > 0 else max(words[a]["start"] - 0.25, 0)
    next_start = words[b + 1]["start"] if b + 1 < len(words) else words[b]["end"] + 0.30
    start = words[a]["start"] - min(0.25, max((words[a]["start"] - prev_end) / 2, 0.02))
    end = words[b]["end"] + min(0.30, max((next_start - words[b]["end"]) / 2, 0.02))
    return round(max(start, 0), 2), round(end, 2)


def is_reaction(words, a, b):
    """A short sentence made of a reaction ("Absolutely.", "Yeah definitely.", "Very good."): usually someone else talking."""
    toks = [norm(w["text"]) for w in words[a:b + 1]]
    return len(toks) <= 3 and bool(toks) and (toks[0] in REACTIONS or (toks[0] == "very" and len(toks) > 1 and toks[1] in REACTIONS))


def clamp(x, lo=0.0, hi=5.0):
    return max(lo, min(hi, x))


def score_window(words, a, b, sents, si, sj, med_wpm):
    toks = [norm(w["text"]) for w in words[a:b + 1]]
    start, end = edges(words, a, b)
    dur = end - start
    first = " ".join(w["text"] for w in words[sents[si][0]:sents[si][1] + 1])
    last = " ".join(w["text"] for w in words[sents[sj][0]:sents[sj][1] + 1])
    lead = " ".join(w["text"] for w in words[sents[si][0]:sents[min(si + 1, sj)][1] + 1]).lower()
    flags = []

    # hook: how the first sentence opens
    fw = [norm(w["text"]) for w in words[sents[si][0]:sents[si][1] + 1]]
    hook = 1.5
    if first.rstrip().endswith("?"): hook += 1.5
    if any(c.isdigit() for c in first) or any(t in LIST_MARKERS for t in fw[:6]): hook += 0.8
    if "you" in fw[:8] or "your" in fw[:8]: hook += 0.8
    if any(t in POWER_WORDS for t in fw[:10]): hook += 0.8
    if len(fw) <= 14: hook += 0.6
    if fw and fw[0] in FILLERS: hook -= 1.0

    # standalone: can a cold viewer follow it?
    coh = 5.0
    if fw and fw[0] in WEAK_OPENERS: coh -= 2.0; flags.append(f"starts mid-thought: '{fw[0]}'")
    elif fw and fw[0] in PRONOUN_OPENERS: coh -= 1.5; flags.append(f"opens on a pronoun: '{fw[0]}'")
    hits = [p for p in BACK_REFS if p in lead]
    if hits: coh -= 2.0; flags.append(f"refers back: '{hits[0]}'")
    last_toks = [norm(w["text"]) for w in words[sents[sj][0]:sents[sj][1] + 1]]
    if is_reaction(words, *sents[sj]): coh -= 2.0; flags.append("ends on a reaction (another voice?)")
    cut_ins = [(words[k]["start"], words[k]["text"]) for k in range(a + 1, b) if norm(words[k]["text"]) in CUT_INS]
    cut_ins += [(words[sents[k][0]]["start"], " ".join(w["text"] for w in words[sents[k][0]:sents[k][1] + 1]))
                for k in range(si + 1, sj) if is_reaction(words, *sents[k])]
    for t, txt in cut_ins[:2]: flags.append(f"another voice cuts in at {t:.1f} s ('{txt.strip('.,?! ')}')")
    coh -= min(2.0, 1.0 * len(cut_ins))
    if len(last_toks) <= 3: coh -= 1.0; flags.append("ends on a short fragment")
    if last_toks and last_toks[-1] in {"and", "but", "so", "because", "or"}: coh -= 1.5; flags.append("ends mid-thought")

    if first.rstrip().endswith("?") and sj > si and len(fw) >= 6:
        flags.append("opens on a question: if this is an interview, that is the other person's voice")

    # pauses and fillers inside the window
    gaps = [(words[k + 1]["start"] - words[k]["end"], words[k]["end"]) for k in range(a, b)]
    long_gaps = [(g, t) for g, t in gaps if g > 1.0]
    for g, t in long_gaps[:2]: flags.append(f"{g:.1f} s pause at {t:.1f}")
    n_fill = sum(1 for t in toks if t in FILLERS) + sum(" ".join(toks).count(p) for p in FILLER_PHRASES)
    fill_rate = 100 * n_fill / max(len(toks), 1)
    if fill_rate >= 4: flags.append(f"filler-heavy ({fill_rate:.0f} per 100 words)")
    coh -= min(1.0, 0.5 * len(long_gaps))

    # value: numbers, steps, a payoff near the end, varied vocabulary
    text_l = " ".join(w["text"] for w in words[a:b + 1]).lower()
    content = [t for t in toks if t and t not in STOP]
    value = 1.5
    if any(c.isdigit() for c in text_l): value += 0.8
    if sum(1 for t in toks if t in LIST_MARKERS) >= 2: value += 0.8
    tail = " ".join(w["text"] for w in words[sents[max(sj - 1, si)][0]:b + 1]).lower()
    if any(p in tail for p in PAYOFF): value += 1.0
    if content and len(set(content)) / len(content) > 0.65: value += 0.6
    if len(content) / max(len(toks), 1) > 0.5: value += 0.6

    # energy: pace against the whole recording, minus fillers and dead air
    wpm = 60 * len(toks) / max(dur, 1)
    energy = 2.5 + 5 * (wpm / med_wpm - 1) - (1.0 if fill_rate >= 4 else 0) - min(1.0, 0.5 * len(long_gaps))

    # platform fit: 30-60 s, best near 45
    fit = 5 - abs(dur - 45) / 6

    s = {"hook": clamp(hook), "standalone": clamp(coh), "value": clamp(value), "energy": clamp(energy), "platform_fit": clamp(fit, 2.0)}
    total = 100 * (0.30 * s["hook"] + 0.25 * s["standalone"] + 0.20 * s["value"] + 0.10 * s["energy"] + 0.15 * s["platform_fit"]) / 5
    return {"start": start, "end": end, "duration": round(dur, 1), "scores": {k: round(v, 1) for k, v in s.items()},
            "pre_score": round(total, 1), "flags": flags, "words": len(toks), "wpm": round(wpm),
            "first_line": first, "last_line": last, "text": " ".join(w["text"] for w in words[a:b + 1])}


def candidates(words, lo, hi, top, overlap=False):
    sents = sentences(words)
    span = words[-1]["end"] - words[0]["start"]
    med_wpm = statistics.median([60 * (sents_b - sents_a + 1) / max(words[sents_b]["end"] - words[sents_a]["start"], 0.5)
                                 for sents_a, sents_b in sents if sents_b - sents_a >= 3] or [150])
    pool = []
    for si in range(len(sents)):
        n_first = sents[si][1] - sents[si][0] + 1
        if n_first < 3 or is_reaction(words, *sents[si]): continue        # never start on "Absolutely." or a two-word scrap
        for sj in range(si, len(sents)):
            a, b = sents[si][0], sents[sj][1]
            start, end = edges(words, a, b)
            if end - start > hi: break
            if end - start >= lo:
                pool.append(score_window(words, a, b, sents, si, sj, med_wpm))
    pool.sort(key=lambda c: -c["pre_score"])
    sections = 5
    picked, per_section = [], [0] * sections
    while pool and len(picked) < top:
        for c in pool:
            c["section"] = min(int(((c["start"] + c["end"]) / 2 - words[0]["start"]) / span * sections), sections - 1) if span > 0 else 0
            c["_adj"] = c["pre_score"] - (0 if overlap else 6) * per_section[c["section"]]
        best = max(pool, key=lambda c: c["_adj"])
        picked.append(best)
        per_section[best["section"]] += 1
        pool = [c for c in pool if c is not best and (overlap or c["end"] <= best["start"] or c["start"] >= best["end"])]
    for n, c in enumerate(picked, 1):
        c["rank"] = n
        c.pop("_adj", None)
    return picked, round(med_wpm), sections


def write_md(path, data):
    lines = ["# Clip candidates (pre-ranked from the words and timing; read each one before choosing)", "",
             f"Recording {data['recording_seconds']:.0f} s, typical pace {data['median_wpm']} words a minute. "
             "Scores are 0-5; pre-score is out of 100. Flags are things to check, not verdicts.", ""]
    for c in data["candidates"]:
        s = c["scores"]
        lines += [f"## {c['rank']}. {c['start']:.1f}-{c['end']:.1f} s ({c['duration']:.0f} s) pre-score {c['pre_score']}",
                  f"hook {s['hook']} | standalone {s['standalone']} | value {s['value']} | energy {s['energy']} | fit {s['platform_fit']}"
                  + (f"  \nFlags: {'; '.join(c['flags'])}" if c["flags"] else ""), "", f"> {c['text']}", ""]
    Path(path).write_text("\n".join(lines))


def cmd_candidates(argv):
    if not argv or argv[0].startswith("--"): sys.exit(__doc__)
    tr = Path(argv[0]).expanduser()
    opt = {"--min": 30.0, "--max": 60.0, "--top": 12, "--out": str(tr.parent / "clips_candidates.json")}
    overlap = "--overlap" in argv
    argv = [a for a in argv if a != "--overlap"]
    i = 1
    while i < len(argv):
        if argv[i] not in opt or i + 1 >= len(argv): sys.exit(f"unknown or incomplete option {argv[i]}\n{__doc__}")
        opt[argv[i]] = type(opt[argv[i]])(argv[i + 1])
        i += 2
    words = load_words(tr)
    if len(words) < 20: sys.exit("transcript has fewer than 20 words")
    picked, med, sections = candidates(words, opt["--min"], opt["--max"], opt["--top"], overlap)
    if not picked: sys.exit(f"no window of {opt['--min']:.0f}-{opt['--max']:.0f} s found in this transcript")
    data = {"transcript": str(tr), "recording_seconds": round(words[-1]["end"] - words[0]["start"], 1), "median_wpm": med,
            "params": {"min": opt["--min"], "max": opt["--max"], "top": opt["--top"], "sections": sections},
            "note": "Pre-ranking from words and timing only. It does not understand the topic: the editor reads and chooses.",
            "candidates": picked}
    out = Path(opt["--out"]).expanduser()
    out.write_text(json.dumps(data, indent=1))
    write_md(out.with_suffix(".md"), data)
    print(f"{len(picked)} candidates -> {out} and {out.with_suffix('.md')}")
    for c in picked:
        print(f"  {c['rank']:>2}. {c['start']:7.1f}-{c['end']:7.1f}  {c['pre_score']:5.1f}  {c['first_line'][:70]}" + (f"   [{'; '.join(c['flags'][:2])}]" if c["flags"] else ""))


def clone(src, dst):
    r = subprocess.run(["cp", "-c", str(src), str(dst)], capture_output=True)   # APFS clone: instant, no extra disk
    if r.returncode != 0: shutil.copy2(src, dst)


def snap(words, start, end):
    """Moves a hand-picked span's edges into the nearest gap between words."""
    a = next((i for i, w in enumerate(words) if w["end"] > start + 0.05), 0)
    b = max((i for i, w in enumerate(words) if w["start"] < end - 0.05), default=len(words) - 1)
    return edges(words, a, max(a, b))


def cmd_extract(argv):
    if len(argv) < 2: sys.exit(__doc__)
    video, cand = Path(argv[0]).expanduser(), Path(argv[1]).expanduser()
    if not video.is_file(): sys.exit(f"video not found: {video}")
    data = json.load(open(cand))
    words = load_words(data["transcript"])
    opts, i = {}, 2
    while i < len(argv):
        k = argv[i]
        if k == "--span":
            opts[k] = (float(argv[i + 1]), float(argv[i + 2])); i += 3
        elif k in ("--pick", "--reels-home", "--date", "--name"):
            opts[k] = argv[i + 1]; i += 2
        else:
            sys.exit(f"unknown option {k}\n{__doc__}")
    import os
    home = Path(opts.get("--reels-home") or os.environ.get("REELS_HOME", "~/reels")).expanduser()
    day = opts.get("--date") or date.today().isoformat()
    jobs = []
    if "--span" in opts:
        if not opts.get("--name"): sys.exit("--span needs --name")
        s, e = snap(words, *opts["--span"])
        jobs.append((re.sub(r"[^a-z0-9]+", "-", opts["--name"].lower()).strip("-"), s, e, None))
    elif "--pick" in opts:
        by_rank = {c["rank"]: c for c in data["candidates"]}
        for r in (int(x) for x in opts["--pick"].split(",")):
            if r not in by_rank: sys.exit(f"no candidate {r}")
            c = by_rank[r]
            slug = re.sub(r"[^a-z0-9]+", "-", " ".join(c["first_line"].lower().split()[:4])).strip("-") or "clip"
            jobs.append((f"clip{r}-{slug}", c["start"], c["end"], c))
    else:
        sys.exit("give --pick or --span")
    for name, s, e, c in jobs:
        folder = home / f"{day}-{name}"
        if folder.exists(): sys.exit(f"{folder} already exists; not touching it")
    for name, s, e, c in jobs:
        folder = home / f"{day}-{name}"
        folder.mkdir(parents=True)
        clone(video, folder / f"raw{video.suffix.lower()}")
        (folder / "source_dir.txt").write_text(str(video.parent) + "\n")
        shutil.copy2(data["transcript"], folder / "transcript.json")
        json.dump({"source": f"raw{video.suffix.lower()}", "audio": "voice.wav", "keep": [[s, e]]}, open(folder / "edl.json", "w"))
        json.dump({"from_recording": str(video), "start": s, "end": e, "candidate": c}, open(folder / "clip.json", "w"), indent=1)
        print(f"{folder}  keep {s:.2f}-{e:.2f} s ({e - s:.0f} s)")
    print("Nothing was cut. transcript.json covers the whole recording, so skip the transcribe step; clean the voice, "
          "then review the cuts with the person before running cut.py.")


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in ("candidates", "extract"): sys.exit(__doc__)
    (cmd_candidates if sys.argv[1] == "candidates" else cmd_extract)(sys.argv[2:])
