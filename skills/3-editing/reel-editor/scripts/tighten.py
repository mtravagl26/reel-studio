#!/usr/bin/env python3
"""Tighten an approved rough cut: remove fillers and shorten pauses inside the kept spans, as hard as brand.json "pacing" says (scripts/pacing.py).
Run after the person approves edl.json, before cut.py. Rewrites edl.json (the original is kept as edl_rough.json).
Usage: python3 tighten.py <reel-folder>
       python3 tighten.py <reel-folder> --detect   only find the fillers (writes fillers.json); run before the review page

How: Whisper normally hides fillers inside neighbouring words, so it is re-run with a prompt full of "um, uh",
which makes it write them down. Pauses come from silencedetect on the cleaned voice. Every cut edge keeps the preset's
air (50-150 ms) so words never clip."""
import json, os, re, shutil, subprocess, sys
# Modified by By Mel Ross: HyperFrames pinned to the version render.sh uses, telemetry off unless you opt in.
os.environ.setdefault("HYPERFRAMES_NO_TELEMETRY", "1"); os.environ.setdefault("DO_NOT_TRACK", "1")
from pathlib import Path

reel = Path(sys.argv[1]).expanduser()
DETECT = "--detect" in sys.argv[2:]
edl = {} if DETECT else json.load(open(reel / "edl.json"))
voice = reel / edl.get("audio", "voice.wav")
sys.path.insert(0, str(Path(__file__).resolve().parent))
from pacing import pacing
P_ = pacing(json.load(open(Path(os.environ.get("REELS_HOME", "~/reels")).expanduser() / "brand.json")))
PAD, MIN_PAUSE = P_["air"], P_["pause_min"]
FILLERS = set(P_["fillers"])

# 1. fillers, via Whisper with a filler-heavy prompt
cuts = []
def find_whisper():
    cli = shutil.which("whisper-cli") or next((str(p) for p in Path("~/.cache/hyperframes/whisper").expanduser().rglob("whisper-cli")), None)
    model = next(iter(sorted(Path("~/.cache/hyperframes/whisper/models").expanduser().glob("ggml-small*.bin"))), None)
    return cli, model
cli, model = find_whisper()
if not (cli and model):   # fresh install (or the ElevenLabs route): HyperFrames' transcriber downloads whisper-cli + the model
    print("local Whisper not installed yet: installing it (one time, a few minutes)")
    try:
        subprocess.run(["npx", "-y", "hyperframes@0.8.145", "transcribe", str(voice), "-d", str(reel / "_whisper_setup"), "--json", "--model", "small.en"],
                       capture_output=True)
    except OSError as e:
        print("couldn't install Whisper:", e)
    shutil.rmtree(reel / "_whisper_setup", ignore_errors=True)
    cli, model = find_whisper()
found = False
if cli and model:
    wav16 = reel / "v16.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(voice), "-ar", "16000", "-ac", "1", str(wav16)], check=True)
    r = subprocess.run([cli, "-m", str(model), "-f", str(wav16), "--prompt", "Um, uh, so, like, um, I mean, uh, you know.",
                        "-ml", "1", "-sow", "-oj", "-of", str(reel / "fillers")], capture_output=True, text=True)
    if r.returncode == 0 and (reel / "fillers.json").exists():
        found = True
        toks = [(t["text"].strip(), t["offsets"]["from"] / 1000, t["offsets"]["to"] / 1000)
                for t in json.load(open(reel / "fillers.json"))["transcription"] if t["text"].strip()]
        for k, (txt, a, b) in enumerate(toks):
            if re.sub(r"[^a-z]", "", txt.lower()) in FILLERS:
                nxt = toks[k + 1][1] if k + 1 < len(toks) else b
                cuts.append((a - 0.02, max(b, min(nxt, a + 0.7)) - 0.02))
        print(f"fillers found: {len(cuts)}", [round(a, 1) for a, _ in cuts])
    else:
        (reel / "fillers.json").unlink(missing_ok=True)   # never leave a stale or half-written file behind
        print("whisper-cli failed:", (r.stderr or "").strip()[-300:])
if not found:
    print("FILLERS NOT DETECTED: um/uh won't be cut automatically. Tell the person, and offer to cut them by hand on the review.")
if DETECT: sys.exit(0 if found else 3)

# 2. pauses, via silencedetect on the cleaned voice. The threshold sits just above THIS clip's background noise
#    (outdoor or noisy rooms never reach a fixed -40 dB, so a fixed threshold finds nothing).
import array, math, wave
wf = wave.open(str(voice)); sr = wf.getframerate(); pcm = array.array("h"); pcm.frombytes(wf.readframes(wf.getnframes()))
hop = int(sr * 0.05)
lev = sorted(20 * math.log10(max(1.0, math.sqrt(sum(x * x for x in pcm[i:i + hop:4]) / (hop / 4))) / 32768)
             for i in range(0, len(pcm) - hop, hop))
floor = lev[len(lev) // 10]
thresh = min(floor + 5, -20)
print(f"background noise {floor:.0f} dB -> pause threshold {thresh:.0f} dB")
out = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(voice), "-af", f"silencedetect=noise={thresh:.1f}dB:d={MIN_PAUSE}", "-f", "null", "-"],
                     capture_output=True, text=True).stderr
starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", out)]
ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", out)]
pauses = [(a + PAD, b - PAD) for a, b in zip(starts, ends) if b - a > MIN_PAUSE]
cuts += pauses
cuts.sort()

# 3. subtract the cuts from each approved span (span order is preserved, so a moved CTA stays moved)
def subtract(span, cuts):
    a, b = span; parts, cur = [], a
    for ca, cb in cuts:
        if cb <= cur or ca >= b: continue
        if ca > cur + 0.05: parts.append([round(cur, 3), round(ca, 3)])
        cur = max(cur, cb)
    if b > cur + 0.05: parts.append([round(cur, 3), round(b, 3)])
    return parts
before = sum(b - a for a, b in edl["keep"])
shutil.copy(reel / "edl.json", reel / "edl_rough.json")
edl["keep"] = [p for span in edl["keep"] for p in subtract(span, cuts)]
after = sum(b - a for a, b in edl["keep"])
json.dump(edl, open(reel / "edl.json", "w"))
print(f"{len(pauses)} pauses + fillers removed: {before:.1f}s -> {after:.1f}s kept ({len(edl['keep'])} pieces)")
