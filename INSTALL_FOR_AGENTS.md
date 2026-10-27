# Install Reel Studio

> Modified by By Mel Ross from the FavStash install guide (see NOTICE): installs the
> reel editor too, keeps telemetry off and leaves posting services unconnected.

Use this guide when the user asks to set up this pack. Install the eleven skills,
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
git clone --depth 1 https://github.com/heygen-com/hyperframes.git "<workspace>/.favstash-studio/hyperframes-source"
cp -R "<workspace>/.favstash-studio/hyperframes-source/skills" "<workspace>/.favstash-studio/hyperframes-skills"
export HYPERFRAMES_SKILLS_DIR="<workspace>/.favstash-studio/hyperframes-skills"
```

`HYPERFRAMES_SKILLS_DIR` should hold a `hyperframes/` folder (with its sibling
`hyperframes-*` skills); add the export to the user's shell profile with their OK.

If the user prefers the simple route, `npx skills add heygen-com/hyperframes` also
works; the reel editor finds them in `~/.claude/skills/` or `~/.agents/skills/`.

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
npx --yes skills add "<pack>" --agent <agent-id> --skill reel-editor --skill find-ideas --skill write-script --skill edit-video --skill adaptive-glass --skill paper-grid --skill breakout-card --skill motion-effects --skill product-motion-ads --skill text-over-footage --skill publish-and-analyze --copy --yes
```

Install for this project by default. Verify that all eleven skills were installed
with their scripts, references and assets (`reel-editor`'s `LICENSE`, `review/` and
`scripts/`, `edit-video`'s SFX, each style's builder, the breakout card's fonts).

## 4. Set up the brand

Create `~/reels/` (or the folder in `REELS_HOME`). If the user wants to start from
the example brand, copy `<pack>/brand/brand.example.json` to `~/reels/brand.json`,
`<pack>/brand/brand.example.md` to `~/reels/brand.md` and `<pack>/brand/fonts/*.ttf`
to `~/reels/fonts/`, then change the name, colours, fonts and call to action with
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
social account and nothing will be posted. Then offer first prompts:

```text
Edit this into a reel. [drag in a talking-head clip]
```

```text
Use $write-script to turn this idea into a few hooks and a script I can film.
```

Keep setup separate from creative approval. Do not publish, schedule, upload
creator media or modify remote content during installation.
