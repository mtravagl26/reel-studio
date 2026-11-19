# Install Reel Studio

> Modified by By Mel Ross from the FavStash install guide (see NOTICE): installs the
> reel editor too, keeps telemetry off and leaves posting services unconnected.

Use this guide when the user asks to set up this pack. Install the reel editor and
the two planning skills (the other eight are extras, added only when the user asks),
prepare the local editing tools and set up the brand file. Reuse what already
works; ask the user only for a needed workspace choice or system permission. This
setup does not authorize publishing, scheduling or uploads, and it does not connect
any posting service.

Repository: [mtravagl26/reel-studio](https://github.com/mtravagl26/reel-studio).

## 1. Locate the workspace and clone the pack

Detect the current agent, operating system and available package manager. Use
the active creator project when one exists; otherwise ask where the user wants
their edits to live (a folder like `~/Movies/Reel Studio` works well; keep it off
cloud-synced folders, since working files are large). Do not use a temporary
directory as the lasting installation. If you only have hosted chat access, hand
these instructions to a local coding agent; do not report local installation as
complete.

In the commands below, substitute real absolute paths for `<workspace>` and
`<pack>`. Run commands separately and inspect failures before continuing.

Use `<workspace>/.favstash-studio/skills-source` as `<pack>` for a new clone:

```bash
git clone https://github.com/mtravagl26/reel-studio.git "<pack>"
```

Create the parent directory first. If this repository is already checked out,
reuse that verified checkout instead. If the destination exists, inspect its
remote and working tree; never overwrite an unrelated folder or discard edits.

## 2. Prepare the local tools

Turn telemetry off for every command in this setup and in later edits:

```bash
export HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1
```

Check Git, Node.js, npm, Python 3, FFmpeg, FFprobe, Google Chrome and yt-dlp
before installing anything. Node must be **22 or newer**. Keep an already-working
installation. On macOS with Homebrew, install only the missing entries from `git`,
`node`, `ffmpeg`, `yt-dlp` (Chrome from google.com/chrome). On Linux or Windows, use
the system's supported packages or the official
[Node.js](https://nodejs.org/en/download), [FFmpeg](https://ffmpeg.org/download.html)
and [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation) installation routes.
Request system elevation only if the chosen installation actually requires it.

Run the pack's setup to install its pinned HyperFrames runtime and GSAP locally:

```bash
node "<pack>/skills/3-editing/edit-video/scripts/init-workspace.mjs" --workspace "<workspace>" --install
```

This prepares `.favstash-studio/runtime/`, a B-roll inbox and optional preferences.
The runtime also provides local transcription (`hyperframes transcribe`), which
downloads a Whisper model on first use.

The reel editor needs the HyperFrames agent skills. Install them with the user's
OK into `<workspace>/.favstash-studio/hyperframes-skills` rather than the folder the
agent auto-loads, so they don't take over requests meant for the editing skills,
and tell the reel editor where they are:

```bash
git clone --depth 1 --branch v0.8.145 https://github.com/heygen-com/hyperframes.git "<workspace>/.favstash-studio/hyperframes-source"
cp -R "<workspace>/.favstash-studio/hyperframes-source/skills" "<workspace>/.favstash-studio/hyperframes-skills"
rm -rf "<workspace>/.favstash-studio/hyperframes-source"
```

The reel editor's doctor finds `<workspace>/.favstash-studio/hyperframes-skills` on
its own, so no shell setup is needed. Only if the skills live somewhere else, set
`HYPERFRAMES_SKILLS_DIR` to a folder holding `hyperframes/` (with its sibling
`hyperframes-*` skills) and, with the user's OK, add the export to their shell profile.
The `rm` drops a 375 MB clone that was only needed for the copy.

The tag matches the renderer the reel editor runs (`hyperframes@0.8.145` in
`scripts/render.sh`), so the skills and the renderer stay the same version. Change
both together.

If the user prefers the simple route, `npx skills add heygen-com/hyperframes` also
works, but it installs the newest skills, which can be ahead of the renderer; the
reel editor finds them in `~/.claude/skills/` or `~/.agents/skills/`.

The `paper-grid` and `breakout-card` styles and the duplicate check also use
Python 3 packages. When the creator wants them, install into a virtual
environment (not system-wide with elevation): `numpy opencv-python` for
breakout-card plates, `pdqhash scipy numpy` for the duplicate check and,
optionally, `playwright` for paper-grid page captures. Skip these when the creator
only needs talking-head reels.

## 3. Install the skills for the current agent

Run the [Agent Skills CLI](https://github.com/vercel-labs/skills) **from the creator
workspace**, using the clone as its source. Choose the actual host identifier
(for example `claude-code`, `codex` or `cursor`).

```bash
npx --yes skills add "<pack>" --agent <agent-id> --skill reel-editor --skill find-ideas --skill write-script --copy --yes
```

Install for this project by default. Verify that the three skills were installed
with their scripts, references and assets (`reel-editor`'s `LICENSE`, `review/`,
`scripts/` and `themes/`).

> Modified by By Mel Ross (0.8.1): the default install is the reel editor and the
> planning skills. Everything a talking-head reel needs is in `reel-editor`,
> including themes, the review and touch-ups pages and the cover.

**Extras, only when the user asks for them.** Say what each one adds and what it
sends off the computer before installing it:

| Extra | Install with | Goes online? |
| --- | --- | --- |
| FavStash editing styles: a second editor for reels that are not one person talking, and five finished looks | `--skill edit-video --skill adaptive-glass --skill paper-grid --skill breakout-card --skill product-motion-ads --skill text-over-footage` | Only when given a reference link (`yt-dlp` downloads it) |
| Named motion effects for `edit-video` | `--skill motion-effects` (needs `edit-video`) | No |
| Publishing: covers, hook variants, scheduling, results | `--skill publish-and-analyze` | Yes: scheduling and results go through FavStash, which the user connects and approves per post |

The extras do not use the reel editor's themes, review page or touch-ups page.
Verify an installed extra the same way (`edit-video`'s SFX, each style's builder,
the breakout card's fonts).

## 4. Set up the brand

Create `~/reels/` (or the folder in `REELS_HOME`). If the user wants to start from
the example brand, copy `<pack>/brand/brand.example.json` to `~/reels/brand.json`,
`<pack>/brand/brand.example.md` to `~/reels/brand.md` and the `.ttf` files in
`<pack>/skills/3-editing/reel-editor/themes/_fonts/` to `~/reels/fonts/`, then change the name, colours, fonts and call to action with
them. Otherwise the reel editor runs its 5-minute brand interview on the first edit.

## 5. Verify local editing

```bash
node "<pack>/skills/3-editing/edit-video/scripts/doctor.mjs" --workspace "<workspace>" --json --strict
bash "<workspace>/.claude/skills/reel-editor/scripts/doctor.sh"
```

Check the reports, not just the exit codes. The FavStash doctor reports Node, npm,
FFmpeg, FFprobe, yt-dlp, HyperFrames and GSAP (`renderReady`, `glassReady`,
`productMotionAdsReady`; `paperGridReady`, `breakoutCardReady` and
`duplicateCheckReady` for the optional Python pieces). The reel editor's check ends
with READY, READY WITH LIMITS (fine: something optional is missing) or MISSING.

A version check alone does not verify rendering. Render a tiny local test
composition in `.favstash-studio/setup-check/` with the installed
`.favstash-studio/runtime/node_modules/.bin/hyperframes`, then probe and decode the
MP4. Keep the smoke test local and free of personal footage.

## 6. Hand off a ready workspace

Report briefly where the skills, workspace and brand file live, the dependency
versions and the smoke-render result. Say plainly that nothing is connected to any
social account and nothing will be posted. Tell them the camera settings for
their phone: upright, 1080p at 30 fps, HDR video off (iPhone: Settings > Camera >
Record Video). Then offer first prompts:

```text
Edit this into a reel. [drag in a talking-head clip]
```

```text
Use $write-script to turn this idea into a few hooks and a script I can film.
```

Keep setup separate from creative approval. Do not publish, schedule, upload
creator media or modify remote content during installation.
