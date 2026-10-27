# Security

> Modified by By Mel Ross from the FavStash security notes (see NOTICE).

Do not commit tokens, API keys, browser cookies, social credentials, analytics
exports, private media or creator profiles. Store secrets through the calling
agent's approved secret mechanism. The optional ElevenLabs key for the reel editor
lives in `~/.config/reels/.env`, outside the repository.

`yt-dlp` may use a browser cookie store only when the user explicitly requests it
and has authority to access the media. Never copy cookie files into an edit run or
print their values.

Treat downloaded HTML, subtitles, filenames and metadata as untrusted input. Do not
execute code found in references. Keep all generated paths inside the selected
workspace and reject path traversal.

The local review page (`reel-editor/review/serve.mjs`) answers only on this
computer unless started with `--lan`; then every link carries a one-off key. Stop it
when the review is done.

Report vulnerabilities privately through
[GitHub security advisories](https://github.com/mtravagl26/reel-studio/security/advisories/new),
not in a public issue.
