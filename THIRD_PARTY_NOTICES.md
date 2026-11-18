# Third-party notices

> Modified by By Mel Ross (see NOTICE): adds the reel editor's pieces and the brand fonts; the FavStash preview images are not included here.

This repository provides instructions and media helpers. Apart from the Montserrat, Lora, Inter, Caveat, Anton, Fredoka and Pacifico fonts, it does not vendor the projects below; setup or the creator installs them.

| Project | Role | License note |
| --- | --- | --- |
| [HyperFrames](https://github.com/heygen-com/hyperframes) | Optional HTML-to-video renderer and local transcription | Apache-2.0 upstream at time of integration; verify the installed release |
| [GSAP](https://gsap.com/) | Animation runtime copied into generated style compositions | GSAP Standard "no charge" license; installed from npm by setup, not redistributed here |
| [FFmpeg](https://ffmpeg.org/) | Media probing, extraction, encoding, and QC | LGPL/GPL configuration varies by build; review the binary you install |
| [GIPHY API](https://developers.giphy.com/) | Optional GIF and sticker search on the touch-ups page, with the person's own API key | GIPHY's API terms apply to whoever holds the key; nothing from GIPHY is bundled here. Files a person adds stay in their reel folder |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | User-authorized reference download and metadata | Unlicense upstream at time of integration; platform terms and media rights remain separate |
| [FavStash CLI](https://www.npmjs.com/package/@sketric/favstash-mcp) | Optional sign-in, MCP bridge and local uploads for FavStash | MIT on npm at time of integration; the FavStash service has its own terms |
| [Montserrat](https://github.com/JulietaUla/Montserrat) | Caption and graphics font **bundled** in `skills/3-editing-styles/breakout-card/assets/fonts/` | SIL Open Font License 1.1; the license text ships beside the fonts |
| [Claude Reel Editor](https://github.com/nicolapocock/claude-reel-editor) | The `reel-editor` skill, **included with changes** in `skills/3-editing/reel-editor/` | MIT; the license text ships beside the skill |
| [Lora](https://github.com/cyrealtype/Lora-Cyrillic) | Example brand head font and theme font **bundled** in `skills/3-editing/reel-editor/themes/_fonts/` | SIL Open Font License 1.1, Reserved Font Name "Lora"; `skills/3-editing/reel-editor/themes/_fonts/OFL-Lora.txt` |
| [Inter](https://github.com/rsms/inter) | Example brand body font and theme font **bundled** in `skills/3-editing/reel-editor/themes/_fonts/` | SIL Open Font License 1.1; `skills/3-editing/reel-editor/themes/_fonts/OFL-Inter.txt` |
| [Caveat](https://github.com/googlefonts/caveat) | Handwriting font for the Style Menu cards (`polaroids`, `xlist`, `tiles`, `popup` captions, title overlines) **bundled** in `skills/3-editing/reel-editor/assets/fonts/` (Latin subset of the Bold weight, WOFF2, as served by Google Fonts) | SIL Open Font License 1.1, Copyright 2014 The Caveat Project Authors; no Reserved Font Name; `skills/3-editing/reel-editor/assets/fonts/OFL-Caveat.txt` |
| [Anton](https://github.com/googlefonts/AntonFont) | Head font of the Bold and Handwritten themes **bundled** in `skills/3-editing/reel-editor/themes/_fonts/` (from google/fonts) | SIL Open Font License 1.1; `skills/3-editing/reel-editor/themes/_fonts/OFL-Anton.txt` |
| [Fredoka](https://github.com/hafontia/Fredoka-One) | Head and body font of the Whimsical theme **bundled** in `skills/3-editing/reel-editor/themes/_fonts/` (variable font, from google/fonts) | SIL Open Font License 1.1; `skills/3-editing/reel-editor/themes/_fonts/OFL-Fredoka.txt` |
| [Pacifico](https://github.com/googlefonts/Pacifico) | Accent font of the Whimsical theme **bundled** in `skills/3-editing/reel-editor/themes/_fonts/` (from google/fonts) | SIL Open Font License 1.1; `skills/3-editing/reel-editor/themes/_fonts/OFL-Pacifico.txt` |
| [ElevenLabs Scribe](https://elevenlabs.io/) | Optional transcription in `reel-editor`, only when the creator adds their own API key; otherwise local Whisper | A paid service with its own terms; audio is sent to it only when a key is set |
| [PDQ](https://github.com/facebook/ThreatExchange/tree/main/pdq) via `pdqhash` | Frame hashing for the optional duplicate check | BSD-style upstream license; installed with pip, verify the installed package |
| [NumPy](https://numpy.org/), [SciPy](https://scipy.org/), [OpenCV](https://opencv.org/) | Optional duplicate check and breakout-card plates | BSD / Apache-2.0 upstream; installed with pip |
| [Playwright](https://playwright.dev/python/) | Optional page captures and layout snapshots for paper-grid | Apache-2.0; installed with pip, uses the local Chrome |
| Apple Vision | Built-in person matte for breakout-card on macOS | Part of macOS; not distributed here |
| Apple Vision (`VNGeneratePersonSegmentationRequest`) via the Swift compiler | Person matte for `reel-editor`'s `cutout.py` (graphics behind the speaker, background softening); `cutout_matte.swift` is original code that makes the same Vision calls as FavStash's `person-matte.swift` (breakout-card), written separately from Apple's documentation | Part of macOS and Xcode Command Line Tools (Apple's terms); not distributed here. macOS only; elsewhere layers fall back to plain overlays |
| `avconvert` (macOS command-line media converter) | HDR to SDR conversion of iPhone clips for `reel-editor` (`hdr2sdr.py`) | Part of macOS (Apple's terms); not distributed here. macOS only; elsewhere an HDR clip is used as it is and the build says the colour is only approximate |
| [libvpx](https://www.webmproject.org/) (VP9 encoder inside your ffmpeg build) | Transparent speaker layer (`cutout/person.webm`) | BSD-3-Clause; comes with the ffmpeg you install, not distributed here. Optional: without it graphics stay in front |
| Python 3 standard library | The new scripts (`make_sfx.py`, `mix_audio.py`, `cutout.py`, `enhance.py`, `make_music_bed.py`) use only this | PSF License; installed on your computer, not distributed here |
| Reel Studio sound-effects library (34 generated effects) | `reel-editor` effects, written by `scripts/make_sfx.py` into `engine/sfx/` on setup | Original synthesis by By Mel Ross, Apache-2.0; `assets/sfx-manifest.json` lists the source and license of every one of the 40 effects. The six original effects are generated by `setup_engine.sh` (MIT, Claude Reel Editor) |
| Music bed from `make_music_bed.py` | Optional music bed generated on your computer | Original synthesis by By Mel Ross, Apache-2.0. No music is bundled; if you use your own music you need the rights to it |

The adaptive glass CSS is an original implementation informed by the optical-layer model in [liquid-glass-css](https://github.com/turtiesocks/agent-skills/tree/main/liquid-glass-css); no code from it is included.

Every WAV in this repository is original synthesis covered by Apache-2.0. Version 0.9.0 (By Mel Ross) replaced the 7 recordings the FavStash pack had marked "curated" (supplied from a personal sound library, not covered by the code license) with new sounds of the same names, written by `scripts/make_curated_sfx.py`.

The `product-motion-ads` method is informed by [brag](https://github.com/latent-spaces/brag) (MIT); no text or code from it is included.

The upstream FavStash repository also ships style preview images; they are not included here.

Version 0.2.0 (By Mel Ross) adds the Apple Vision, libvpx, Python, sound-effects and music-bed rows above. No third-party code, model or asset was added to the repository for it.

Version 0.2.2 (By Mel Ross) adds the `avconvert` row above. `avconvert` is part of macOS and nothing was added to the repository for it.

Version 0.5.0 (By Mel Ross) adds the Caveat row above (a font, license text beside it). Nothing else third-party was added to the repository for it; the Style Menu, storyboard, word list and crossfade use only the Python standard library, ffmpeg and HyperFrames, as before.

Version 0.8.0 (By Mel Ross) adds the Anton, Fredoka and Pacifico rows above for the themes. Version 0.8.1 keeps Lora and Inter in one place only, `skills/3-editing/reel-editor/themes/_fonts/`, for both the example brand and the themes.
