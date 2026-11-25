#!/usr/bin/env python3
"""Added by By Mel Ross (0.10.0). Notes the person gives about their reels, kept between reels. The same note twice becomes a rule.

Usage:
  python3 notes.py list                                 the rules, then the notes heard once (with their keys)
  python3 notes.py add <key> "<the note, in their words>" [--reel <name>]
  python3 notes.py forget <key>                         they changed their mind: drops the note and its rule

How to use it. Run `list` before every edit and follow the rules. When the person gives a note about how a reel looks,
sounds or is cut ("captions a bit smaller", "too many zooms"), run `list` first: if an earlier note says the same thing,
reuse ITS key, else make a short new key (lower-case words joined by dashes: captions-smaller). `add` stores the note.
The second time a key comes in, from a different reel or a different day, the note becomes a rule: it is written under
"## Rules" in ~/reels/brand.md and `add` prints `RULE: ...`. Tell the person, in one line, that it is now a rule.

A note that is plainly one-off ("cut the sneeze at 0:12") is not a style note: don't add it.
A correction they state as permanent ("never outline captions") goes straight into brand.md Rules, as SKILL.md says.

Stored in ~/reels/notes.json (REELS_HOME is honoured): {"notes": {key: [{"text", "reel", "day"}]}, "rules": {key: text}}
"""

import argparse, datetime, json, os, re, sys
from pathlib import Path

KEY_OK = re.compile(r"^[a-z0-9]+(-[a-z0-9]+){0,7}$")


def home():
    return Path(os.environ.get("REELS_HOME", "~/reels")).expanduser()


def load(h):
    f = h / "notes.json"
    try:
        d = json.load(open(f))
    except OSError:
        d = {}
    # audit 3: a damaged file used to be read as empty and then overwritten. Keep it, and say so.
    except ValueError:
        keep = h / f"notes.broken-{datetime.datetime.now():%Y%m%d-%H%M%S}.json"
        f.replace(keep)
        print(
            f"NOTE (tell them): notes.json could not be read and was set aside as {keep.name}. Starting a fresh notes file; the rules already in brand.md are untouched."
        )
        d = {}
    if not isinstance(d, dict):
        d = {}
    notes = d.get("notes") if isinstance(d.get("notes"), dict) else {}
    return {
        "notes": {k: v for k, v in notes.items() if isinstance(v, list)},
        "rules": d.get("rules") if isinstance(d.get("rules"), dict) else {},
    }


def save(h, d):
    h.mkdir(parents=True, exist_ok=True)
    tmp = h / "notes.json.tmp"
    tmp.write_text(json.dumps(d, indent=1, ensure_ascii=False) + "\n")
    tmp.replace(h / "notes.json")


# the note's own text can't open or close the marker
def _rule_line(key, text):
    return f"- {text.replace('<!--', '').replace('-->', '').strip()} <!-- note: {key} -->"


def write_rule(h, key, text):
    """Add (or replace) this key's line under "## Rules" in brand.md. The marker comment is how forget() finds it again."""
    p = h / "brand.md"
    s = p.read_text() if p.exists() else ""
    lines = [l for l in s.splitlines() if f"<!-- note: {key} -->" not in l]
    at = next((i for i, l in enumerate(lines) if re.match(r"^#{1,3}\s+Rules\s*$", l.strip(), re.I)), None)
    if at is None:
        lines += ([""] if lines and lines[-1].strip() else []) + ["## Rules"]
        at = len(lines) - 1
    end = next((i for i in range(at + 1, len(lines)) if lines[i].startswith("#")), len(lines))
    while end > at + 1 and not lines[end - 1].strip():
        end -= 1
    if end == at + 1:
        lines.insert(end, "")
        end += 1  # first rule: a blank line under the heading
    lines.insert(end, _rule_line(key, text))
    if end + 1 < len(lines) and lines[end + 1].strip():
        lines.insert(end + 1, "")
    p.write_text("\n".join(lines) + "\n")


def drop_rule(h, key):
    p = h / "brand.md"
    if p.exists():
        p.write_text("\n".join(l for l in p.read_text().splitlines() if f"<!-- note: {key} -->" not in l) + "\n")


def add(h, key, text, reel=None, day=None):
    """Returns ("rule" | "note" | "same", message)."""
    text = " ".join(str(text).split())
    if not KEY_OK.match(key):
        raise SystemExit("key: lower-case words joined by dashes, e.g. captions-smaller")
    if not text:
        raise SystemExit("the note is empty")
    d = load(h)
    day = day or datetime.date.today().isoformat()
    said = d["notes"].setdefault(key, [])
    # the same note again in one sitting is one note
    if any(n.get("reel") == reel and n.get("day") == day for n in said):
        return "same", f"already noted today{' for ' + reel if reel else ''}: {key}"
    said.append({"text": text, "reel": reel, "day": day})
    if len(said) >= 2:
        fresh = key not in d["rules"]
        d["rules"][key] = text
        save(h, d)
        write_rule(h, key, text)
        return "rule", (
            f"RULE: {text}  (said {len(said)} times; written to brand.md Rules)" if fresh else f"RULE updated: {text}"
        )
    save(h, d)
    return "note", f"noted once: {key}. If it comes up again it becomes a rule."


def forget(h, key):
    d = load(h)
    had = key in d["notes"] or key in d["rules"]
    d["notes"].pop(key, None)
    d["rules"].pop(key, None)
    save(h, d)
    drop_rule(h, key)
    return f"forgot {key}" if had else f"nothing stored under {key}"


def listing(h):
    d = load(h)
    out = ["RULES (follow these on every reel):"] + ([f"  {k}: {t}" for k, t in d["rules"].items()] or ["  none yet"])
    once = {k: v for k, v in d["notes"].items() if k not in d["rules"]}
    out += ["HEARD ONCE (reuse the key if it comes up again):"] + (
        [f"  {k}: {v[-1]['text']}" for k, v in once.items()] or ["  none"]
    )
    return "\n".join(out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    a = sub.add_parser("add")
    a.add_argument("key")
    a.add_argument("text")
    a.add_argument("--reel")
    f = sub.add_parser("forget")
    f.add_argument("key")
    args = ap.parse_args()
    if args.cmd == "list":
        print(listing(home()))
    elif args.cmd == "add":
        print(add(home(), args.key, args.text, args.reel)[1])
    else:
        print(forget(home(), args.key))
