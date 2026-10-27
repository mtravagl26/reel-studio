# Reel Studio

> Modified by By Mel Ross from the FavStash creator skills agent contract (see NOTICE).

Eleven skills: the ten FavStash creator skills in four stages of the short-form
loop, plus `reel-editor` for talking-head reels. For a user-requested
installation, follow [INSTALL_FOR_AGENTS.md](INSTALL_FOR_AGENTS.md). Which skill to
use when: [skills/README.md](skills/README.md).

| Stage | Skill | Use it to |
| --- | --- | --- |
| 1 · Research | [find-ideas](skills/1-research/find-ideas/SKILL.md) | Find proven references and choose the next idea |
| 2 · Script | [write-script](skills/2-scripting/write-script/SKILL.md) | Write one or more hooks to test, one shared body and the editor brief |
| 3 · Edit, talking head | [reel-editor](skills/3-editing/reel-editor/SKILL.md) | A raw talking-head clip to a finished reel in the creator's brand file, with a cover and a phone-size copy |
| 3 · Edit | [edit-video](skills/3-editing/edit-video/SKILL.md) | Cut, caption, sound, motion graphics, safe areas and review: the base for every edit |
| 3 · Edit, style | [adaptive-glass](skills/3-editing-styles/adaptive-glass/SKILL.md), [paper-grid](skills/3-editing-styles/paper-grid/SKILL.md), [breakout-card](skills/3-editing-styles/breakout-card/SKILL.md), [product-motion-ads](skills/3-editing-styles/product-motion-ads/SKILL.md), [text-over-footage](skills/3-editing-styles/text-over-footage/SKILL.md) | Add exactly one finished look on top of `edit-video` |
| 3 · Edit, effects | [motion-effects](skills/3-editing-styles/motion-effects/SKILL.md) | Add named motion effects (kinetic hook, gravity drop, orbit, vertigo, rewind and 28 more) to any edit |
| 4 · Publish & learn | [publish-and-analyze](skills/4-publish-and-learn/publish-and-analyze/SKILL.md) | Export, cover, variants, scheduling after approval and results |

Each skill installs as its own folder, so it must work alone: keep its helpers,
assets and links inside its own folder and name other skills instead of linking
into them. Styles carry only their look and its builder; everything shared belongs
in `edit-video`. FavStash tools describe their own parameters; don't copy API
details into the skills.

Run `npm test`, `npm run validate` and `git diff --check` after changes.

Keep creator footage, credentials, renders and private research out of Git.
Preserve existing edit folders and source media. Publishing requires approval
for the exact export, caption, destination and time; editing alone does not
authorize it.

## House rules (By Mel Ross)

- **Local only.** Never publish, upload, schedule or post on the creator's behalf.
  Delivery means files in a folder. FavStash is not connected by this pack; if the
  creator connects it themselves, publishing still needs their approval of the exact
  post.
- **Telemetry off.** Run renders and transcription with `HYPERFRAMES_NO_TELEMETRY=1`
  and `DO_NOT_TRACK=1` unless the creator opts in.
- **Every reel ships with a cover and a phone copy**: a 1080x1920 JPG from a smiling
  still at the start or end with a short topic title in the safe area, and a small
  H.264 copy (CRF 26, AAC 128k, fast-start) beside the full-quality file. Put the
  finished files back in the folder the footage came from when the brand file says
  `"deliver_dir": "footage"`.
- **Zooms are gentle by default**: eased in and out, never a hard punch, unless the
  brand file asks for punchy.
- The brand lives in `~/reels/brand.json` + `brand.md`; `brand/` holds the editable
  example. The brand file wins over any default in a skill.
- `reel-editor` keeps its MIT `LICENSE` beside it; keep that file with the skill.
