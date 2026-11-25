#!/usr/bin/env python3
"""Added by By Mel Ross (0.20.0). The caption step: the post caption that goes under a reel on Instagram.

Step 4 of Reel Studio, after the cover. You (Claude) write 3 drafts; the person picks one and edits it on the Caption page.

  caption.py brief <reel>          what to write from: the words of the reel, the voice rules, the shape and the limits
  caption.py check <reel>          checks <reel>/caption.json against the limits; exit 1 with the reasons when it fails
  caption.py text  <reel> [id]     prints one draft as it would be posted (default: the chosen one, else "medium")

<reel>/caption.json:
  {"platform": "instagram", "tone": "mine", "emoji": 0, "ask": "keyword", "keyword": "REEL", "gift": "the link to the editor", "more": "",
   "written": {"tone": "mine", "emoji": 0},
   "drafts": [{"id": "short",  "hook": "...", "body": "...", "cta": "...", "hashtags": ["#one", "#two", "#three"]},
              {"id": "medium", ...}, {"id": "long", ...}],
   "chosen": null}

Limits (Instagram, checked November 2026): a caption holds 2,200 characters; about the first 125 show before "more", so the hook
has to fit there; a post takes at most 5 hashtags.
"""

import json, re, sys
from pathlib import Path

LIMITS = {
    "total": 2200,
    "hook": 125,
    "hashtags_max": 5,
    "hashtags_min": 3,
    "body": {"short": (0, 220), "medium": (180, 650), "long": (500, 1500)},
}
IDS = ("short", "medium", "long")
# The style of the writing, picked on the Caption page. brand.md's rules still win over every one of these.
TONES = {
    "mine": "their usual voice, exactly as brand.md describes it",
    "funny": "funny: one real joke or a silly image per caption; the point still lands",
    "witty": "witty: dry, clever turns of phrase; a smile, not a punchline",
    "sarcastic": "sarcastic: aimed at the situation or the bad habit, never at the reader or a person",
    "warm": "warm: friendly and encouraging, like a note to a friend who asked",
    "bold": "bold: short, direct statements; takes a clear position",
    "serious": "serious: plain and calm; no jokes",
    "corporate": "corporate: polished and professional, the way it would read on a company page; still plain words",
}
# How many emojis in one caption, by level. 0 = none.
EMOJI = {0: (0, 0), 1: (1, 2), 2: (3, 5), 3: (6, 10)}
EMOJI_NAME = {0: "none", 1: "a few (1 or 2)", 2: "some (3 to 5)", 3: "lots (6 to 10)"}
ASKS = ("keyword", "follow", "save", "share", "none")
_EMOJI_RE = re.compile(
    "[\U0001f000-\U0001faff\u2600-\u27bf\u2b00-\u2bff\u2190-\u21ff\u2300-\u23ff\U0001f1e6-\U0001f1ff]"
)


def emoji_count(text):
    return len(_EMOJI_RE.findall(text or ""))


def emoji_level(d):
    try:
        n = int(d.get("emoji", 0))
    except (TypeError, ValueError):
        n = 0
    return n if n in EMOJI else 0


def load(reel):
    f = Path(reel) / "caption.json"
    if not f.exists():
        return None
    try:
        d = json.load(open(f))
    except ValueError:
        return None
    return d if isinstance(d, dict) else None


def cta_line(d, draft):
    """The call to action as posted. A draft's own "cta" wins; otherwise it is built from the keyword and what they get."""
    own = str(draft.get("cta") or "").strip()
    if own:
        return own
    ask = d.get("ask") if d.get("ask") in ASKS else "keyword"
    kw, gift = str(d.get("keyword") or "").strip().upper(), str(d.get("gift") or "").strip()
    more = str(d.get("more") or "").strip()
    if ask == "none":
        return ""
    if ask == "follow":
        return f"Follow for more {more}." if more else "Follow for more."
    if ask == "save":
        return "Save this so you can find it later."
    if ask == "share":
        return "Send this to someone who needs it."
    if kw and gift:
        return f"Comment {kw} and I'll send you {gift}."
    if kw:
        return f"Comment {kw} and I'll send it to you."
    return ""


def tags_of(draft):
    out = []
    for t in draft.get("hashtags") or []:
        t = "#" + re.sub(r"[^\w]", "", str(t), flags=re.UNICODE)
        if len(t) > 1 and t.lower() not in [x.lower() for x in out]:
            out.append(t)
    return out


def text_of(d, draft):
    parts = [
        str(draft.get("hook") or "").strip(),
        str(draft.get("body") or "").strip(),
        cta_line(d, draft),
        " ".join(tags_of(draft)),
    ]
    return "\n\n".join(p for p in parts if p)


def problems(d):
    out = []
    if not d:
        return ["there is no caption.json yet, or it can't be read"]
    drafts = {x.get("id"): x for x in d.get("drafts") or [] if isinstance(x, dict)}
    for i in IDS:
        x = drafts.get(i)
        if not x:
            out.append(f"{i}: this draft is missing")
            continue
        hook, body, tags = str(x.get("hook") or "").strip(), str(x.get("body") or "").strip(), tags_of(x)
        if not hook:
            out.append(f"{i}: no hook line")
        elif len(hook) > LIMITS["hook"]:
            out.append(
                f"{i}: the hook is {len(hook)} characters; Instagram shows about {LIMITS['hook']} before \"more\""
            )
        if "\n" in hook:
            out.append(f"{i}: the hook is one line")
        lo, hi = LIMITS["body"][i]
        if not (lo <= len(body) <= hi):
            out.append(f"{i}: the body is {len(body)} characters; a {i} one is {lo} to {hi}")
        if not cta_line(d, x) and d.get("ask") != "none":
            out.append(f"{i}: no call to action (set a keyword, or write the line)")
        lo_e, hi_e = EMOJI[emoji_level(d)]
        n_e = emoji_count(text_of(d, x))
        if i == "short" and lo_e:
            lo_e = 1
        if not (lo_e <= n_e <= hi_e):
            out.append(f"{i}: {n_e} emojis; they asked for {EMOJI_NAME[emoji_level(d)]}")
        if not (LIMITS["hashtags_min"] <= len(tags) <= LIMITS["hashtags_max"]):
            out.append(
                f"{i}: {len(tags)} hashtags; use {LIMITS['hashtags_min']} to {LIMITS['hashtags_max']} (Instagram allows {LIMITS['hashtags_max']} at most)"
            )
        if "#" in hook + body:
            out.append(f"{i}: hashtags go in the hashtags list, not in the hook or the body")
        if len(text_of(d, x)) > LIMITS["total"]:
            out.append(f"{i}: {len(text_of(d, x))} characters in all; Instagram holds {LIMITS['total']}")
    kw = str(d.get("keyword") or "").strip()
    if kw and not re.fullmatch(r"[A-Za-z0-9]{2,20}", kw):
        out.append("the keyword is one word of letters or numbers, 2 to 20 long")
    hooks = [str(drafts[i].get("hook") or "").strip().lower() for i in IDS if i in drafts]
    if len(hooks) == 3 and len(set(hooks)) < 3:
        out.append("give each draft its own hook line: 2 of them are the same")
    return out


def spoken(reel):
    try:
        caps = json.load(open(Path(reel) / "edit.json")).get("captions") or []
    except (OSError, ValueError):
        caps = []
    return " ".join(w.get("text", "") for c in caps for w in c.get("words", [])).strip()


def brief(reel):
    reel = Path(reel)
    home = reel.parent
    said = spoken(reel)
    rules = ""
    try:
        md = (home / "brand.md").read_text()
        m = re.search(r"^## Rules\s*\n(.*?)(?=^## |\Z)", md, re.S | re.M)
        voice = re.search(r"^## (Voice|How I write|Writing)[^\n]*\n(.*?)(?=^## |\Z)", md, re.S | re.M | re.I)
        rules = "\n".join(
            x.strip() for x in ((voice.group(2) if voice else ""), (m.group(1) if m else "")) if x.strip()
        )
    except OSError:
        pass
    d = load(reel) or {}
    print(f"CAPTION BRIEF for {reel.name}\n")
    print(
        "WHAT THE REEL SAYS (from the captions):\n"
        + (said or "(no captions yet: build the reel first, or ask what the reel is about)")
        + "\n"
    )
    print(
        "THEIR VOICE AND RULES (brand.md):\n"
        + (rules or "(none written down: ask how they want to sound before you write)")
        + "\n"
    )
    ask = d.get("ask") if d.get("ask") in ASKS else "keyword"
    tone = d.get("tone") if d.get("tone") in TONES else "mine"
    print(f"STYLE THEY PICKED: {TONES[tone]}.")
    print(
        f"EMOJIS: {EMOJI_NAME[emoji_level(d)]} in each caption."
        + (
            " Put them where they add something; never a row of them, never one in the hook's first 3 words."
            if emoji_level(d)
            else " None anywhere, hashtags included."
        )
        + "\n"
    )
    if ask == "keyword":
        print(
            f"THE ASK: comment a keyword. KEYWORD: {d.get('keyword') or '(ask them: one word people comment)'}    WHAT THEY GET: {d.get('gift') or '(ask them what you send to people who comment)'}\n"
        )
    else:
        print(
            "THE ASK: "
            + {
                "follow": "follow for more" + (f" {d.get('more')}" if d.get("more") else ""),
                "save": "save it",
                "share": "send it to someone",
                "none": "no ask: end on the last line of the body",
            }[ask]
            + ". Leave cta empty; the page adds the line.\n"
        )
    print("WRITE 3 DRAFTS into " + str(reel / "caption.json") + " (ids short, medium, long). Each has:")
    print(
        f"- hook: one line, at most {LIMITS['hook']} characters, different in each draft. It does not repeat the reel's first sentence word for word."
    )
    for i in IDS:
        print(
            f"- body ({i}): {LIMITS['body'][i][0]} to {LIMITS['body'][i][1]} characters. Short lines. It adds to the reel; it does not transcribe it."
        )
    print('- cta: leave "" to use "Comment KEYWORD and I\'ll send you <what they get>." or write the line.')
    print(
        f"- hashtags: {LIMITS['hashtags_min']} to {LIMITS['hashtags_max']}, specific to the topic. Instagram allows {LIMITS['hashtags_max']} at most."
    )
    print(
        "\nRULES THAT ALWAYS HOLD: only say what the reel says or what they told you. No invented stories, clients, results or numbers. No fear. Their voice rules above win over yours."
    )
    print(
        f'Also set "written": {{"tone": "{tone}", "emoji": {emoji_level(d)}}} in caption.json, so the page knows which style these drafts were written in. Keep their "tone", "emoji", "ask", "keyword", "gift" and "more" as they are.'
    )
    print("Then run: caption.py check <reel>. Give them the Caption page link and let them pick and edit.")


def main():
    if len(sys.argv) < 3 or sys.argv[1] not in ("brief", "check", "text"):
        sys.exit(__doc__)
    cmd, reel = sys.argv[1], Path(sys.argv[2])
    if cmd == "brief":
        return brief(reel)
    d = load(reel)
    if cmd == "check":
        bad = problems(d)
        for b in bad:
            print("FIX:", b)
        if bad:
            sys.exit(1)
        print("caption.json is ready: 3 drafts within Instagram's limits")
        return
    if not d:
        sys.exit("no caption.json yet")
    want = sys.argv[3] if len(sys.argv) > 3 else (d.get("chosen") or "medium")
    x = next((x for x in d.get("drafts") or [] if isinstance(x, dict) and x.get("id") == want), None)
    if not x:
        sys.exit(f"no draft called {want}")
    print(text_of(d, x))


if __name__ == "__main__":
    main()
