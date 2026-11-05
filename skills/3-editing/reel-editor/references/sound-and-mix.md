# Sound effects, music bed and the final mix

Added by By Mel Ross (see the repo NOTICE). Everything here runs on this computer with ffmpeg and plain Python.

## The three levels

The final audio is built from three separate parts, by `scripts/mix_audio.py` (render.sh runs it last):

| Part | Where it comes from | Level setting (`brand.json` → `"mix"`, dB) |
|---|---|---|
| **Voice** | the cut's own audio (already cleaned by `clean_audio.sh`) | `"voice": 0` |
| **Music** | `"music": "<file>"` in `brand.json` (or `"music"` in a reel's `edit.json`) | `"music": -14`: level in the gaps, relative to the voice's loudness |
| **Effects** | `sfx_events.json`, written by `build_reel.py` | `"effects": 0`: all effects together |

Music follows the voice. While they speak it dips by `"duck"` (default -10 dB, so about -24 dB under the voice) and when they pause for half a second or more it comes back up to the gap level. Short pauses between words don't make it pump (`"hold": 0.45` seconds). Dips start just before the voice comes in, rises take about 0.6 s. The music fades in over 0.5 s and out over the last 1.2 s, and loops if it is shorter than the reel.

The whole mix then goes through a soft limiter and a two-pass loudness normalisation to **-14 LUFS** (what Instagram, TikTok and YouTube Shorts play at) with a **true peak under -1.5 dBTP**, so nothing clips. The result is measured again and printed, and saved to `mix_report.json`; `qa.py` fails a reel that is more than 1 LU off, peaks above -1.0 dBTP or clips.

Settings in `brand.json` (all optional): `{"mix": {"voice": 0, "music": -14, "duck": -10, "effects": 0, "lufs": -14, "true_peak": -1.5, "hold": 0.45, "attack": 0.12, "release": 0.6}}`. A reel can override them with `"mix"` in its `edit.json`. `"mix": {"legacy": true}` goes back to the old way (effects baked into the render, no ducking).

No music file yet? `python3 scripts/make_music_bed.py ~/reels/assets/music-bed.wav` makes a calm, loopable bed (original synthesis, nothing to license), then set `"music"` to that path. Or use your own music: you need the rights to it.

## The sound-effects library

40 effects, listed in `assets/sfx-manifest.json` with each one's category, description, default level, **source and license**. The original six (`whoosh`, `swish`, `pop`, `snap`, `chime`, `typing`) are made by `setup_engine.sh`; the other 34 by `scripts/make_sfx.py`, which synthesises every one from scratch (no samples, no downloads), so there is nothing to license beyond this project. `python3 scripts/make_sfx.py --list` prints them.

| Category | Effects |
|---|---|
| whoosh | `whoosh-fast`, `whoosh-slow`, `whoosh-up`, `whoosh-down`, `swoosh-soft` |
| pop | `pop-soft`, `pop-bubble` |
| ui | `click`, `tick`, `camera-shutter` |
| snap | `finger-snap` |
| impact | `impact-low`, `impact-hit`, `impact-cinematic`, `thud` |
| rise | `rise`, `rise-tonal`, `reverse-swell` |
| ding | `ding`, `ding-soft`, `ding-double`, `notification`, `coin`, `sparkle`, `success`, `error-buzz` |
| typing | `typing-keys`, `typing-fast` |
| paper | `paper-rustle`, `paper-flip`, `page-turn` |
| glitch | `glitch`, `glitch-long`, `digital-error` |

Using them:

- **Automatic**: cards play their own entrance sound (`snap` for a title, `pop` for a tag, `coin` for a call-to-action...) when `brand.json` `"sfx"` is `"subtle"` (or `"lots"`). `"none"` turns the automatic sounds off.
- **Where you want them** (always plays, whatever `"sfx"` says): `"sfx_events": [{"name": "rise", "t": 12.4, "db": -9}]` in `edit.json`. `db` is the effect's peak level in dBFS (default -10). Put a `rise` so it ends on the beat (`t` = the beat minus the effect's length).
- **Swap one card's sound**: `"sfx": {"name": "ding", "db": -10}` on the card; `"sfx": false` mutes it.
- **Per-effect volume**: `brand.json` → `"sfx_volume": {"pop": -3, "whoosh-fast": 2}`: a dB change for that effect everywhere, on top of its default level in the manifest.

Effects sit 10-15 dB under the voice; keep them rare. A reel with an effect on every card sounds cheap.
