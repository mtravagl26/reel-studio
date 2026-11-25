#!/usr/bin/env python3
"""Word-timed transcript for a clip: ElevenLabs Scribe when a key is set (tight word timing, keeps "um"/"uh"),
else the free local Whisper via HyperFrames, with its word times lined up by whisper-cli's word alignment (0.29.0). Writes a flat word list: [{"text","start","end"}, ...].
Usage: python3 transcribe.py <video-or-audio> <out.json>
Key: ELEVENLABS_API_KEY in the environment or in ~/.config/reels/.env (never pasted into chat)."""

import json, os, subprocess, sys, tempfile, urllib.error, urllib.request, uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Modified by By Mel Ross: HyperFrames pinned to the version render.sh uses, telemetry off unless you opt in.
os.environ.setdefault("HYPERFRAMES_NO_TELEMETRY", "1")
os.environ.setdefault("DO_NOT_TRACK", "1")
from pathlib import Path

src, out = Path(sys.argv[1]).expanduser(), Path(sys.argv[2]).expanduser()


def key():
    if os.environ.get("ELEVENLABS_API_KEY"):
        return os.environ["ELEVENLABS_API_KEY"]
    env = Path("~/.config/reels/.env").expanduser()
    for line in (env.read_text().splitlines() if env.exists() else []):
        if line.startswith("ELEVENLABS_API_KEY="):
            return line.split("=", 1)[1].strip()


def scribe(k):
    with tempfile.TemporaryDirectory() as tmp:
        audio = Path(tmp) / "a.mp3"  # mono 64 kbps: ~0.5 MB a minute, only the audio leaves the machine
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                "-i",
                str(src),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-b:a",
                "64k",
                str(audio),
            ],
            check=True,
        )
        data = audio.read_bytes()
    for model in ("scribe_v2", "scribe_v1"):
        b = uuid.uuid4().hex
        body = b"".join(
            [
                f'--{b}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\n{model}\r\n'.encode(),
                f'--{b}\r\nContent-Disposition: form-data; name="timestamps_granularity"\r\n\r\nword\r\n'.encode(),
                f'--{b}\r\nContent-Disposition: form-data; name="tag_audio_events"\r\n\r\nfalse\r\n'.encode(),
                f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n'.encode(),
                data,
                f"\r\n--{b}--\r\n".encode(),
            ]
        )
        req = urllib.request.Request(
            "https://api.elevenlabs.io/v1/speech-to-text",
            data=body,
            method="POST",
            headers={"xi-api-key": k, "Content-Type": f"multipart/form-data; boundary={b}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                res = json.load(r)
            return model, [
                {"text": w["text"], "start": round(w["start"], 3), "end": round(w["end"], 3)}
                for w in res.get("words", [])
                if w.get("type") == "word" and w["text"].strip()
            ]
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:200]
            if e.code in (400, 422) and "model" in msg.lower():
                continue  # model id not offered: try the older one
            sys.exit(f"ElevenLabs error {e.code}: {msg}")
    sys.exit("ElevenLabs: no usable Scribe model")


k = key()
if k:
    model, words = scribe(k)
    print(f"transcribed with ElevenLabs {model}: {len(words)} words")
else:
    d = out.parent / (out.stem + "_whisper")
    r = subprocess.run(
        ["npx", "-y", "hyperframes@0.8.145", "transcribe", str(src), "-d", str(d), "--json", "--model", "small.en"],
        capture_output=True,
        text=True,
    )
    # Modified by By Mel Ross (0.10.1): this used to end in a bare traceback
    if r.returncode != 0 or not (d / "transcript.json").exists():
        why = (r.stdout + r.stderr).strip().splitlines()[-3:]
        sys.exit(
            "local Whisper could not transcribe this clip:\n  "
            + "\n  ".join(why or ["no output"])
            + "\nThe first run downloads the speech model (about 500 MB) from huggingface.co, so it needs internet. "
            "Or add ELEVENLABS_API_KEY to ~/.config/reels/.env to use Scribe."
        )
    words = json.load(open(d / "transcript.json"))
    print(f"transcribed with local Whisper (no ElevenLabs key): {len(words)} words")
    # Added by By Mel Ross (0.29.0): local Whisper's word times run late, by a different amount per word. Line them up with
    # whisper-cli's word alignment; if that can't run, keep the times and say so.
    import word_timing

    words, msg = word_timing.retime(src, words)
    print("word times:", msg)
json.dump(words, open(out, "w"))
try:  # 0.29.0: how late the word starts run against the audio, so late captions are caught on every reel
    import word_timing

    r = word_timing.lag(src, [w["start"] for w in words])
    print(word_timing.say(r))
    if r["median"] is not None and r["median"] >= 0.08:
        print(
            f"TIP (tell them once): captions would show about {r['median']:.1f} s after the word. "
            f'"caption_lead": {min(0.3, round(r["median"], 1))} in brand.json, or "When captions appear" on the Edit page, shows them earlier.'
        )
except Exception as e:
    print("word starts: NOT CHECKED:", e)
