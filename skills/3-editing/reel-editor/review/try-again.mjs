// Added by By Mel Ross (0.38.0): "Try another look" on a graphic, on the Touch-ups page. It picks up to 3 other looks of the same
// kind (words, a list, a number) from the Style Menu, carries the graphic's own words into each, and makes stills of all 3 at
// that moment with scripts/storyboard.py, side by side in one picture. "Use B" swaps the graphic for that look, words, times
// and layer kept; Undo takes it back. Nothing goes to Claude: the options come from the looks already built.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// kinds of graphic that can swap for each other, and the fields that hold their words
const FAMILY = { title: "words", tag: "words", quote: "words", note: "words", arctitle: "words", chips: "words", card: "list", xlist: "list", stat: "number" };
const WORDS = ["text", "title", "sub", "rows", "items", "label", "value", "delta", "overline"];
// a look's sample words ("my news this week", "step #2:") are never shown: card words only come from what the person says
const EXTRA = ["overline", "sub", "label", "delta", "caption"];

/** The words of a card, moved into the fields a look of another type uses. */
export function carryWords(from, to) {
  const out = {};
  const text = from.text ?? from.title ?? (Array.isArray(from.rows) ? from.rows.join(" / ") : null);
  const list = from.rows ?? from.items ?? null;
  for (const k of WORDS) if (k in to && from[k] != null) out[k] = from[k];
  if ("text" in to && out.text == null && text != null) out.text = String(text);
  if ("title" in to && out.title == null && from.text != null && to.type !== "title") out.title = String(from.text).replace(/\s*\/\s*/g, " ").replace(/\*/g, "");
  if ("rows" in to && out.rows == null && list) out.rows = list;
  if ("items" in to && out.items == null && list) out.items = list;
  // a one-line look (a pill, chips) has no line breaks or *marked* words
  if (["tag", "chips"].includes(to.type) && typeof out.text === "string") out.text = out.text.replace(/\s*\/\s*/g, " ").replace(/\*/g, "");
  return out;
}

export function tryAgain({ REEL, HOME, SKILL, menuLooks, addable, env }) {
  let job = { state: "idle" };
  const root = path.join(HOME, ".try-again");
  function options(card, offset = 0) {
    const fam = FAMILY[card.type];
    if (!fam) return [];
    const all = menuLooks().filter(addable).filter((l) => { const c = l.recipe.card || (l.recipe.cards || [])[0]; return c && (l.recipe.cards || [c]).length === 1 && FAMILY[c.type] === fam && l.id !== card.look; });
    if (!all.length) return [];
    // mix the kinds (a title, a quote, a note) so the 3 options look different from each other: round-robin by type,
    // the graphic's own type first
    const byType = new Map(); for (const l of all) { const t = (l.recipe.card || l.recipe.cards[0]).type; if (!byType.has(t)) byType.set(t, []); byType.get(t).push(l); }
    const lanes = [...byType.entries()].sort((a, b) => (a[0] === card.type ? -1 : b[0] === card.type ? 1 : 0)).map((e) => e[1]);
    const mixed = []; for (let k = 0; mixed.length < all.length; k++) for (const lane of lanes) if (lane[k]) mixed.push(lane[k]);
    all.splice(0, all.length, ...mixed);
    const start = (offset * 3) % all.length;
    return [...all.slice(start), ...all.slice(0, start)].slice(0, Math.min(3, all.length));
  }
  return {
    state: () => job,
    start(edit, i, offset) {
      if (job.state === "running") throw new Error("Options are already being made.");
      const card = edit.cards?.[i];
      if (!card) throw new Error("no such graphic");
      const picks = options(card, offset);
      if (!picks.length) throw new Error("There are no other looks of this kind to try yet.");
      const at = +(Math.max(0, card.start) + Math.min(0.9, Math.max(0.3, ((card.end ?? card.start + 2) - card.start) / 2))).toFixed(2);
      const content = { at: {} };
      for (const l of picks) { const rc = l.recipe.card || l.recipe.cards[0], w = carryWords(card, rc); for (const k of EXTRA) if (k in rc && !(k in w)) w[k] = ""; content[l.id] = w; content.at[l.id] = at; }
      fs.mkdirSync(root, { recursive: true });
      const out = path.join(root, `${path.basename(REEL).replace(/[^\w.-]+/g, "_")}-${Date.now()}`), cfile = out + ".json";
      fs.writeFileSync(cfile, JSON.stringify(content));
      // storyboard.py takes 2 to 5 moments: the graphic settled in, and a little later while it's still up
      const at2 = +Math.max(at + 0.3, Math.min((card.end ?? card.start + 2) - 0.15, at + 0.9)).toFixed(2);
      const names = ["A", "B", "C"], args = [REEL, "--out", out, "--at", `${at},${at2}`, "--content", cfile, ...picks.flatMap((l, k) => ["--option", `${names[k]}=${l.id}`])];
      const cmd = process.env.REEL_STORYBOARD || path.join(SKILL, "scripts", "storyboard.py");
      job = { state: "running", card: card.id, i, offset: offset || 0, at, startedAt: Date.now(), options: picks.map((l, k) => ({ letter: names[k], id: l.id, name: l.name })) };
      const c = spawn("python3", [cmd, ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
      let log = "";
      c.stdout.on("data", (d) => { log += d; }); c.stderr.on("data", (d) => { log += d; });
      c.on("error", (e) => { job = { ...job, state: "failed", error: String(e.message || e) }; });
      c.on("close", (code) => {
        const img = path.join(out, "storyboard.jpg");
        job = code === 0 && fs.existsSync(img) ? { ...job, state: "done", image: img, at2: Date.now() } : { ...job, state: "failed", error: (log.trim().split("\n").pop() || "the stills couldn't be made").slice(0, 300) };
      });
      return job;
    },
    image: () => (job.state === "done" ? job.image : null),
    /** Swap card i for look id: its recipe card, with the card's words, times, layer and id kept. */
    use(edit, i, id) {
      const card = edit.cards?.[i], look = menuLooks().find((l) => l.id === id);
      if (!card) throw new Error("no such graphic");
      if (!look || !addable(look)) throw new Error("that look can't be used here");
      const rc = JSON.parse(JSON.stringify(look.recipe.card || look.recipe.cards[0]));
      const words = carryWords(card, rc);
      for (const k of EXTRA) if (k in rc && !(k in words)) delete rc[k];
      const next = { ...rc, ...words, id: card.id, start: card.start, end: card.end, look: id };
      if (card.layer) next.layer = card.layer;
      if (card.off) next.off = true;
      edit.cards[i] = next;
      return next;
    },
  };
}
