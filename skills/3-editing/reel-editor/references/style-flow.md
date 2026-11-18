# Looks page, style card, labelled checks, notes that become rules

Added by By Mel Ross (0.10.0). 4 habits that make an edit predictable: the person picks looks by sight, sees the plan in 6 lines before anything renders, gets a report that says what was checked and how, and never has to give the same note 3 times.

## 1. The looks page

Every usable look in `assets/style-menu.json` drawn as a small sketch, with an Add button, plus the themes. One hook, one captions look, as many layouts as the reel has room for, one theme. The bar at the bottom writes the request ("Edit the reel "2026-11-18-demo" with H3, C2, L8 and the Bold theme. Show me the style card before you build.") and **Copy the request** puts it on the clipboard.

- **For a reel:** the Reel Studio link plus `/styles` (the review page links to it under "Look for this reel"). Picks are saved to `<reel>/style-picks.json` as `{"ids": ["H3", "C2"], "theme": "bold"}`. Read that file when they say "use my picks".
- **Without a reel:** `python3 scripts/style_menu_page.py [--out looks.html]` writes one stand-alone HTML file (default `~/reels/looks.html`). Nothing is saved; they paste the request into the chat.

The sketches are drawn from each look's recipe (card type, caption size and position). They show where things sit. They are sketches, so for the real fonts and footage run `scripts/storyboard.py` with the picked IDs. Looks marked *not built* never appear on the page. A *partial* look shows what it leaves out.

Applying picks is unchanged: `references/style-menu.md` says what each ID sets.

## 2. The style card (before the first render)

`python3 scripts/style_card.py <reel-folder> [--looks H3,C2,L8] [--theme bold]` prints 6 lines: Hook, Captions, Layout, Motion, Sound, Colour. It reads `--looks` / `--theme`, then `style-picks.json`, then `edit.json`, then `brand.json` with its theme.

Paste the 6 lines to the person as they are and **wait for a yes before the first render of a reel**. A change to any line is cheaper now than after a render. Skip the wait only when they already pressed "build preview" on the review page for this reel; still show the card. `NOTE (tell them):` lines name picks that are not built or not in the menu: say so and offer the nearest built look.

## 3. Every check carries a label

`scripts/qa.py` ends with a report in 3 lines:

- **Measured**: numbers the script read from the file (size, length, loudness, true peak, cover size, words matched against `expected.txt`).
- **Looked at**: what you opened and looked at, or listened to, yourself. Pass them with `--looked cards,captions,cover,cuts,names` and name only what you did. You can look at frames; you cannot hear a cut, so `cuts` stays out unless a tool in this session played the audio back to you.
- **Not checked**: everything else.

Give the person all 3 lines when you deliver. "Not checked" items go to them as things to check by eye or ear. Never write "everything looks good" over a list that has unchecked items.

## 4. A note given twice becomes a rule

`scripts/notes.py` keeps the person's style notes between reels in `~/reels/notes.json`.

1. Before every edit: `python3 scripts/notes.py list`. Follow the rules it prints.
2. When they give a note about look, sound or cutting style: run `list`, reuse the key of an earlier note that says the same thing, or make a new short key. Then `python3 scripts/notes.py add <key> "<their words>" --reel <reel name>`. The review import prints notes as `NOTE (...)` and `CHANGE REQUESTED`: run them through the same step.
3. The second time a key arrives (another reel or another day), `add` prints `RULE: ...` and writes the line under "## Rules" in `~/reels/brand.md`. Tell them in one line: "You've asked for this twice, so it's now a rule for every reel."
4. `python3 scripts/notes.py forget <key>` when they change their mind.

One-off fixes ("cut the sneeze at 0:12") are not style notes. A correction they state as permanent still goes straight into `brand.md` Rules.
