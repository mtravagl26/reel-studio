# Rough cut review

Show the transcript grouped into spoken lines (break at pauses over ~0.4 s or sentence ends), numbered, with times:

```
 1  0.0-2.1   okay so
 2  2.1-5.8   I taught Claude to edit my reels this week        ✂ cut "okay so" (warm-up)
 3  5.8-9.4   and honestly it's kind of wild                     ✂ drop filler "kind of"
 4  9.4-13.0  comment EDIT and I'll send you the setup           ↓ move to end (CTA)
 ...
Projected length: 41 s at 1.1x
```

Then ask: "Happy with these cuts? Tell me any line numbers to keep or cut."

Propose cuts for:
- warm-ups and false starts ("okay so", a sentence they restart)
- a line that repeats an earlier point
- fillers: um, uh, like (as filler), kind of, sort of, basically, essentially, you know
- long pauses (only if measured; most people pause less than you'd think)

Never cut without their yes. Never cut a word you can't cut cleanly; leave it in and say so.

## edl.json

The kept spans of the source, in play order (reordering is fine, e.g. CTA last):

```json
{ "source": "raw.mov", "audio": "voice.wav", "keep": [[0.55, 9.40], [13.0, 38.2], [9.40, 13.0]] }
```

Snap every edge into the quiet gap between words: check the 20 ms loudness dips in `voice.wav` near each Whisper time rather than trusting the word time.
