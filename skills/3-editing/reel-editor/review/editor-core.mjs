// Added by By Mel Ross. Pure logic for the reel editor page (no files, no network): edit operations and exact retiming when a cut piece
// is dropped or brought back. editor-server.mjs does the file work, editor.html is the page, tests/reel-editor-page.test.mjs checks this.
//
// Times in edit.json are reel seconds (the time on the finished video). A reel is the kept pieces of edl.json in order, joined with
// a frame-exact cut (audio crossfade included in the piece lengths), so a piece that starts at reel time s and lasts d = (b - a) / speed
// moves everything after it by exactly d. Dropping a piece removes what lives inside it and pulls the rest earlier by d; bringing it back
// pushes the rest later by d and puts the removed material back (kept relative to the piece start in state.pieces[].removed).

const EPS = 1e-6;
export const r4 = (x) => Math.round(x * 1e4) / 1e4;
const clone = (o) => JSON.parse(JSON.stringify(o));

/** state.json for a reel that has not been edited here yet: every piece of edl.keep kept. */
export function initState(edl, speed = 1) {
  return {
    version: 1,
    speed: speed || 1,
    xfade: Number(edl.xfade || 0),
    pieces: (edl.keep || []).map(([a, b], k) => ({ id: `p${k + 1}`, a, b, kept: true })),
  };
}

export const keptSpans = (state) => state.pieces.filter((p) => p.kept).map((p) => [p.a, p.b]);
export const pieceLen = (state, p) => (p.b - p.a) / state.speed;

/** Reel-time start/end of every piece (a dropped piece gets the place it would have, for restoring). */
export function layout(state) {
  let t = 0;
  return state.pieces.map((p) => {
    const start = t, d = pieceLen(state, p);
    if (p.kept) t += d;
    return { id: p.id, a: p.a, b: p.b, kept: p.kept, start: r4(start), end: r4(start + d), dur: r4(d) };
  });
}
export const reelLength = (state) => r4(state.pieces.filter((p) => p.kept).reduce((n, p) => n + pieceLen(state, p), 0));

/** Same hash input for edl.json and state, so "cuts changed since the last cut" is one comparison. */
export function cutKey(state) {
  return JSON.stringify([keptSpans(state), state.speed, state.xfade]);
}

/** Bare numbers in `punch` alternate zoom in / out by position, so removing one would flip every later one: make them explicit first. */
export function explicitPunch(punch, zoomScale = 1.04) {
  return (punch || []).map((p, k) => (Array.isArray(p) ? p : [p, k % 2 ? 1.0 : zoomScale]));
}

/** Cards and sound events get a short id so the page can keep them open when the list re-sorts. build_reel.py ignores the field. Returns true if anything was added. */
export const genId = () => Math.random().toString(36).slice(2, 8);
export function ensureIds(edit) {
  let changed = false;
  for (const list of [edit.cards, edit.sfx_events]) for (const x of list || []) if (!x.id) { x.id = genId(); changed = true; }
  return changed;
}

const normWord = (t) => String(t).toLowerCase().replace(/[^a-z0-9' ]/g, "");

// ---------------------------------------------------------------------------------------------------------------------------------------
// drop / restore one piece
// ---------------------------------------------------------------------------------------------------------------------------------------
/**
 * Drop piece `id`. Returns {edit, transcript, state, report}. `transcript` is master_transcript.json's word list ([{text,start,end}]).
 * report lists what happened to things that did not move cleanly (split captions, clipped cards), so the page can say so.
 */
export function dropPiece(edit0, transcript0, state0, id, { zoomScale = 1.04 } = {}) {
  const edit = clone(edit0), transcript = clone(transcript0 || []), state = clone(state0);
  const lay = layout(state), L = lay.find((p) => p.id === id);
  if (!L) throw new Error(`no piece ${id}`);
  if (!L.kept) throw new Error(`piece ${id} is already dropped`);
  if (state.pieces.filter((p) => p.kept).length < 2) throw new Error("a reel needs at least one piece: keep another one first");
  const s = L.start, e = L.end, d = e - s;
  const inR = (t) => t >= s - EPS && t < e - EPS;
  const mapT = (t) => (t >= e - EPS ? t - d : t > s ? s : t);   // a time inside the piece collapses onto the join
  const removed = { captions: [], cards: [], sfx_events: [], punch: [], transcript: [], clipped: [] };   // clipped: things that stay but ended inside this piece
  const report = [];
  const capSig = (c) => `cap|${c.start}|${c.words?.[0]?.text}`, cardSig = (c) => c.id || `card|${c.type}|${c.text || c.title || c.src || ""}|${c.start}`;

  const caps = [];
  for (const c of edit.captions || []) {
    const ws = c.words || [];
    const inside = ws.filter((w) => inR(w.t)), keep = ws.filter((w) => !inR(w.t));
    if (!inside.length) {   // nothing of it was in the piece
      if (c.end > s + EPS && c.end < e - EPS) removed.clipped.push({ k: capSig(c), end: r4(c.end - s) });
      caps.push({ ...c, start: r4(mapT(c.start)), end: r4(mapT(c.end)), words: ws.map((w) => ({ ...w, t: r4(mapT(w.t)) })) });
      continue;
    }
    const nextKept = keep.find((w) => w.t >= e - EPS);
    removed.captions.push({
      ...c,
      start: r4(inside[0].t - s),
      end: r4((keep.length ? Math.min(c.end, nextKept ? nextKept.t : e, e) : c.end) - s),
      words: inside.map((w) => ({ ...w, t: r4(w.t - s) })),
    });
    if (!keep.length) continue;   // whole caption was inside
    const firstOrigKept = ws[0] === keep[0], lastOrigKept = ws[ws.length - 1] === keep[keep.length - 1];
    caps.push({
      ...c,
      start: r4(mapT(firstOrigKept ? c.start : keep[0].t)),
      end: r4(mapT(lastOrigKept ? c.end : Math.min(c.end, s))),
      words: keep.map((w) => ({ ...w, t: r4(mapT(w.t)) })),
    });
    report.push(`a caption (“${ws.map((w) => w.text).join(" ")}”) crossed this piece and was split`);
  }
  edit.captions = caps;

  const cards = [];
  for (const c of edit.cards || []) {
    if (c.start >= s - EPS && c.start < e - EPS) {   // starts inside: goes with the piece
      removed.cards.push({ ...c, start: r4(c.start - s), ...(c.end != null ? { end: r4(c.end - s) } : {}),   // end kept as it was: it comes back whole
        ...(c.row_times ? { row_times: c.row_times.map((t) => r4(t - s)) } : {}) });
      continue;
    }
    const n = { ...c, start: r4(mapT(c.start)) };
    if (c.end != null) {
      n.end = r4(mapT(c.end));
      if (c.end > s + EPS && c.end < e - EPS) removed.clipped.push({ k: cardSig(c), end: r4(c.end - s) });
      if (c.end > s + EPS && c.end < e - EPS) report.push(`a ${c.type} card (“${c.text || c.title || c.src || ""}”) ended inside this piece and now ends at the cut`);
    }
    if (c.row_times) n.row_times = c.row_times.map((t) => r4(mapT(t)));
    cards.push(n);
  }
  edit.cards = cards;

  const sfx = [];
  for (const ev of edit.sfx_events || []) {
    if (inR(ev.t)) removed.sfx_events.push({ ...ev, t: r4(ev.t - s) });
    else sfx.push({ ...ev, t: r4(mapT(ev.t)) });
  }
  if (edit.sfx_events) edit.sfx_events = sfx;

  const punch = [];
  for (const [t, z] of explicitPunch(edit.punch, zoomScale)) {
    if (inR(t)) removed.punch.push([r4(t - s), z]);
    else punch.push([r4(mapT(t)), z]);
  }
  if (edit.punch) edit.punch = punch;

  const tr = [];
  for (const w of transcript) {
    if (inR(w.start)) removed.transcript.push({ ...w, start: r4(w.start - s), end: r4(Math.min(w.end, e) - s) });
    else tr.push({ ...w, start: r4(mapT(w.start)), end: r4(mapT(w.end)) });
  }

  const piece = state.pieces.find((p) => p.id === id);
  piece.kept = false;
  piece.removed = removed;
  return { edit, transcript: tr, state, report };
}

/** Bring piece `id` back where it was in the order, with the material that was removed with it. */
export function restorePiece(edit0, transcript0, state0, id) {
  const edit = clone(edit0), transcript = clone(transcript0 || []), state = clone(state0);
  const P = state.pieces.find((p) => p.id === id);
  if (!P) throw new Error(`no piece ${id}`);
  if (P.kept) throw new Error(`piece ${id} is already kept`);
  const L = layout(state).find((p) => p.id === id);
  const s = L.start, d = (P.b - P.a) / state.speed;
  const up = (t) => (t >= s - EPS ? t + d : t);          // a start or a word at or after the insert point
  const upEnd = (t) => (t > s + EPS ? t + d : t);        // an end exactly at the insert point stays (it ended at the join)
  const rm = P.removed || { captions: [], cards: [], sfx_events: [], punch: [], transcript: [] };
  const capSig = (c) => `cap|${c.start}|${c.words?.[0]?.text}`, cardSig = (c) => c.id || `card|${c.type}|${c.text || c.title || c.src || ""}|${c.start}`;
  const clip = new Map((rm.clipped || []).map((x) => [x.k, x.end]));   // ends that were cut short at the join come back to where they were

  edit.captions = (edit.captions || []).map((c) => ({ ...c, start: r4(up(c.start)), end: r4(upEnd(c.end)), words: c.words.map((w) => ({ ...w, t: r4(up(w.t)) })) }));
  for (const c of edit.captions) if (clip.has(capSig(c))) c.end = r4(s + clip.get(capSig(c)));
  for (const c of rm.captions) edit.captions.push({ ...c, start: r4(c.start + s), end: r4(c.end + s), words: c.words.map((w) => ({ ...w, t: r4(w.t + s) })) });
  edit.captions.sort((x, y) => x.start - y.start);

  edit.cards = (edit.cards || []).map((c) => ({ ...c, start: r4(up(c.start)), ...(c.end != null ? { end: r4(upEnd(c.end)) } : {}),
    ...(c.row_times ? { row_times: c.row_times.map((t) => r4(up(t))) } : {}) }));
  for (const c of edit.cards) if (clip.has(cardSig(c))) c.end = r4(s + clip.get(cardSig(c)));
  for (const c of rm.cards) edit.cards.push({ ...c, start: r4(c.start + s), ...(c.end != null ? { end: r4(c.end + s) } : {}),
    ...(c.row_times ? { row_times: c.row_times.map((t) => r4(t + s)) } : {}) });
  edit.cards.sort((x, y) => x.start - y.start);

  if (edit.sfx_events || rm.sfx_events.length) {
    edit.sfx_events = [...(edit.sfx_events || []).map((ev) => ({ ...ev, t: r4(up(ev.t)) })), ...rm.sfx_events.map((ev) => ({ ...ev, t: r4(ev.t + s) }))].sort((x, y) => x.t - y.t);
  }
  if (edit.punch || rm.punch.length) {
    edit.punch = [...explicitPunch(edit.punch).map(([t, z]) => [r4(up(t)), z]), ...rm.punch.map(([t, z]) => [r4(t + s), z])].sort((x, y) => x[0] - y[0]);
  }
  const tr = [...transcript.map((w) => ({ ...w, start: r4(up(w.start)), end: r4(upEnd(w.end)) })), ...rm.transcript.map((w) => ({ ...w, start: r4(w.start + s), end: r4(w.end + s) }))]
    .sort((x, y) => x.start - y.start);
  P.kept = true;
  delete P.removed;
  return { edit, transcript: tr, state };
}

/** expected.txt for qa.py after a cut change: the words Whisper heard in the remaining pieces (a clipped word at a join will then show up as missing). */
export const expectedText = (transcript) => transcript.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim() + "\n";

// ---------------------------------------------------------------------------------------------------------------------------------------
// ordinary edits: validated, whitelisted
// ---------------------------------------------------------------------------------------------------------------------------------------
const TEXT_TYPES = new Set(["tag", "title", "card", "cta", "note", "quote"]);
const LAYERS = new Set(["front", "behind", "both"]);
const POS = new Set(["top-left", "top-center", "top-right", "middle-left", "middle-right", "center", "side-left", "side-right", "custom"]);   // 0.16.0: side-left / side-right = 2 pictures side by side in the middle
const COMMON = ["start", "end", "off"];
const FIELDS = {
  tag: [...COMMON, "text", "y", "layer", "glass", "color"],
  title: [...COMMON, "text", "y", "size", "layer", "align"],   // 0.34.9: "align" lines the hook up left, centred or right
  arctitle: [...COMMON, "text", "sub"],   // 0.23.0: a headline arched over the head; "sub" is the heavy line under it
  cta: [...COMMON, "text", "y", "layer"],
  quote: [...COMMON, "text", "y", "size", "layer"],   // 0.19.0: a sentence in a white box
  chips: [...COMMON, "title", "y", "layer"],
  columns: [...COMMON, "y", "layer"],
  note: [...COMMON, "text", "y", "rotate", "size", "layer"],   // Added by By Mel Ross (0.11.0): taped paper note
  card: [...COMMON, "title", "rows", "layer", "glass"],
  popup: [...COMMON, "pos", "x", "y", "size", "rotate", "frame", "layer", "from", "loop", "caption"],   // 0.13.0: "from" and "loop" are for video clips
  orbit: [...COMMON, "level", "size", "period", "frame"],   // Added by By Mel Ross (0.9.0): pictures that circle the head
  sticker: [...COMMON, "x", "y", "size", "rotate", "layer"],
  image: [...COMMON, "layer"], shot: [...COMMON, "label", "y", "layer"],
  // 0.28.0: looks added from the Touch-ups page can have their words changed too
  stat: [...COMMON, "label", "value", "delta", "y", "layer"], xlist: [...COMMON, "items", "layer"], page: [...COMMON, "label"], tiles: [...COMMON, "label"],
  // 0.31.0: the Roundup layout (scripts/roundup.py)
  chapter: [...COMMON, "text", "sub", "color", "text_color"], split: [...COMMON, "face_y", "fit", "from"], inset: [...COMMON, "title", "corner", "size", "face_y"], roundup: [...COMMON],
};
export const isTextType = (t) => TEXT_TYPES.has(t);

function num(v, name, lo, hi) {
  const n = Number(v);
  if (v === "" || v == null || !Number.isFinite(n) || n < lo || n > hi) throw new Error(`${name} must be a number from ${lo} to ${hi}`);
  return n;
}
function cleanText(v, name, max = 60) {
  const s = String(v ?? "").replace(/[\r\n\t]+/g, " ").trim();
  if (!s) throw new Error(`${name} can't be empty`);
  if (s.length > max) throw new Error(`${name} is too long (max ${max} characters)`);
  return s;
}

/** Validate and normalise changes to one card. `dur` = reel length in seconds. */
export function cleanCardFields(type, set, dur) {
  const allowed = new Set(FIELDS[type] || COMMON), out = {};
  for (const [k, v] of Object.entries(set || {})) {
    if (!allowed.has(k)) throw new Error(`${k} can't be changed on a ${type} card`);
    if (k === "start" || k === "end") out[k] = r4(num(v, k, 0, dur));
    else if (k === "off" || k === "glass" || k === "frame" || k === "loop") out[k] = !!v;
    else if (k === "from") out[k] = num(v, "where the clip starts", 0, 900);
    else if (k === "text" || k === "title" || k === "label") out[k] = cleanText(v, k);
    else if (k === "value") out[k] = cleanText(v, "the number", 16);   // 0.28.0
    else if (k === "delta") out[k] = String(v ?? "").trim() ? cleanText(v, "the change", 12) : "";
    else if (k === "items") { out[k] = (Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim()).filter(Boolean).map((x) => cleanText(x, "line", 40)).slice(0, 6); if (!out[k].length) throw new Error("keep at least 1 line"); }
    else if (k === "sub") out[k] = String(v ?? "").trim() ? cleanText(v, "the line under it", 30) : "";   // 0.23.0: empty takes it off
    else if (k === "caption") out[k] = String(v ?? "").trim() ? cleanText(v, "label", 40) : "";   // 0.16.0: the handwritten label under a popup; empty takes it off
    else if (k === "align") { if (!["left", "center", "right"].includes(v)) throw new Error("a title lines up left, center or right"); out[k] = v; }
    else if (k === "layer") { if (!LAYERS.has(v)) throw new Error("layer must be front, behind or both"); out[k] = v; }
    else if (k === "pos") { if (!POS.has(v)) throw new Error("unknown position"); out[k] = v; }
    else if (k === "level") { if (!["crown", "chest"].includes(v)) throw new Error("the ring goes round the top of your head (crown) or below your chin (chest)"); out[k] = v; }
    else if (k === "period") out[k] = num(v, "seconds per lap", 1.5, 12);
    else if (k === "size" && type === "orbit") out[k] = Math.round(num(v, k, 80, 400));
    else if (k === "x") out[k] = Math.round(num(v, k, -200, 1280));
    else if (k === "y") out[k] = Math.round(num(v, k, 0, 1920));
    else if (k === "size") out[k] = Math.round(num(v, k, type === "popup" ? 80 : 40, type === "popup" ? 1000 : 900));
    else if (k === "rotate") out[k] = num(v, k, -45, 45);
    else if (k === "rows") { out[k] = (Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim()).filter(Boolean).map((x) => cleanText(x, "row", 40)).slice(0, 6); if (!out[k].length) throw new Error("a list needs at least 1 row"); }
    else if (k === "color") { if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error("color must look like #B9C8A5"); out[k] = v; }
  }
  if (out.start != null && out.end != null && out.end < out.start + 0.3) throw new Error("a card must stay on screen for at least 0.3 s");
  return out;
}

/**
 * Apply one operation. Returns {edit, info}. Never mutates its input.
 * ops: caption_word{ci,wi,text,accent?} | card_set{i,set} | card_add{card} | card_del{i} | sfx_set{i,set} | sfx_add{event} | sfx_del{i}
 * card_add takes type "tag", "popup" (src: one uploaded picture) or "orbit" (src: 1-6 uploaded pictures).
 */
export function applyOp(edit0, op, { dur }) {
  const edit = clone(edit0), info = {};
  const need = (arr, i, what) => { if (!Number.isInteger(i) || i < 0 || i >= (arr || []).length) throw new Error(`no ${what} ${i}`); };
  switch (op.op) {
    case "caption_word": {
      need(edit.captions, op.ci, "caption"); const c = edit.captions[op.ci]; need(c.words, op.wi, "word");
      const w = c.words[op.wi];
      const text = op.text == null ? w.text : cleanText(op.text, "word", 40);
      if (/\s/.test(text)) throw new Error("one word at a time (no spaces); tap the next word for the next fix");
      info.before = w.text; info.after = text;
      w.text = text;
      if (op.accent != null) w.accent = !!op.accent;
      break;
    }
    case "card_set": {
      need(edit.cards, op.i, "card"); const c = edit.cards[op.i];
      const fields = cleanCardFields(c.type, op.set, dur);
      const start = fields.start ?? c.start, end = fields.end ?? c.end;
      if (end != null && end < start + 0.3 && ("start" in fields || "end" in fields)) throw new Error("a card must stay on screen for at least 0.3 s");
      Object.assign(c, fields);
      if (c.caption === "") delete c.caption;
      if ("layer" in fields && fields.layer === "front" && !isTextType(c.type)) delete c.layer;
      break;
    }
    case "card_add": {
      const type = op.card?.type;
      if (!["tag", "popup", "orbit", "card"].includes(type)) throw new Error("this page adds pills (tag), lists (card), popups and pictures that circle your head (orbit)");
      const { type: _t, src, ...rest } = op.card;
      const fields = cleanCardFields(type, rest, dur);
      if (fields.start == null) throw new Error("start time needed");
      if (fields.end == null) fields.end = r4(Math.min(fields.start + (type === "popup" ? 3 : type === "orbit" ? 6 : type === "card" ? 4 : 2.5), dur));
      const card = { id: genId(), type, ...fields };
      if (type === "card") { card.title = card.title || "my list"; card.rows = card.rows || ["first", "second", "third"]; }   // 0.16.0: a list card
      if (type === "tag") { card.text = card.text || "new pill"; card.y = card.y ?? 130; card.glass = card.glass ?? true; card.sfx = false; }
      if (type === "popup") {
        if (!/^popups\/[\w.\- ]+$/.test(String(src || ""))) throw new Error("popups come from the upload button");
        card.src = src; const clip = IS_VIDEO.test(src);   // 0.13.0: a video clip opens bigger, top left, like a window beside the face
        card.size = card.size || (clip ? 440 : 360);
        if (!card.pos) {
          // 0.16.0: one picture or video clip goes in the middle. A second one on screen at the same time puts the two side by side.
          const mate = (edit.cards || []).filter((x) => x.type === "popup" && !x.off && (!x.pos || x.pos === "center") && x.start < card.end && (x.end ?? x.start + 3) > card.start);
          if (mate.length === 1) { mate[0].pos = "side-left"; card.pos = "side-right"; info.paired = true; } else card.pos = "center";
        }
      }
      if (type === "orbit") {
        const list = Array.isArray(src) ? src.map(String) : [];
        if (list.length < 1 || list.length > 6) throw new Error("pick 1 to 6 pictures");
        if (!list.every((x) => /^popups\/[\w.\- ]+$/.test(x))) throw new Error("pictures come from the upload button");
        if (list.some((x) => IS_VIDEO.test(x))) throw new Error("the ring takes pictures, not video clips");
        card.src = list; card.level = card.level || "crown"; card.period = card.period || 4;
      }
      edit.cards = [...(edit.cards || []), card].sort((x, y) => x.start - y.start);
      info.index = edit.cards.indexOf(card);
      break;
    }
    case "card_del": need(edit.cards, op.i, "card"); edit.cards.splice(op.i, 1); break;
    case "sfx_set": {
      need(edit.sfx_events, op.i, "sound"); const ev = edit.sfx_events[op.i];
      for (const [k, v] of Object.entries(op.set || {})) {
        if (k === "t") ev.t = r4(num(v, "time", 0, dur));
        else if (k === "db") ev.db = num(v, "level", -40, 0);
        else if (k === "off") { if (v) ev.off = true; else delete ev.off; }
        else if (k === "name") { if (!/^[a-z0-9-]+$/.test(String(v))) throw new Error("unknown sound"); ev.name = v; }
        else throw new Error(`${k} can't be changed on a sound`);
      }
      break;
    }
    case "sfx_add": {
      const ev = { id: genId(), name: String(op.event?.name || "pop-soft"), t: r4(num(op.event?.t, "time", 0, dur)), db: Number.isFinite(+op.event?.db) ? +op.event.db : -16 };
      if (!/^[a-z0-9-]+$/.test(ev.name)) throw new Error("unknown sound");
      edit.sfx_events = [...(edit.sfx_events || []), ev].sort((x, y) => x.t - y.t);
      info.index = edit.sfx_events.indexOf(ev);
      break;
    }
    case "sfx_del": need(edit.sfx_events, op.i, "sound"); edit.sfx_events.splice(op.i, 1); break;
    default: throw new Error(`unknown change: ${op.op}`);
  }
  return { edit, info };
}

/** Where a popup lands on the 1080x1920 frame: the same arithmetic as build_reel.py (left/top of the box, in px). */
export const IS_VIDEO = /\.(mp4|mov|m4v|webm)$/i;
export function popupBox(card, iw, ih) {
  const W = 1080, H = 1920, side = card.pos === "side-left" || card.pos === "side-right";
  const pw = Math.min(Number(card.size || (IS_VIDEO.test(String(card.src || "")) ? 440 : 360)), side ? 500 : Infinity), ph = Math.max(Math.round((pw * ih) / Math.max(iw, 1)), 1);
  const named = { "top-left": ["top", "left"], "top-center": ["top", "center"], "top-right": ["top", "right"], "middle-left": ["middle", "left"], "middle-right": ["middle", "right"], center: ["center", "center"] };
  const pos = card.pos || "center";   // 0.16.0: a picture or video clip with no place set sits in the middle
  if (side) return { left: pos === "side-left" ? W / 2 - 12 - pw : W / 2 + 12, top: Math.floor((H - ph) / 2), w: pw, h: ph };
  if (pos === "custom" || (card.x != null && card.y != null && !named[pos])) return { left: Math.trunc((card.x ?? W / 2) - pw / 2), top: Math.trunc((card.y ?? 400) - ph / 2), w: pw, h: ph };
  const [v, h] = named[pos] || named.center;
  return {
    left: { left: 60, center: Math.floor((W - pw) / 2), right: W - 60 - pw }[h],
    top: { top: 150, middle: Math.floor((H - ph) / 2) - 260, center: Math.floor((H - ph) / 2) }[v],
    w: pw, h: ph,
  };
}

/** Word-level check of retimed captions against a fresh transcript of the new video: { n, median, p90, max } of |caption word time - heard time|. */
export function syncCheck(captions, heard) {
  const A = [], B = [];
  for (const c of captions || []) for (const w of c.words) { const t = normWord(w.text).replace(/ /g, ""); if (t) A.push({ t, at: w.t }); }
  for (const w of heard || []) { const t = normWord(w.text).replace(/ /g, ""); if (t) B.push({ t, at: w.start ?? w.t }); }
  const n = A.length, m = B.length;
  if (!n || !m || n * m > 4e6) return { n: 0 };
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i].t === B[j].t ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const diffs = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i].t === B[j].t) { diffs.push(Math.abs(A[i].at - B[j].at)); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  if (!diffs.length) return { n: 0 };
  diffs.sort((x, y) => x - y);
  const q = (p) => diffs[Math.min(diffs.length - 1, Math.floor(p * diffs.length))];
  return { n: diffs.length, of: n, median: r4(q(0.5)), p90: r4(q(0.9)), max: r4(diffs[diffs.length - 1]) };
}


// ---- the receipt (Added by By Mel Ross, 0.14.0): what was done to this reel, in plain lines ------------------------------------
// One place that says it: how much was cut, the speed, the captions, each kind of graphic, the sounds. Counted from the reel's
// own files, never estimated. `srcDur` is the length of the clip as filmed (null when it can't be read: the cut line then
// leaves out the before/after). Used by the touch-ups page and by `node review/receipt.mjs <reel>` at delivery.
const KIND_NAME = { title: ["title", "titles"], card: ["list", "lists"], tag: ["label", "labels"], xlist: ["check list", "check lists"], stat: ["number card", "number cards"],
  note: ["taped note", "taped notes"], cta: ["closing button", "closing buttons"], image: ["picture", "pictures"], shot: ["website shot", "website shots"],
  polaroids: ["photo stack", "photo stacks"], tiles: ["tile row", "tile rows"], orbit: ["ring of pictures", "rings of pictures"], motion: ["animation", "animations"],
  follow: ["written-out line", "written-out lines"], split: ["split screen", "split screens"] };
const secs = (n) => (Math.round(n * 10) / 10).toString();
export function receipt({ state, edit, srcDur = null, themeName = null, kitName = null }) {
  const lines = [], kept = state.pieces.filter((p) => p.kept), keptSrc = kept.reduce((n, p) => n + (p.b - p.a), 0);
  const final = reelLength(state), speed = Number(state.speed || 1);
  // cuts: every gap between kept stretches, plus a trimmed start or end when the clip's length is known
  let cuts = 0;
  for (let i = 1; i < kept.length; i++) if (kept[i].a - kept[i - 1].b > 0.02) cuts++;
  if (kept.length && kept[0].a > 0.05) cuts++;
  if (srcDur != null && kept.length && srcDur - kept[kept.length - 1].b > 0.05) cuts++;
  const dropped = state.pieces.length - kept.length;
  if (srcDur != null) {
    const gone = Math.max(srcDur - keptSrc, 0);
    lines.push({ id: "cuts", text: cuts ? `Cut ${cuts} ${cuts === 1 ? "stretch" : "stretches"}, ${secs(gone)} seconds removed (${secs(srcDur)} s filmed, ${secs(final)} s in the reel)` : `Nothing cut (${secs(final)} seconds)` });
  } else lines.push({ id: "cuts", text: cuts ? `Cut ${cuts} ${cuts === 1 ? "stretch" : "stretches"} (${secs(final)} seconds in the reel)` : `Nothing cut (${secs(final)} seconds)` });
  if (dropped) lines.push({ id: "dropped", text: `${dropped} ${dropped === 1 ? "piece" : "pieces"} switched off on this page` });
  lines.push({ id: "speed", text: Math.abs(speed - 1) < 0.005 ? "Voice at normal speed" : `Voice ${speed > 1 ? "sped up" : "slowed"} to ${speed}x` });
  const caps = edit.captions || [], words = caps.reduce((n, c) => n + (c.words || []).length, 0), accents = caps.reduce((n, c) => n + (c.words || []).filter((w) => w.accent).length, 0);
  lines.push({ id: "captions", text: caps.length ? `Captions on: ${words} words in ${caps.length} lines` + (accents ? `, ${accents} highlighted` : "") : "No captions" });
  const on = (edit.cards || []).filter((c) => !c.off), counts = new Map();
  for (const c of on) {
    let k = c.type;
    if (c.type === "popup") k = IS_VIDEO.test(String(c.src || "")) ? "_clip" : /\.gif$/i.test(String(c.src || "")) ? "_gif" : "_pic";
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const name = (k, n) => k === "_clip" ? (n === 1 ? "video clip" : "video clips") : k === "_gif" ? (n === 1 ? "GIF" : "GIFs") : k === "_pic" ? (n === 1 ? "picture popup" : "picture popups") : (KIND_NAME[k] || [k, k + "s"])[n === 1 ? 0 : 1];
  lines.push({ id: "graphics", text: on.length ? `${on.length} ${on.length === 1 ? "graphic" : "graphics"}: ` + [...counts].map(([k, n]) => `${n} ${name(k, n)}`).join(", ") : "No graphics" });
  const sfx = (edit.sfx_events || []).filter((e) => !e.off).length, zooms = (edit.punch || []).length;
  lines.push({ id: "sounds", text: sfx ? `${sfx} sound ${sfx === 1 ? "effect" : "effects"}` : "No sound effects" });
  if (zooms) lines.push({ id: "zooms", text: `${zooms} slow ${zooms === 1 ? "zoom" : "zooms"}` });
  if (themeName || kitName) lines.push({ id: "look", text: [themeName ? `${themeName} theme` : "", kitName ? `${kitName} materials` : ""].filter(Boolean).join(", ") });
  return lines;
}
