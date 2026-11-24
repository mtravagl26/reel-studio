# The caption step (0.20.0)

Step 4 of Reel Studio, after the cover: the post caption that goes under the reel on Instagram. You write 3 drafts. The person picks one and edits it on the Caption page (`/caption` at their Reel Studio link, the 4th button in the step bar).

## What you do

1. `python3 scripts/caption.py brief <reel>` prints what to write from: what the reel says, their voice and rules from `brand.md`, the keyword and what they send, and the limits.
2. If the brief shows no keyword or no "what they get", ask them. One word people comment (for example REEL), and what they send to people who comment it. They can also type both on the page; it saves them to `caption.json` before any draft exists.
3. Write `<reel>/caption.json` with 3 drafts: `short`, `medium`, `long`. Each has `hook`, `body`, `cta` and `hashtags`. Leave `cta` as `""` to use the keyword line ("Comment REEL and I'll send you ...").
4. `python3 scripts/caption.py check <reel>` and fix every `FIX:` line.
5. Give them the Caption page link. The page shows the drafts by itself once the file is there.

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
