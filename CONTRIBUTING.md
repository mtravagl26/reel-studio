# Contributing

> Modified by By Mel Ross from the FavStash contributing guide (see NOTICE).

This is By Mel Ross's working copy of two open-source projects. Fixes that belong
upstream are better sent there:
[FavStash creator skills](https://github.com/alisadiq-ai/favstash-ai-video-editing-skills)
and [Claude Reel Editor](https://github.com/nicolapocock/claude-reel-editor).

- **Every skill works when installed alone.** Keep helpers, assets and Markdown
  links inside the skill's folder; refer to other skills by name.
- **Keep the licenses with the code.** `skills/3-editing/reel-editor/LICENSE` (MIT)
  stays beside that skill. Mark files you change with a short "Modified by" note
  and add the change to `NOTICE`.
- **Nothing private.** No footage, renders, transcripts, credentials, `.env` files,
  personal paths or emails. Only fonts and sounds whose licenses allow
  redistribution, with the license text beside them.
- **Local only.** No change may upload, post or schedule without the creator's
  explicit approval, or turn telemetry on by default.

```bash
npm test
npm run validate
git diff --check
```
