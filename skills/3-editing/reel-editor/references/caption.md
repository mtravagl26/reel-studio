# The caption step (0.20.0)

Step 4 of Unmess Reels, after the cover: the post caption that goes under the reel on Instagram. You write 3 drafts. The person picks one and edits it on the Caption page (`/caption` at their Unmess Reels link, the 4th button in the step bar).

## What you do

1. `python3 scripts/caption.py brief <reel>` prints what to write from: what the reel says, their voice and rules from `brand.md`, the keyword and what they send, and the limits.
2. If the brief shows no keyword or no "what they get", ask them. One word people comment (for example REEL), and what they send to people who comment it. They can also type both on the page; it saves them to `caption.json` before any draft exists.
3. Write `<reel>/caption.json` with 3 drafts: `short`, `medium`, `long`. Each has `hook`, `body`, `cta` and `hashtags`. Leave `cta` as `""` to use the keyword line ("Comment REEL and I'll send you ...").
4. `python3 scripts/caption.py check <reel>` and fix every `FIX:` line.
5. Give them the Caption page link. The page shows the drafts by itself once the file is there.

## Style, emojis and the ask (picked on the page)

The person picks these on the Caption page; they are saved in `caption.json` and printed in the brief. Write to them.

- **`tone`**: `mine` (their usual voice), `funny`, `witty`, `sarcastic`, `warm`, `bold`, `serious`, `corporate`. A style changes how it sounds, never what is true. Their `brand.md` rules win over every style: sarcasm is aimed at the situation, never at the reader or a person.
- **`emoji`**: `0` none, `1` a few (1 or 2), `2` some (3 to 5), `3` lots (6 to 10), per caption. `check` counts them.
- **`ask`**: `keyword` ("Comment REEL and I'll send you ..."), `follow` ("Follow for more ..." with their `more` text), `save`, `share`, or `none`. Leave each draft's `cta` empty and the page writes the line; fill `cta` only when they asked for their own closing line.
- When you write or rewrite the drafts, set `"written": {"tone": ..., "emoji": ...}` to the style you wrote in. The page compares it with what is picked now, and offers a "rewrite" request when they differ. When they bring you that request, run the brief again, rewrite all 3 drafts, update `written`, and run `check`.

## Rules for the writing

- Only say what the reel says or what they told you. No invented stories, clients, results or numbers. No fear.
- Their voice rules in `brand.md` win over your habits. Read them in the brief before you write.
- The hook is one line of at most 125 characters, because that is about what Instagram shows before "more". Each draft gets its own hook. It does not repeat the reel's first sentence word for word.
- The body adds to the reel. It does not transcribe it. Short lines, blank lines between thoughts.
- 3 to 5 hashtags about this reel's topic. Instagram allows 5 at most on a reel (since December 2025). They go in the `hashtags` list, never in the hook or body.
- The whole caption is at most 2,200 characters.

## What the page does

- Tabs for Short, Medium and Long. Each part is editable. Counters show the hook against 125 characters, the hashtags against 5, and the whole caption against 2,200.
- A preview shows the caption as Instagram shows it under a reel (cut at "more"), and in full.
- "Copy this caption" copies it for pasting into Instagram. "Use this one" marks it as chosen and writes `<reel>/caption.txt`.
- `deliver.sh` copies `caption.txt` beside the video as `<name> caption.txt`. Delivery does not require a caption.

`python3 scripts/caption.py text <reel>` prints the chosen caption if you need it in chat.
