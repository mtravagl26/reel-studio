# Finding clips in a long recording

Added by By Mel Ross. Use this when the person hands over one long recording (a talk, a podcast-style interview, a
long phone ramble) and wants short reels from it, not one edit of the whole thing. Nothing here uploads or cuts: it reads
a transcript and proposes; the person chooses.

## 1. Transcript

`python3 scripts/transcribe.py <long-recording> transcript.json` in a scratch folder (the same step as everywhere else:
local Whisper unless an ElevenLabs key is set). If a word-timed transcript of this recording already exists, reuse it.

## 2. Shortlist

```
python3 scripts/find_clips.py candidates transcript.json --out clips_candidates.json
```

Writes `clips_candidates.json` and a readable `clips_candidates.md`. Each candidate starts at a sentence start and ends at a
sentence end, 30-60 s long, with the cut edges already placed in the quiet gap next to the first and last word. Picks never
overlap and are spread across the recording (the same moment is not offered five times). `--min`, `--max` and `--top` change
the length and the count; `--overlap` shows the alternatives around one moment (different start or end).

The pre-score is from the words and the timing only, 0-5 on each of:

| Score | What it looks at |
|---|---|
| hook | the first sentence: a question, a number or step, "you", a strong word, short and direct |
| standalone | would a stranger follow it: no start on "and / but / so", no opening pronoun, no "as I said earlier", no ending on a fragment, no other voice cutting in |
| value | numbers, steps, a payoff sentence near the end, varied wording |
| energy | pace against the rest of the recording, fewer fillers and long pauses |
| platform fit | 30-60 s, best near 45 s |

**It does not understand the topic.** A high pre-score means "worth reading", not "good". Flags (starts mid-thought, refers
back, filler-heavy, long pause, another voice cuts in, opens on a question) are things to check by reading.

## 3. Read and choose (your call, then theirs)

1. Read the `.md` in full. For any promising moment read the lines just before it in `transcript.json`: does it need them?
2. Apply the stranger test to each: a cold viewer must follow it with no earlier context. Drop or widen a clip that needs the
   setup, makes a promise it does not pay off, or stops before the point lands. Prefer a clip that opens on the claim or the
   question itself over a warm-up.
3. **Interviews.** A recording with two voices has no speaker labels here. A clip that opens on a question has the other
   person's voice in it; a clip that is one person's answer from its first word to its last usually works better as a solo
   reel. Look for the flags, and when it is an interview pick spans inside one answer.
4. Pick 3-5. Keep them different from each other (topic, energy, where they sit in the recording).
5. Tell the person, per clip: the time range and length, the opening line in their words, one sentence on why it works, and
   any flag you could not clear. Offer to adjust an edge. **Wait for their yes** on which clips to make.

## 4. Set up the chosen clips

```
python3 scripts/find_clips.py extract <long-recording> clips_candidates.json --pick 1,3
python3 scripts/find_clips.py extract <long-recording> clips_candidates.json --span 156.4 203.3 --name strategy-and-creativity
```

`--span` is for a clip you adjusted by hand; its edges are moved into the nearest gap between words. Each clip gets its own
reel folder in `REELS_HOME` (`<date>-clip<rank>-<first words>`, or `<date>-<name>`) with `raw.<ext>` (an instant clone of
the recording on a Mac, otherwise a copy; the original is never touched), `edl.json` holding the one span to keep,
the whole-recording `transcript.json`, `source_dir.txt` and `clip.json` (where it came from and its scores). It refuses to
overwrite a folder. **Nothing is cut yet.**

Carry on from step 2 of the edit in `SKILL.md`: skip the transcribe step (the transcript is already there and its times
match `raw.<ext>`), clean the voice, then the review step with the span as the starting cut, then tighten and cut. The voice
clean-up runs over the whole recording, so it takes longer than it would for a short clip.
