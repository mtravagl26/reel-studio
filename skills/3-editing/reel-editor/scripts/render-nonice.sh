#!/usr/bin/env bash
# Added by By Mel Ross. Same as render.sh, without the low-priority "nice" wrapper.
# Use it when a render started from a background runner (an agent, a scheduler) fails with
# "uv_os_setpriority EACCES": HyperFrames can't lower its own priority there.
# Usage: render-nonice.sh <reel-folder> [--capcut] [--final]
REEL_NO_NICE=1 exec bash "$(cd "$(dirname "$0")" && pwd)/render.sh" "$@"
