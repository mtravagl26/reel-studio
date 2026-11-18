# Which skill to use when

Eleven skills, one folder. Setup installs 3 of them: the reel editor and the two planning skills. The other 8 are extras you ask Claude to add. Claude picks the right one from what you ask, but here's the map.

| You want to... | Use | Where |
|---|---|---|
| **Turn a talking-head clip into a finished reel in your brand** (captions, gentle zooms, hook title, cover, phone copy) | `reel-editor` | [3-editing/reel-editor](3-editing/reel-editor/SKILL.md) |
| Edit from a brief, several takes or a reference, or build a reel that isn't one person talking to camera | `edit-video` | [3-editing/edit-video](3-editing/edit-video/SKILL.md) |
| Add one finished look on top of `edit-video` | `adaptive-glass`, `paper-grid`, `breakout-card`, `product-motion-ads`, `text-over-footage` | [3-editing-styles/](3-editing-styles) |
| Add named motion effects (kinetic hook, gravity drop, orbit, vertigo and more) | `motion-effects` | [3-editing-styles/motion-effects](3-editing-styles/motion-effects/SKILL.md) |
| Find proven ideas to make next | `find-ideas` | [1-research/find-ideas](1-research/find-ideas/SKILL.md) |
| Write hooks and a script to film | `write-script` | [2-scripting/write-script](2-scripting/write-script/SKILL.md) |
| Plan covers and hook variants, or review how posts did | `publish-and-analyze` | [4-publish-and-learn/publish-and-analyze](4-publish-and-learn/publish-and-analyze/SKILL.md) |

## The short version

- **Talking-head reel** (you, a phone, one take or a few): `reel-editor`. It reads your brand file, lets you review the cut, renders, then delivers the reel, a phone-size copy and a cover.
- **Scripts and ideas**: `write-script` before you film, `find-ideas` when you don't know what to film. Both are installed with the reel editor.
- **Extras** (ask Claude to add them): the FavStash editing styles and `motion-effects` for reels that are not one person talking, and `publish-and-analyze` for scheduling. They are a separate editor: they don't use the reel editor's themes, review page or touch-ups page.
- **Both together**: write with `write-script`, film, edit with `reel-editor`, and borrow a named effect from `motion-effects` for one moment if you want it.

## House rules for every skill

- Editing runs on your computer. Nothing is posted or scheduled unless you add the publishing extra, connect a posting service yourself and approve the exact post. Giving Claude a link to someone else's reel downloads that video to your computer.
- Telemetry is off: set `HYPERFRAMES_NO_TELEMETRY=1` and `DO_NOT_TRACK=1` before running any FavStash render (the reel editor sets them itself).
- Your original footage is never edited; each reel works on a copy.
