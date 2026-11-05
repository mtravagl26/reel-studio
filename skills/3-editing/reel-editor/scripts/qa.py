#!/usr/bin/env python3
"""QA gate for a finished reel. Checks size, length, loudness, and (if expected.txt exists) that no words were lost.
Usage: python3 qa.py <reel-folder> [video]     default video: final.mp4. Exit code 1 if anything fails."""
import difflib, json, os, re, subprocess, sys
# Modified by By Mel Ross: HyperFrames pinned to the version render.sh uses, telemetry off unless you opt in; also checks true peak,
# clipping and the cover size (Reel Studio 0.2.0).
os.environ.setdefault("HYPERFRAMES_NO_TELEMETRY", "1"); os.environ.setdefault("DO_NOT_TRACK", "1")
from pathlib import Path

reel = Path(sys.argv[1]).expanduser()
video = reel / (sys.argv[2] if len(sys.argv) > 2 else "final.mp4")
home = Path(os.environ.get("REELS_HOME", "~/reels")).expanduser()
brand = json.load(open(home / "brand.json"))
fails = []

def probe(entries):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", entries,
                          "-of", "json", str(video)], capture_output=True, text=True, check=True).stdout
    return json.loads(out)

info = probe("stream=width,height:format=duration")
w, h = info["streams"][0]["width"], info["streams"][0]["height"]
dur = float(info["format"]["duration"])
want = [1080, 1920] if os.environ.get("REEL_PREVIEW") else brand.get("resolution", [1080, 1920])
print(f"size      {w}x{h}  (want {want[0]}x{want[1]})")
if [w, h] != list(want): fails.append("size")
print(f"length    {dur:.1f}s  (max {brand.get('max_seconds', 60)}s)")
if dur > brand.get("max_seconds", 60): fails.append("length")

ebu = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(video), "-af", "ebur128=peak=true", "-f", "null", "-"],
                     capture_output=True, text=True).stderr
lufs = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", ebu)[-1])
# Modified by By Mel Ross: voice-only reels come out at -16 LUFS (clean_audio.sh, mix_audio.py); -14 is still accepted for music-led mixes
print(f"loudness  {lufs:.1f} LUFS  (want -17.5 to -12.5; -16 is the default, -14 for music-led reels)")
if not -17.5 <= lufs <= -12.5: fails.append("loudness")
# Modified by By Mel Ross: true peak and clipping, so the mix never distorts on a phone speaker
tpk = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", ebu)
if tpk:
    print(f"peak      {float(tpk[-1]):.1f} dBTP  (want -1.0 or lower)")
    if float(tpk[-1]) > -1.0: fails.append("true peak")
st = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(video), "-vn", "-af", "astats=measure_perchannel=none", "-f", "null", "-"],
                    capture_output=True, text=True).stderr
pk = re.findall(r"Peak level dB:\s+(-?[\d.]+)", st)
if pk and float(pk[-1]) >= -0.05:
    print("clipping  samples reach full scale"); fails.append("clipping")
# Every reel comes with a cover: 1080x1920 JPG. (Made after QA, so a missing one is a reminder, not a failure; deliver.sh insists.)
cov = reel / "cover.jpg"
if cov.exists():
    cs = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(cov)],
                        capture_output=True, text=True).stdout.strip()
    print(f"cover     {cs}  (want 1080,1920)")
    if cs != "1080,1920": fails.append("cover size")
else:
    print("cover     not made yet (cover.py, step 7: every reel gets one)")

exp = reel / "expected.txt"
if exp.exists():
    tok = lambda s: re.sub(r"[^a-z0-9' ]", " ", s.lower()).split()
    subprocess.run(["npx", "-y", "hyperframes@0.8.145", "transcribe", str(video), "-d", str(reel / "qa_transcript"),
                    "--json", "--model", "small.en"], capture_output=True)
    heard = [t for wd in json.load(open(reel / "qa_transcript/transcript.json")) for t in tok(wd["text"])]
    expected = tok(exp.read_text())
    ratio = difflib.SequenceMatcher(None, expected, heard, autojunk=False).ratio()
    missing = [expected[i1:i2] for op, i1, i2, _, _ in
               difflib.SequenceMatcher(None, expected, heard, autojunk=False).get_opcodes() if op in ("delete", "replace")]
    print(f"words     {ratio:.0%} match" + (f"; check: {missing[:6]}" if missing else ""))
    if ratio < 0.95: fails.append("words")
else:
    print("words     skipped (write the approved script to expected.txt to check for clipped words)")

print("PASS" if not fails else f"FAIL: {', '.join(fails)}")
sys.exit(1 if fails else 0)
