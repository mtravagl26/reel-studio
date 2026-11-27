#!/usr/bin/env python3
"""QA gate for a finished reel. Checks size, length, loudness, and (if expected.txt exists) that no words were lost.
Usage: python3 qa.py <reel-folder> [video] [--looked cards,captions,cover,cuts,names]
default video: final.mp4. Exit code 1 if anything fails.

Ends with a report that labels every check (Added by By Mel Ross, 0.10.0):
  Measured     a number this script read from the file
  Looked at    something you opened and looked at or listened to yourself; name them with --looked, and only those
  Not checked  everything else. Say these to the person as not checked; never fold them into "all good"."""

import difflib, json, os, re, subprocess, sys

# Modified by By Mel Ross: HyperFrames pinned to the version render.sh uses, telemetry off unless you opt in; also checks true peak,
# clipping and the cover size (Unmess Reels 0.2.0).
os.environ.setdefault("HYPERFRAMES_NO_TELEMETRY", "1")
os.environ.setdefault("DO_NOT_TRACK", "1")
from pathlib import Path

LOOKS = {
    "cards": "every card: text inside the frame and readable",
    "captions": "captions: readable and clear of the face",
    "cover": "the cover: eyes open, title readable",
    "cuts": "how the cuts sound",
    "names": "names and brand words spelled right",
}
looked = set()
if "--looked" in sys.argv:
    i = sys.argv.index("--looked")
    looked = {x.strip() for x in (sys.argv[i + 1] if i + 1 < len(sys.argv) else "").split(",") if x.strip()}
    del sys.argv[i : i + 2]
    if looked - set(LOOKS):
        sys.exit(f"--looked takes: {', '.join(LOOKS)}")
measured, unmeasured = ["size", "length", "loudness"], []
reel = Path(sys.argv[1]).expanduser()
video = reel / (sys.argv[2] if len(sys.argv) > 2 else "final.mp4")
home = Path(os.environ.get("REELS_HOME", "~/reels")).expanduser()
# the reel's look (speed, resolution, sfx ...) is laid over brand.json
sys.path.insert(0, str(Path(__file__).resolve().parent))
import theme as _theme

brand = _theme.load_brand(home, reel, quiet=True)
fails = []


def probe(entries):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", entries, "-of", "json", str(video)],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out)


info = probe("stream=width,height:format=duration")
w, h = info["streams"][0]["width"], info["streams"][0]["height"]
dur = float(info["format"]["duration"])
want = [1080, 1920] if os.environ.get("REEL_PREVIEW") else brand.get("resolution", [1080, 1920])
print(f"size      {w}x{h}  (want {want[0]}x{want[1]})")
if [w, h] != list(want):
    fails.append("size")
# Modified by By Mel Ross (0.10.1): a target, default 3 minutes; over it is a note, not a failed check
MAXS = brand.get("max_seconds", 180)
print(
    f"length    {dur:.1f}s  (target: up to {MAXS}s)"
    + ("  NOTE: over the target - tell them, their call" if dur > MAXS else "")
)

ebu = subprocess.run(
    ["ffmpeg", "-hide_banner", "-i", str(video), "-af", "ebur128=peak=true", "-f", "null", "-"],
    capture_output=True,
    text=True,
).stderr
lufs = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", ebu)[-1])
# Modified by By Mel Ross: voice-only reels come out at -16 LUFS (clean_audio.sh, mix_audio.py); -14 is still accepted for music-led mixes
print(f"loudness  {lufs:.1f} LUFS  (want -17.5 to -12.5; -16 is the default, -14 for music-led reels)")
if not -17.5 <= lufs <= -12.5:
    fails.append("loudness")
# Modified by By Mel Ross: true peak and clipping, so the mix never distorts on a phone speaker
tpk = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", ebu)
if tpk:
    print(f"peak      {float(tpk[-1]):.1f} dBTP  (want -1.0 or lower)")
    measured.append("true peak")
    if float(tpk[-1]) > -1.0:
        fails.append("true peak")
st = subprocess.run(
    ["ffmpeg", "-hide_banner", "-i", str(video), "-vn", "-af", "astats=measure_perchannel=none", "-f", "null", "-"],
    capture_output=True,
    text=True,
).stderr
pk = re.findall(r"Peak level dB:\s+(-?[\d.]+)", st)
if pk and float(pk[-1]) >= -0.05:
    print("clipping  samples reach full scale")
    fails.append("clipping")
# Every reel comes with a cover: 1080x1920 JPG. (Made after QA, so a missing one is a reminder, not a failure; deliver.sh insists.)
cov = reel / "cover.jpg"
if cov.exists():
    cs = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0",
            str(cov),
        ],
        capture_output=True,
        text=True,
    ).stdout.strip()
    print(f"cover     {cs}  (want 1080,1920)")
    if cs != "1080,1920":
        fails.append("cover size")
    measured.append("cover size")
else:
    print("cover     not made yet (cover.py, step 7: every reel gets one)")
    unmeasured.append("cover size (no cover yet)")

# Added by By Mel Ross (0.29.0): caption timing. Each highlighted word's time (minus "caption_lead") against the start of its
# sound in master.mp4, the voice on the same clock as the captions. Only words after a pause are measured.
try:
    _ed = json.load(open(reel / "edit.json")) if (reel / "edit.json").exists() else {}
    _ws = [w["t"] for c in _ed.get("captions", []) if not c.get("off") for w in c.get("words", []) if "t" in w]
    if _ws and (reel / "master.mp4").exists():
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import word_timing as _wt

        _lead = float(_ed["caption_lead"] if "caption_lead" in _ed else brand.get("caption_lead") or 0)
        _r = _wt.lag(reel / "master.mp4", [t - _lead for t in _ws])
        print("captions  " + _wt.say(_r, "timing"))
        if _r["median"] is None:
            unmeasured.append("caption timing (too few pauses to measure)")
        else:
            measured.append(f"caption timing ({_r['median']:+.2f} s, {_r['n']} words)")
            if abs(_r["median"]) >= 0.2:
                fails.append("caption timing")
            elif _r["median"] >= 0.08:
                print(
                    f"          captions run {_r['median']:.2f} s late: try \"caption_lead\": {min(0.3, round(_r['median'], 1))}"
                )
    else:
        unmeasured.append("caption timing (no captions or no master.mp4)")
except Exception as e:  # the check must never stop QA
    print("captions  timing NOT CHECKED:", e)
    unmeasured.append("caption timing (the check could not run)")

exp = reel / "expected.txt"
if exp.exists():
    tok = lambda s: re.sub(r"[^a-z0-9' ]", " ", s.lower()).split()
    subprocess.run(
        [
            "npx",
            "-y",
            "hyperframes@0.8.145",
            "transcribe",
            str(video),
            "-d",
            str(reel / "qa_transcript"),
            "--json",
            "--model",
            "small.en",
        ],
        capture_output=True,
    )
    qt = reel / "qa_transcript/transcript.json"
    if qt.exists() and qt.stat().st_mtime >= video.stat().st_mtime:
        heard = [t for wd in json.load(open(qt)) for t in tok(wd["text"])]
        expected = tok(exp.read_text())
        ratio = difflib.SequenceMatcher(None, expected, heard, autojunk=False).ratio()
        missing = [
            expected[i1:i2]
            for op, i1, i2, _, _ in difflib.SequenceMatcher(None, expected, heard, autojunk=False).get_opcodes()
            if op in ("delete", "replace")
        ]
        print(f"words     {ratio:.0%} match" + (f"; check: {missing[:6]}" if missing else ""))
        if ratio < 0.95:
            fails.append("words")
        measured.append(f"spoken words against the script ({ratio:.0%} match)")
    else:  # Modified by By Mel Ross (0.10.1): this used to crash when local Whisper could not run
        print(
            "words     NOT CHECKED: local Whisper could not transcribe the render (it needs its speech model; see transcribe.py)"
        )
        unmeasured.append("missing words (transcription did not run)")
else:
    print("words     skipped (write the approved script to expected.txt to check for clipped words)")
    unmeasured.append("missing words (no expected.txt)")

print("REPORT (pass each line on with its label)")
print("  Measured     " + ", ".join(measured))
print("  Looked at    " + ("; ".join(LOOKS[k] for k in LOOKS if k in looked) or "nothing yet"))
print(
    "  Not checked  " + "; ".join(unmeasured + [LOOKS[k] for k in LOOKS if k not in looked])
    if unmeasured or looked != set(LOOKS)
    else "  Not checked  nothing"
)
print("PASS" if not fails else f"FAIL: {', '.join(fails)}")
sys.exit(1 if fails else 0)
