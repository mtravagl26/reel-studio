// The Touch-ups page (editor.html). Moved out of the page in 0.30.0; served at /editor.js.
// Reel Studio step bar (Added by By Mel Ross): links to the other pages when their address is known. The cover page only answers
// on this computer, so its link is left off when this page is open on a phone.
function setSteps(here, links) {
  const local = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
  document.querySelectorAll(".steps .step").forEach((el) => {
    const k = el.dataset.step, u = links && links[k];
    if (k === here) { el.setAttribute("aria-current", "step"); el.classList.remove("off"); el.removeAttribute("title"); el.removeAttribute("href"); return; }
    const ok = typeof u === "string" && (/^https?:\/\/[\w.\-\[\]:]+(:\d+)?\//.test(u) || /^\/[\w\-\/]*$/.test(u)) && (k !== "cover" || local);
    if (ok) { el.href = u; el.classList.remove("off"); el.removeAttribute("title"); }
    else if (k === "cover" && u && !local) el.title = "The cover page opens on your Mac, not on your phone";
  });
}
import { popupBox, isTextType } from "/core.mjs";
const $ = (s) => document.querySelector(s), esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// 0.34.0: 3 recommended looks for this reel, with reasons (loaded once)
let RECS = { state: "idle", picks: [], checked: [] };
async function loadRecs() {
  if (RECS.state !== "idle") return;
  RECS = { state: "running", picks: [], checked: [] };
  try { const r = await (await fetch("/api/recommend")).json(); RECS = r.ok ? { state: "done", picks: r.picks, checked: r.checked } : { state: "failed", picks: [], checked: [] }; }
  catch { RECS = { state: "failed", picks: [], checked: [] }; }
  renderSettings();
}
// 0.33.0: the theme stills ("See them on my clip"): theme id ("" = my brand) -> picture address
let TPS = { state: "idle", stills: {}, note: "" };
async function seeThemes() {
  TPS = { state: "running", stills: {}, note: "Making the stills. Each one shows as it's ready..." }; renderSettings();
  try {
    const r = await (await fetch("/api/theme-previews", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json();
    if (!r.ok) throw new Error(r.error);
    for (;;) {
      await new Promise((ok) => setTimeout(ok, 1500));
      const s = await (await fetch("/api/theme-previews")).json();
      const changed = Object.keys(s.stills || {}).length !== Object.keys(TPS.stills).length;
      TPS.stills = s.stills || {};
      if (s.state === "done") { TPS = { ...TPS, state: "done", note: (s.notes || []).join(" ") || "Tap one to use it." }; renderSettings(); break; }
      if (s.state === "failed") throw new Error(s.error || "the stills could not be made");
      if (changed) renderSettings();
    }
  } catch (er) { TPS = { ...TPS, state: "done", note: er.message }; renderSettings(); }
}
let S = null, openCard = new Set(), capSel = null, placing = null, watch = null, selCard = null, openSfx = new Set(), pollT = null;
const cid = (i) => S.edit.cards[i]?.id ?? `i${i}`, sid = (i) => S.edit.sfx_events[i]?.id ?? `i${i}`, cidx = (id) => S.edit.cards.findIndex((c, i) => cid(i) === id);
const v = $("#v");
const fmt = (t) => { t = Math.max(0, +t || 0); const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, "0")}`; };
function toast(msg, bad, undoable) {
  const t = $("#toast"); t.textContent = msg; t.className = bad ? "bad" : ""; t.style.display = "block";
  if (undoable) {   // 0.38.2: a delete shows Undo right in the message for 6 s, so no dialog is needed
    const b = document.createElement("button"); b.type = "button"; b.className = "sm"; b.id = "toastundo"; b.textContent = "Undo";
    b.addEventListener("click", async () => { t.style.display = "none"; try { const j = await post("/api/undo"); toast(`Undid: ${j.undid}`); } catch (e) { toast(e.message, true); } });
    t.append(b);
  }
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.style.display = "none"), bad ? 7000 : undoable ? 6000 : 2200);
}
async function post(url, body, raw) {
  const r = await fetch(url, { method: "POST", headers: raw ? {} : { "Content-Type": "application/json" }, body: raw ?? JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({ ok: false, error: "the editor did not answer" }));
  if (!j.ok) throw new Error(j.error || "failed");
  if (j.state) { S = j.state; render(); if (!/\/api\/render$/.test(url)) liveSoon(); }
  return j;
}
async function op(o, key, msg, undoable) { try { const j = await post("/api/op", { op: o, key }); savedNow(); if (msg) toast(msg, false, undoable); return j; } catch (e) { toast(e.message, true); render(); } }
// 0.38.2: every change saves on its own; this line says when the last one did
function savedNow() { const s = $("#savedat"); if (s) s.textContent = "Saved " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
async function load() {
  S = await (await fetch("/api/state")).json();
  if (S.built === false) {   // the reel has not been built yet: nothing to touch up
    document.body.classList.add("unbuilt"); $("#sub").textContent = S.reel; setSteps("edit", S.links);
    $("#unbuilt").hidden = false; setTimeout(load, 4000); return;
  }
  if (document.body.classList.contains("unbuilt")) { document.body.classList.remove("unbuilt"); $("#unbuilt").hidden = true; }
  render();
}
const running = () => S && S.job && (S.job.state === "running" || S.job.state === "queued");
const now = () => +v.currentTime.toFixed(1);
const dur = () => S.total;

// ------------------------------------------------------------------ render
function render() {
  $("#sub").textContent = `${S.reel} · ${fmt(S.total)} long · ${S.edit.cards.length} cards`; setSteps("edit", S.links);
  $("#undo").disabled = !S.canUndo || running(); $("#undo").title = S.undoLabel ? `Undo: ${S.undoLabel}` : "";
  $("#render").disabled = running(); $("#render").textContent = running() ? "Rendering…" : "Re-render";
  renderStatus(); renderVideo(); renderTimeline(); renderCaps(); renderPieces(); renderCards(); renderPopups(); renderSfx(); renderSettings(); renderVersions(); drawOverlay();
  $("#notes").innerHTML = S.notes?.length ? `<div class="banner info">${S.notes.map(esc).join("<br>")}</div>` : "";
}
const STEPNAME = { cut: "cutting the video", render: "building the video", sound: "mixing the sound", checks: "checking it", copies: "saving this version", queued: "waiting to start" };
const fmtClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
setInterval(() => { const e = document.querySelector("#elapsed"); if (e && e.dataset.since) e.textContent = fmtClock(Math.max(0, (Date.now() - Date.parse(e.dataset.since)) / 1000)); }, 1000);
function renderStatus() {
  const j = S.job; let h = "";
  const chips = { running: `<span class="chip run">Rendering: ${esc(j.step || "")}</span>`, queued: `<span class="chip run">Queued</span>` };
  if (j.state === "running" || j.state === "queued") {
    // 0.38.2: elapsed time, which step of how many, and keep the Mac awake
    const plan = j.plan || [], at = plan.indexOf(j.step === "sound list" ? "sound" : j.step), since = j.startedAt ? Math.max(0, (Date.now() - Date.parse(j.startedAt)) / 1000) : null;
    const where = at >= 0 ? ` · step ${at + 1} of ${plan.length}: ${esc(STEPNAME[j.step] || j.step)}` : "";
    h = `<div class="banner info"><b>${chips[j.state]}</b> <span id="elapsed" data-since="${j.startedAt || ""}">${since != null ? fmtClock(since) : ""}</span>${where}<br>This takes a few minutes${S.cutsStale ? " (it cuts the video again first)" : ""}. Edits are paused until it finishes. <b>Keep your Mac awake and this page's link running</b>; you can close this page.${j.lowDisk != null ? ` <b>Low disk space:</b> ${j.lowDisk} GB free.` : ""}<ul class="steps">${(j.steps || []).map((s) => `<li>${s.ok ? "✓" : "✗"} ${esc(s.name)} (${s.secs}s)</li>`).join("")}</ul></div>`;
  } else if (j.state === "failed") {
    h = `<div class="banner bad"><b>The render failed.</b> ${esc(j.error || "")}<br><span class="small">Your edits are saved. The log is in editor/render.log in the reel folder.</span></div>`;
  } else if (j.state === "done" && j.result && S.video === j.result.phone && !S.dirty && !S.cutsStale) {
    const r = j.result, q = r.qa;
    h = `<div class="banner ok"><b>New video ready (v${r.v}).</b> ${q ? (q.pass ? "Checks passed." : "<b>A check failed:</b> " + esc(q.lines.filter((l) => /FAIL|want/.test(l)).join("; "))) : ""}`
      + (r.notes?.length ? `<ul>${r.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "")
      + (r.recut && r.sync?.n ? `<div class="small">Caption timing vs a fresh transcript of this video: median off by ${r.sync.median.toFixed(2)} s, 90% within ${r.sync.p90.toFixed(2)} s, worst ${r.sync.max.toFixed(2)} s (${r.sync.n} words).</div>` : "") + `</div>`;
  } else if (S.dirty || S.cutsStale) {
    h = liveOn && !S.cutsStale && liveState.state !== "failed"
      ? `<div class="banner info">Saved. The live preview below shows your changes. <b>Tap Re-render</b> when you're done, to make the finished video.</div>`
      : `<div class="banner">Saved. The video below is still the old version. <b>Tap Re-render</b> to see your changes.</div>`;
  } else {
    h = `<div class="banner ok">The video below matches your edits.</div>`;
  }
  $("#status").innerHTML = h;
}
function renderVideo() {
  const r = S.renders.find((x) => x.v === (watch ?? S.renders[S.renders.length - 1]?.v)) || S.renders[S.renders.length - 1];
  if (watch == null && S.job.state === "done" && S.job.result && S.renders.length) watch = null;
  const src = r ? "/files/" + r.phone : (S.hasMaster && !S.cutsStale ? "/files/master.mp4" : null);   // 0.17.0: no render yet? The cut video keeps time for the live preview
  if (src && v.getAttribute("data-src") !== src) { const t = v.currentTime || 0, was = !v.paused; v.setAttribute("data-src", src); v.src = src; v.onloadedmetadata = () => { try { v.currentTime = Math.min(t, v.duration || t); } catch {} if (was) v.play(); }; }
  const newest = S.renders[S.renders.length - 1];
  const when = (iso) => { try { return new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
  $("#vernote").textContent = r
    ? `Showing version ${r.v}, made ${when(r.at)}${r.outside ? " by Claude" : ""}. ${r === newest ? "This is the newest." : `A newer one exists (version ${newest.v}): pick it under Versions.`}`
    : "";
  if (!src && S.prepping) $("#stale").innerHTML = `<div class="banner info">Preparing a phone copy of the current video…</div>`;
  else if (!src) $("#stale").innerHTML = `<div class="banner">No video yet: tap Re-render.</div>`;
  else $("#stale").innerHTML = S.cutsStale ? `<div class="banner">The video above still has the old cuts. The times below match the new cut. Re-render to see it.</div>` : "";
  $("#ver").innerHTML = S.renders.slice().reverse().map((x) => `<option value="${x.v}" ${x === r ? "selected" : ""}>${x.baseline ? "before editing" : "render " + x.v}${x === S.renders[S.renders.length - 1] ? " (latest)" : ""}</option>`).join("");
  $("#ver").style.display = S.renders.length > 1 ? "" : "none";
}
const capLine = (c) => (c.words || []).map((w) => w.text).join(" ");
const PX = 56;                                             // timeline pixels per second (the server draws the strip and wave to match)
function renderTimeline() {
  const T = Math.max(S.total, 1), x = (t) => Math.round(t * PX), r = S.renders.find((q) => q.v === (watch ?? S.renders[S.renders.length - 1]?.v)) || S.renders[S.renders.length - 1];
  const W = x(T) + 24;
  let h = `<div class="ruler">`;
  for (let t = 0; t <= T; t += T > 90 ? 5 : 1) h += `<span style="left:${x(t)}px">${t % 5 === 0 || T <= 20 ? fmt(t).replace(/\.\d$/, "") : ""}</span>`;
  h += `</div>`;
  if (r) h += `<div class="strip" style="width:${x(T)}px;background-image:url(/api/strip.jpg?v=${r.v})"></div><div class="wave" style="width:${x(T)}px;background-image:url(/api/wave.png?v=${r.v})"></div>`;
  else h += `<div class="strip" style="width:${x(T)}px"></div>`;
  for (const p of S.pieces.filter((p) => p.kept).slice(1)) h += `<div class="cutmark" style="left:${x(p.start)}px" title="A cut"></div>`;
  for (const c of S.edit.captions) { const a = c.start ?? c.words[0]?.t ?? 0, b = c.end ?? a + 1; h += `<div class="mk cap" style="left:${x(a)}px;width:${Math.max(x(b) - x(a) - 2, 14)}px" title="${esc(capLine(c))}"><span>${esc(capLine(c))}</span></div>`; }
  let lastEnd = -1;                                         // graphics that overlap in time drop to a second row
  for (const c of S.edit.cards.slice().sort((a, b) => a.start - b.start)) {
    const end = c.end ?? c.start + 2, low = c.start < lastEnd - 0.05; if (!low) lastEnd = end;
    const label = c.text || c.title || c.label || (c.src ? String(Array.isArray(c.src) ? c.src[0] : c.src).replace(/^popups\/[^-]*-/, "").replace(/\.clip\.mp4$/, "") : c.type);
    h += `<div class="mk gfx${c.type === "popup" || c.type === "orbit" ? " pop" : ""}${low ? " g2" : ""}${c.off ? " off" : ""}" data-drag="${esc(c.id)}" style="left:${x(c.start)}px;width:${Math.max(x(end) - x(c.start) - 2, 16)}px" title="${esc(label)}"><span>${esc(label)}</span></div>`;
  }
  for (const e of S.edit.sfx_events) h += `<div class="mk sfx${e.off ? " off" : ""}" style="left:${x(e.t)}px" title="${esc(e.name)}"></div>`;
  h += `<div class="ph" id="ph" style="left:${x(v.currentTime || 0)}px"></div>`;
  const inner = $("#tli"); inner.style.width = W + "px"; inner.innerHTML = h;
  const rc = $("#receipt"); rc.hidden = !(S.receipt || []).length; $("#receiptList").innerHTML = (S.receipt || []).map((l) => `<li>${esc(l.text)}</li>`).join("");
}
// Added by By Mel Ross (0.28.0): drag a graphic along the timeline to move when it shows (its length stays the same)
let dragged = false;
$("#tl").addEventListener("pointerdown", (e) => {
  const blk = e.target.closest("[data-drag]"); if (!blk || S.busy) return;
  const i = cidx(blk.dataset.drag); if (i < 0) return;
  const c = S.edit.cards[i], len = (c.end ?? c.start + 2) - c.start, x0 = e.clientX, left0 = blk.offsetLeft;
  let t = c.start; dragged = false; blk.setPointerCapture(e.pointerId); blk.classList.add("dragging");
  const move = (ev) => { const dx = ev.clientX - x0; if (Math.abs(dx) > 3) dragged = true; if (!dragged) return;
    t = Math.round(Math.max(0, Math.min(S.total - 0.3, c.start + dx / PX)) * 10) / 10; blk.style.left = left0 + (t - c.start) * PX + "px"; $("#clock").textContent = fmt(t); };
  const up = async () => { blk.removeEventListener("pointermove", move); blk.classList.remove("dragging");
    if (!dragged || Math.abs(t - c.start) < 0.05) return;
    await op({ op: "card_set", i, set: { start: t, end: Math.min(+(t + len).toFixed(2), S.total) } }, null, `Moved to ${fmt(t)}`); };
  blk.addEventListener("pointermove", move); blk.addEventListener("pointerup", up, { once: true });
});
$("#tl").addEventListener("click", (e) => { if (dragged) { dragged = false; return; } const r = $("#tli").getBoundingClientRect(); v.currentTime = Math.max(0, Math.min((e.clientX - r.left) / PX, v.duration || S.total)); });
v.addEventListener("timeupdate", () => {
  const t = v.currentTime; $("#clock").textContent = fmt(t);
  const ph = $("#ph"); if (ph) { ph.style.left = t * PX + "px";      // keep the playhead in view while it plays
    const box = $("#tl"), at = t * PX; if (!v.paused && (at < box.scrollLeft + 20 || at > box.scrollLeft + box.clientWidth - 40)) box.scrollLeft = Math.max(at - 40, 0); }
  document.querySelectorAll(".w.now").forEach((n) => n.classList.remove("now"));
  if (S && !S.cutsStale) { let best = null; for (const [ci, c] of S.edit.captions.entries()) for (const [wi, w] of c.words.entries()) if (w.t <= t) best = [ci, wi];
    if (best) { const n = document.querySelector(`.w[data-ci="${best[0]}"][data-wi="${best[1]}"]`); if (n) n.classList.add("now"); } }
});
$("#ver").addEventListener("change", (e) => { watch = +e.target.value; renderVideo(); });
$("#nowBtn").addEventListener("click", () => toast(`Video time ${fmt(v.currentTime)}`));

// ---- captions
function renderCaps() {
  const caps = S.edit.captions;
  $("#capn").textContent = `${caps.length} lines`;
  $("#caps").innerHTML = caps.map((c, ci) => `<div class="cap"><button class="tm" data-a="seek" data-t="${c.start}">${fmt(c.start)}</button>`
    + c.words.map((w, wi) => `<button class="w${w.accent ? " acc" : ""}${capSel && capSel[0] === ci && capSel[1] === wi ? " sel" : ""}" data-a="word" data-ci="${ci}" data-wi="${wi}">${esc(w.text)}</button>`).join("")
    + (capSel && capSel[0] === ci ? wordEditor(c.words[capSel[1]]) : "") + `</div>`).join("");
}
function wordEditor(w) {
  return `<div class="edit"><label class="f">Fix this word</label><input type="text" id="wtext" value="${esc(w.text)}" autocapitalize="off" autocomplete="off" />
    <label class="row" style="margin-top:10px"><span class="sw"><input type="checkbox" id="wacc" ${w.accent ? "checked" : ""}><i></i></span><span>Highlight it (sage)</span></label>
    <label class="row" style="margin-top:8px"><span class="sw"><input type="checkbox" id="walways"><i></i></span><span>Always fix this word, in every reel <small class="small">(adds it to the word list)</small></span></label>
    <div class="row" style="margin-top:10px"><button class="pri grow" data-a="word-save">Save word</button><button class="grow" data-a="word-cancel">Cancel</button></div></div>`;
}

// ---- cuts
function renderPieces() {
  const ps = S.pieces; $("#cutn").textContent = `${ps.filter((p) => p.kept).length} of ${ps.length} kept`;
  let h = "";
  ps.forEach((p, k) => {
    if (k > 0 && p.gapBefore > 0.02) h += `<div class="gap">↳ already cut out earlier: ${p.gapBefore.toFixed(1)} s${p.gapLabel ? " (" + esc(p.gapLabel) + ")" : ""}</div>`;
    h += `<div class="piece${p.kept ? "" : " dropped"}"><label class="sw"><input type="checkbox" data-a="piece" data-id="${p.id}" ${p.kept ? "checked" : ""} ${running() ? "disabled" : ""}><i></i></label>
      <div class="tt"><b>${p.kept ? `${fmt(p.start)} – ${fmt(p.end)}` : "Dropped"} · ${p.dur.toFixed(1)} s</b>${esc(p.text || "(no words)")}</div>${p.kept ? `<button class="sm" data-a="seek" data-t="${p.start}">▶</button>` : ""}</div>`;
  });
  $("#pieces").innerHTML = h;
}

// ---- cards (pills / text / stickers)
const TYPE_NAME = { tag: "Pill", title: "Title", cta: "Call to action", card: "List card", sticker: "Sticker", image: "Photos", shot: "Screenshot", block: "Color block", page: "Page", motion: "Motion", follow: "Word-by-word", popup: "Popup", orbit: "Circling my head", quote: "Quote box", chips: "Number chips", columns: "Columns", note: "Taped note", polaroids: "Photo cards", tiles: "Icon tiles", stat: "Number card", xlist: "Check list", arctitle: "Arched title", chapter: "Chapter card", split: "Split screen", inset: "Slide with my face", roundup: "Roundup" };
const effLayer = (c) => c.layer || S.textDefault.layer || "front";
function cardIndexes(pred) { return S.edit.cards.map((c, i) => [c, i]).filter(([c]) => pred(c)); }
function renderCards() {
  const list = cardIndexes((c) => c.type !== "popup" && c.type !== "orbit");
  $("#txtn").textContent = `${list.length} items`;
  $("#cards").innerHTML = list.length ? list.map(([c, i]) => cardHtml(c, i)).join("") : `<p class="help">No text in this video yet.</p>`;
}
function times(c, i) {
  return `<div class="two"><div><label class="f">Starts at (seconds)</label><div class="tin"><input type="number" step="0.1" min="0" data-a="set" data-i="${i}" data-f="start" value="${c.start}"><button class="sm" data-a="stamp" data-i="${i}" data-f="start" title="Use video time">⏱</button></div></div>
    <div><label class="f">Ends at (seconds)</label><div class="tin"><input type="number" step="0.1" min="0" data-a="set" data-i="${i}" data-f="end" value="${c.end ?? ""}"><button class="sm" data-a="stamp" data-i="${i}" data-f="end" title="Use video time">⏱</button></div></div></div>`;
}
function cardHtml(c, i) {
  const open = openCard.has(cid(i)), name = TYPE_NAME[c.type] || c.type, lab = c.text || c.title || (Array.isArray(c.src) ? c.src[0] : c.src) || "";
  let h = `<div class="item${c.off ? " off" : ""}"><div class="hd"><label class="sw"><input type="checkbox" data-a="toggle" data-i="${i}" ${c.off ? "" : "checked"} ${running() ? "disabled" : ""}><i></i></label>
    <div class="tt" data-a="open" data-i="${i}" style="cursor:pointer">${esc(lab || name)}<small>${name} · ${fmt(c.start)}${c.end != null ? " – " + fmt(c.end) : ""}${isTextType(c.type) ? " · " + (effLayer(c) === "front" ? "in front of me" : effLayer(c) === "behind" ? "behind me" : "weaves around me") : ""}</small></div>
    <button class="sm" data-a="open" data-i="${i}">${open ? "Close" : "Edit"}</button></div>`;
  if (open) {
    h += `<div class="edit">`;
    if (c.type === "tag" || c.type === "title" || c.type === "cta" || c.type === "quote") {
      h += `<label class="f">Text</label><input type="text" data-a="set" data-i="${i}" data-f="text" value="${esc(c.text)}" />`;
      if (c.type === "tag" && (c.text || "").length > 24) h += `<p class="warnt">Long text can run off the edge of the screen.</p>`;
    }
    if (c.type === "arctitle") {   // 0.23.0: an arched title's words can be changed here
      h += `<label class="f">Arched words</label><input type="text" data-a="set" data-i="${i}" data-f="text" value="${esc(c.text)}" />
        <label class="f">Line under it (optional)</label><input type="text" maxlength="30" data-a="set" data-i="${i}" data-f="sub" value="${esc(c.sub || "")}" placeholder="e.g. part one" />`;
      if (c.trail) h += `<p class="help">Gold sparkles follow your hand while the words arrive. They need a Mac to track your hand.</p>`;
    }
    const WORDS = { stat: [["value", "The number"], ["label", "Words above it"], ["delta", "The change (optional)"]], page: [["label", "Label"]], tiles: [["label", "Title"]], chapter: [["text", "Chapter name"]], inset: [["title", "Words on the slide"]] };   // 0.28.0
    if (WORDS[c.type]) h += WORDS[c.type].map(([f, name]) => `<label class="f">${name}</label><input type="text" data-a="set" data-i="${i}" data-f="${f}" value="${esc(c[f] ?? "")}" />`).join("");
    if (c.type === "xlist") h += `<label class="f">Lines (one per line, up to 6)</label><textarea rows="${Math.max((c.items || []).length, 3)}" data-a="items" data-i="${i}" style="width:100%;box-sizing:border-box;font:inherit;padding:10px;border-radius:10px;border:1.5px solid var(--line)">${esc((c.items || []).join("\n"))}</textarea>`;
    if (c.type === "card") {   // 0.16.0: a list's title and rows can be changed here
      h += `<label class="f">List title</label><input type="text" data-a="set" data-i="${i}" data-f="title" value="${esc(c.title || "")}" />
        <label class="f">Rows (one per line, up to 6)</label><textarea rows="${Math.max((c.rows || []).length, 3)}" data-a="rows" data-i="${i}" style="width:100%;box-sizing:border-box;font:inherit;padding:10px;border:1.5px solid var(--line);border-radius:12px">${esc((c.rows || []).map((r) => typeof r === "string" ? r : r?.text ?? "").join("\n"))}</textarea>`;
    }
    h += times(c, i);
    if (isTextType(c.type)) {
      const L = effLayer(c);
      h += `<label class="f">Layer</label><div class="seg"><button class="${L === "front" ? "on" : ""}" data-a="layer" data-i="${i}" data-v="front">In front of me</button><button class="${L === "behind" ? "on" : ""}" data-a="layer" data-i="${i}" data-v="behind">Behind me</button></div>`
        + (L === "behind" ? `<p class="warnt">Text behind you needs space above your head. If your face fills the frame, the text is hidden. If the outline around you isn't clean in this part, the text goes in front and the page tells you after the render.</p>` : "")
        + (c.layer == null ? `<p class="small">Using your default (${S.textDefault.layer === "front" ? "in front" : S.textDefault.layer}).</p>` : "");
    }
    if (c.type === "tag" || c.type === "title" || c.type === "cta" || c.type === "quote") {
      const y = c.y ?? (c.type === "tag" ? 130 : 360);
      h += `<label class="f">Height on screen</label><div class="grid3">${[[130, "Above my head"], [300, "Higher"], [800, "Middle"], [1050, "Lower"], [1150, "Above captions"]].map(([yy, n]) => `<button class="${Math.abs(y - yy) < 20 ? "on" : ""}" data-a="set" data-i="${i}" data-f="y" data-v="${yy}">${n}</button>`).join("")}<button class="${placing && placing.id === cid(i) ? "on" : ""}" data-a="place" data-i="${i}">Tap on video</button></div>`;
    }
    if (c.type === "title") {   // Added by By Mel Ross (0.34.9): a hook can sit in the top-left corner or centred
      const al = c.align || S.titleAlign || "center";
      h += `<label class="f">Line up</label><div class="seg" id="alignseg">${[["left", "Left"], ["center", "Centred"], ["right", "Right"]].map(([v, n]) => `<button class="${al === v ? "on" : ""}" data-a="set" data-i="${i}" data-f="align" data-v="${v}">${n}</button>`).join("")}</div>`;
    }
    if (c.type === "sticker") h += `<p class="help">Stickers: change time or switch off here. Position and size are in the edit.</p>`;
    h += `<div class="row" style="margin-top:12px"><button class="sm" data-a="seek" data-t="${c.start}">▶ Go to start</button><span class="grow"></span><button class="sm danger" data-a="del" data-i="${i}">Delete</button></div></div>`;
  }
  return h + `</div>`;
}

// ---- popups
function renderPopups() {
  const list = cardIndexes((c) => c.type === "popup" || c.type === "orbit");
  $("#popn").textContent = `${list.length} items`;
  $("#popups").innerHTML = list.length ? list.map(([c, i]) => (c.type === "orbit" ? orbitHtml(c, i) : popupHtml(c, i))).join("") : `<p class="help">No popups yet.</p>`;
  renderOrbitPick(); renderGiphy();
  const spare = S.popups.filter((p) => !S.edit.cards.some((c) => c.src === p.src));
  $("#reuse").innerHTML = S.popups.length ? `<label class="f">One you already added to this reel</label><select id="reusePick"><option value="">Pick a file to use it again…</option>${S.popups.map((p) => `<option value="${esc(p.src)}">${esc(p.src.replace("popups/", ""))}${p.video ? " (video clip)" : p.animated ? " (GIF)" : ""}</option>`).join("")}</select>` : "";
}
function popupHtml(c, i) {
  const open = openCard.has(cid(i)), m = S.media[c.src] || { w: 1, h: 1 };
  let h = `<div class="item${c.off ? " off" : ""}"><div class="hd"><label class="sw"><input type="checkbox" data-a="toggle" data-i="${i}" ${c.off ? "" : "checked"} ${running() ? "disabled" : ""}><i></i></label>
    ${thumb(c.src)}
    <div class="tt" data-a="open" data-i="${i}" style="cursor:pointer">${esc(c.src.replace(/^popups\/[^-]*-/, "").replace(/\.clip\.mp4$/, ""))}<small>${isClip(c.src) ? "Video clip · " : m.animated ? "GIF · " : ""}${fmt(c.start)} – ${fmt(c.end)} · ${esc(({ center: "middle", "side-left": "left of a pair", "side-right": "right of a pair" })[c.pos || "center"] || c.pos)}${c.layer === "behind" ? " · behind my head" : ""}</small></div>
    <button class="sm" data-a="open" data-i="${i}">${open ? "Close" : "Edit"}</button></div>`;
  if (open) {
    const P = [["top-left", "Top left"], ["top-center", "Top, above head"], ["top-right", "Top right"], ["middle-left", "Left"], ["center", "Middle"], ["middle-right", "Right"], ["side-left", "Left of a pair"], ["side-right", "Right of a pair"]];
    const here = c.pos || "center", L = c.layer === "behind" ? "behind" : "front";
    h += `<div class="edit">${times(c, i)}<label class="f">Where</label><div class="grid3">${P.map(([k, n]) => `<button class="${here === k ? "on" : ""}" data-a="set" data-i="${i}" data-f="pos" data-v="${k}">${n}</button>`).join("")}
      <button class="${(c.pos === "custom") ? "on" : ""}" data-a="place" data-i="${i}">Tap on video</button></div>
      <p class="small">Middle covers part of your face. The top corners keep it clear of your face. The pair spots put 2 pictures side by side.</p>
      <label class="f">In front or behind</label><div class="seg"><button class="${L === "front" ? "on" : ""}" data-a="layer" data-i="${i}" data-v="front">In front of my face</button><button class="${L === "behind" ? "on" : ""}" data-a="layer" data-i="${i}" data-v="behind">Behind my head</button></div>
      ${L === "behind" ? `<p class="warnt">Behind your head needs the outline of you that only a Mac makes. If the outline isn't clean in this part, it goes in front and the page tells you after the render.</p>` : ""}
      <label class="f">Handwritten label under it (optional)</label><input type="text" maxlength="40" data-a="set" data-i="${i}" data-f="caption" value="${esc(c.caption || "")}" placeholder="e.g. post it" />
      <label class="f">Size: ${c.size || (isClip(c.src) ? 440 : 360)}px wide</label><input type="range" min="120" max="800" step="10" value="${c.size || (isClip(c.src) ? 440 : 360)}" data-a="range" data-i="${i}" data-f="size" style="width:100%">
      <label class="f">Tilt: ${c.rotate || 0}°</label><input type="range" min="-30" max="30" step="1" value="${c.rotate || 0}" data-a="range" data-i="${i}" data-f="rotate" style="width:100%">
      ${isClip(c.src) ? `<label class="f">Start the clip at: ${c.from || 0} seconds in</label><input type="range" min="0" max="120" step="0.5" value="${c.from || 0}" data-a="range" data-i="${i}" data-f="from" style="width:100%">
      <label class="row" style="margin-top:10px"><span class="sw"><input type="checkbox" data-a="loop" data-i="${i}" ${c.loop ? "checked" : ""}><i></i></span><span>Start again if the clip is shorter than its time on screen</span></label>
      <p class="small">The clip plays without sound. Your voice stays the only audio.</p>`
      : `<label class="row" style="margin-top:10px"><span class="sw"><input type="checkbox" data-a="frame" data-i="${i}" ${(c.frame ?? /\.jpe?g$/i.test(c.src)) ? "checked" : ""}><i></i></span><span>White photo border</span></label>`}
      <div class="row" style="margin-top:12px"><button class="sm" data-a="seek" data-t="${c.start}">▶ Go to start</button><span class="grow"></span><button class="sm danger" data-a="del" data-i="${i}">Delete</button></div></div>`;
  }
  return h + `</div>`;
}

// ---- sounds
function renderSfx() {
  const list = S.edit.sfx_events; $("#sfxn").textContent = `${list.length} sounds`;
  $("#sfx").innerHTML = list.length ? list.map((e, i) => `<div class="item${e.off ? " off" : ""}"><div class="hd"><label class="sw"><input type="checkbox" data-a="sfx-toggle" data-i="${i}" ${e.off ? "" : "checked"} ${running() ? "disabled" : ""}><i></i></label>
    <div class="tt">${esc(e.name)}<small>at ${fmt(e.t)} · ${e.db ?? -10} dB</small></div><button class="sm" data-a="sfx-open" data-i="${i}">${openSfx.has(sid(i)) ? "Close" : "Edit"}</button></div>
    ${openSfx.has(sid(i)) ? `<div class="edit"><label class="f">Sound</label><select data-a="sfx-set" data-i="${i}" data-f="name">${S.sfxNames.map((n) => `<option ${n.name === e.name ? "selected" : ""} value="${n.name}">${n.name}${n.category ? " (" + n.category + ")" : ""}</option>`).join("")}</select>
      <div class="two"><div><label class="f">Time (s)</label><div class="tin"><input type="number" step="0.1" data-a="sfx-set" data-i="${i}" data-f="t" value="${e.t}"><button class="sm" data-a="sfx-stamp" data-i="${i}">⏱</button></div></div>
      <div><label class="f">Volume (0 is loudest, -20 is quiet)</label><input type="number" step="1" max="0" min="-40" data-a="sfx-set" data-i="${i}" data-f="db" value="${e.db ?? -10}"></div></div>
      <div class="row" style="margin-top:12px"><span class="grow"></span><button class="sm" data-a="sfx-play" data-i="${i}">Play this sound</button><button class="sm danger" data-a="sfx-del" data-i="${i}">Delete</button></div></div>` : ""}</div>`).join("") : `<p class="help">No extra sound effects in this video.</p>`;
}

// ---- pictures that circle your head (Added by By Mel Ross, 0.9.0)
const isClip = (src) => /\.(mp4|mov|m4v|webm)$/i.test(String(src || ""));   // Added by By Mel Ross (0.13.0): a popup can be a video clip
const thumb = (src) => isClip(src) ? `<video src="/files/${esc(src)}#t=0.5" muted playsinline preload="metadata" style="width:44px;height:44px;object-fit:cover;border-radius:8px;background:#eee"></video>`
  : `<img src="/files/${esc(src)}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;background:#eee" alt="" />`;
function orbitHtml(c, i) {
  const open = openCard.has(cid(i)), n = c.src.length;
  let h = `<div class="item${c.off ? " off" : ""}"><div class="hd"><label class="sw"><input type="checkbox" data-a="toggle" data-i="${i}" ${c.off ? "" : "checked"} ${running() ? "disabled" : ""}><i></i></label>
    ${thumb(c.src[0])}
    <div class="tt" data-a="open" data-i="${i}" style="cursor:pointer">Circling my head<small>${n} picture${n > 1 ? "s" : ""} · ${fmt(c.start)} – ${fmt(c.end)}</small></div>
    <button class="sm" data-a="open" data-i="${i}">${open ? "Close" : "Edit"}</button></div>`;
  if (open) {
    const lv = c.level || "crown";
    h += `<div class="edit">${times(c, i)}<label class="f">Where the ring goes</label><div class="seg"><button class="${lv === "crown" ? "on" : ""}" data-a="set" data-i="${i}" data-f="level" data-v="crown">Top of my head</button><button class="${lv === "chest" ? "on" : ""}" data-a="set" data-i="${i}" data-f="level" data-v="chest">Below my chin</button></div>
      <label class="f">One lap every: ${c.period || 4} seconds</label><input type="range" min="2" max="8" step="0.5" value="${c.period || 4}" data-a="range" data-i="${i}" data-f="period" style="width:100%">
      <label class="f">Size: ${c.size || "auto"}${c.size ? "px wide" : ""}</label><input type="range" min="100" max="300" step="10" value="${c.size || 170}" data-a="range" data-i="${i}" data-f="size" style="width:100%">
      <p class="small">The pictures pass behind your head and in front of it. This needs the outline of you that only a Mac makes; without it they show in front only. You see it after a re-render.</p>
      <div class="row" style="margin-top:12px"><button class="sm" data-a="seek" data-t="${c.start}">▶ Go to start</button><span class="grow"></span><button class="sm danger" data-a="del" data-i="${i}">Delete</button></div></div>`;
  }
  return h + `</div>`;
}
let orbitOpen = false; const orbitSel = new Set();
function renderOrbitPick() {
  const box = $("#orbitPick"); if (!box) return;
  for (const s of [...orbitSel]) if (!S.popups.some((p) => p.src === s)) orbitSel.delete(s);
  if (!orbitOpen) { box.innerHTML = ""; return; }
  if (!S.popups.length) { box.innerHTML = `<p class="help">Add your pictures first with the button above. Then come back and pick up to 6.</p>`; return; }
  box.innerHTML = `<label class="f">Pick 1 to 6 pictures</label><div class="grid3">${S.popups.filter((p) => !p.video).map((p) => `<button class="${orbitSel.has(p.src) ? "on" : ""}" data-a="orbit-pick" data-v="${esc(p.src)}" style="padding:6px">${thumb(p.src)}</button>`).join("")}</div>
    <div class="row" style="margin-top:10px"><button class="pri grow" data-a="orbit-add" ${orbitSel.size ? "" : "disabled"}>Add ${orbitSel.size || ""} at this point in the video</button><button class="grow" data-a="orbit-cancel">Cancel</button></div>`;
}

// ---- GIPHY search (Added by By Mel Ross, 0.9.0). The search goes from this page straight to GIPHY, with your own key.
// Opt-in with a warning (license review 2026-11-17): nothing is saved until the box is ticked.
const GIPHY_WARN = "Before you turn GIPHY on: GIPHY's rules say apps should not store copies of GIPHY content. To build your video, Reel Studio has to keep a copy of each GIF you pick in your reel folder, so a reel you post with one may go against GIPHY's rules. Many GIFs are also clips from films, TV or sport that you may not have the right to use in a reel for your business. GIPHY is off unless you turn it on, and you use it at your own risk.";
const GIPHY_SHORT = "GIPHY's rules say not to store copies of its GIFs, and a reel you post with one may conflict with them. Many GIFs are film or TV clips. Use at your own risk.";
const GIPHY_MARK = `<p class="giphy-mark" aria-label="Powered By GIPHY"><span>Powered By</span> <b>GIPHY</b></p>`;
let giphy = { q: "", kind: "gifs", items: [], busy: false, note: "" };
function renderGiphy() {
  const box = $("#giphy"); if (!box) return;
  if (!S.giphy) {   // 0.15.0: the page takes the key and saves it on this computer
    if (box.querySelector("#gkey")) return;   // keep what they are typing
    box.innerHTML = `<label class="f">From GIPHY, a free library of GIFs</label><p class="giphy-warn" role="note"><b>Off until you turn it on.</b> ${esc(GIPHY_WARN)}</p><p class="help">To turn it on you need a free key, once. <a href="https://developers.giphy.com/dashboard/" target="_blank" rel="noopener">Get one at developers.giphy.com</a>. Choose API (not SDK), copy the key, and paste it here.</p>
      <div class="row"><input type="password" id="gkey" placeholder="Paste your GIPHY key" autocomplete="off" aria-label="Your GIPHY key" class="grow" style="font:inherit;padding:10px 12px;border:1.5px solid var(--line);border-radius:12px;min-width:0" /><button class="sm" data-a="giphy-key">Save key</button></div>
      <label class="row small" style="gap:6px;margin-top:6px"><input type="checkbox" id="gagree"> I have read the warning and want GIPHY search on</label><p class="small" id="gkeymsg"></p>${GIPHY_MARK}`;
    return;
  }
  box.innerHTML = `<label class="f">From GIPHY, a free library of GIFs</label><div class="row"><input type="text" id="gq" value="${esc(giphy.q)}" placeholder="Type what you want, e.g. thumbs up" autocapitalize="off" class="grow" /><button class="sm" data-a="giphy-go">Search</button></div>
    <div class="seg" style="margin-top:8px"><button class="${giphy.kind === "gifs" ? "on" : ""}" data-a="giphy-kind" data-v="gifs">GIFs</button><button class="${giphy.kind === "stickers" ? "on" : ""}" data-a="giphy-kind" data-v="stickers">Stickers (no background)</button></div>
    ${giphy.note ? `<p class="small">${esc(giphy.note)}</p>` : ""}
    ${giphy.items.length ? `<div class="grid3" style="margin-top:8px">${giphy.items.map((g) => `<button data-a="giphy-add" data-v="${esc(g.id)}" style="padding:4px" title="${esc(g.title)}"><img src="${esc(g.preview)}" alt="${esc(g.title)}" style="width:100%;border-radius:8px;display:block" /></button>`).join("")}</div>
` : ""}
    ${GIPHY_MARK}<p class="giphy-warn small" role="note">${esc(GIPHY_SHORT)}</p>
    <p class="small">GIFs are moving pictures with a background. Stickers have no background, so they sit over your video. Your search words are sent to GIPHY. Many GIFs are clips from films and TV, so check you are allowed to use one before it goes in a reel for your business.</p>`;
}
async function saveGiphyKey() {
  const msg = $("#gkeymsg"), key = ($("#gkey")?.value || "").trim(); if (msg) msg.textContent = "Checking the key…";
  try {
    const r = await fetch("/api/giphy-key-save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, agree: !!$("#gagree")?.checked }) }), j = await r.json();
    if (!j.ok) throw new Error(j.error || "couldn't save it");
    $("#giphy").innerHTML = ""; if (j.state) S = j.state; else S.giphy = true;
    giphy.note = j.tested ? "GIPHY is connected." : "Key saved. This computer couldn't reach GIPHY to test it yet."; render(); toast(giphy.note);
  } catch (er) { if (msg) msg.textContent = er.message; toast(er.message, true); }
}
async function giphySearch() {
  const q = ($("#gq")?.value || "").trim(); giphy.q = q; if (!q) return;
  giphy.busy = true; giphy.note = "Searching…"; renderGiphy();
  try {
    const { key } = await (await fetch("/api/giphy-key")).json();
    const u = new URL(`https://api.giphy.com/v1/${giphy.kind}/search`); u.search = new URLSearchParams({ api_key: key, q, limit: "12", rating: "g", bundle: "messaging_non_clips" });
    const r = await fetch(u); if (r.status === 429) throw new Error("GIPHY's hourly limit is used up for this key: try again later");
    if (!r.ok) throw new Error(`GIPHY said no (${r.status}): check the key`);
    const j = await r.json();
    giphy.items = (j.data || []).map((d) => ({ id: d.id, title: d.title || "", preview: d.images?.fixed_width_small?.url || d.images?.fixed_width?.url || "" })).filter((g) => /^https:\/\/[\w-]+\.giphy\.com\//.test(g.preview));
    giphy.note = giphy.items.length ? "Tap one to add it at this point in the video." : "Nothing found.";
  } catch (er) { giphy.items = []; giphy.note = er.message; }
  giphy.busy = false; renderGiphy();
}

// ---- settings, versions
function renderSettings() {
  loadRecs();
  const L = S.textDefault.layer || "front";
  const cur = S.theme?.reel ?? S.theme?.all ?? "", all = !S.theme?.reel;
  const themeBox = (S.themes || []).length ? `<label class="f">Look (theme)</label><select id="themePick"><option value="">My brand as it is</option>${S.themes.map((t) => `<option value="${esc(t.id)}" ${t.id === cur ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>
    <div class="seg" style="margin-top:8px"><button class="${all ? "" : "on"}" data-a="theme-scope" data-v="reel">This reel only</button><button class="${all ? "on" : ""}" data-a="theme-scope" data-v="all">Every reel</button></div>
    <p class="help" style="margin-top:8px">${esc((S.themes.find((t) => t.id === cur) || {}).summary || "A theme changes the fonts, captions, titles and card shapes together. Your colors and name stay.")} The live preview shows it in a few seconds; the video changes when you render.</p>
    <p class="help" style="margin-top:8px"><button class="sm" data-a="see-themes" ${TPS.state === "running" ? "disabled" : ""}>${TPS.state === "idle" ? "See them on my clip" : "Make them again"}</button> ${esc(TPS.note || "One still of each theme on this reel, at the same moment. About a minute.")}</p>
    ${Object.keys(TPS.stills).length ? `<div class="tpgrid">${[["", "My brand as it is"], ...S.themes.map((t) => [t.id, t.name])].filter(([id]) => TPS.stills[id] !== undefined).map(([id, name]) => `<button class="tpb${id === cur ? " on" : ""}" data-a="theme-pick" data-v="${esc(id)}" title="Use ${esc(name)}"><img src="${esc(TPS.stills[id])}" alt="${esc(name)} on this reel" /><span>${esc(name)}</span></button>`).join("")}</div>` : ""}<hr style="border:0;border-top:1px solid var(--line);margin:14px 0">` : "";
  const C = { ...S.colors.all, ...(S.colors.reel || {}) }, mine = !!S.colors.reel;
  const NAMES = [["main", "Main", "text and dark shapes"], ["pop", "Pop", "highlighted words and accents"], ["light", "Light", "card backgrounds"]];
  const colorBox = `<label class="f">Colors</label><div class="grid3">${NAMES.map(([k, n, what]) => `<label style="display:block;text-align:center"><input type="color" data-color="${k}" value="${esc(C[k])}" style="width:100%;height:48px;padding:0;border:1.5px solid var(--line);border-radius:12px;background:#fff"><span class="small" style="display:block"><b>${n}</b>: ${what}</span></label>`).join("")}</div>
    <div class="seg" style="margin-top:8px"><button class="on" data-a="colors-save" data-v="reel">Use for this reel</button><button data-a="colors-save" data-v="all">Use for every reel</button></div>
    ${mine ? `<button class="sm" data-a="colors-reset" style="margin-top:8px">Back to my brand colors</button>` : ""}
    <p class="help" style="margin-top:8px">${mine ? "This reel has its own colors." : "This reel uses your brand colors."} Every look uses these 3 colors, so changing them changes any look. Pick, press a button, then re-render to see it.</p><hr style="border:0;border-top:1px solid var(--line);margin:14px 0">`;
  // Added by By Mel Ross (0.23.0): the highlighted caption word: text color, and a box behind it you can switch on.
  const H = { ...S.highlight.base, ...S.highlight.all, ...(S.highlight.reel || {}) }, hMine = !!(S.highlight.reel || S.highlight.handwritten), cBox = H.box && H.box !== "none", hBox = H.bg && H.bg !== "none";
  const pick = (id, val, name, off) => `<label style="display:block;text-align:center"><input type="color" id="${id}" value="${esc(val)}" ${off ? "disabled" : ""} style="width:100%;height:48px;padding:0;border:1.5px solid var(--line);border-radius:12px;background:#fff"><span class="small" style="display:block"><b>${name}</b></span></label>`;
  const hlBox = `<label class="f">Caption colors and size</label>
    <div id="hlsample" style="background:#5d6b63;border-radius:12px;padding:14px;text-align:center;font:800 26px/1.2 var(--f-body, system-ui);color:${esc(H.words)}"><span class="cb2" style="${cBox ? `background:${esc(H.box)};` : ""}padding:.05em .25em;border-radius:.2em;box-decoration-break:clone;-webkit-box-decoration-break:clone">this is the <span id="hlword" style="color:${esc(H.text)};${hBox ? `background:${esc(H.bg)};` : ""}padding:.02em .2em .08em;border-radius:.16em">word</span></span></div>
    <div class="grid3" style="margin-top:8px">${pick("hlWords", H.words, "Words")}${pick("hlText", H.text, "Highlighted word")}${pick("hlBg", hBox ? H.bg : "#FFFFFF", "Box", !hBox)}</div>
    <label style="display:flex;align-items:center;gap:8px;margin-top:8px"><input type="checkbox" id="hlOn" ${hBox ? "checked" : ""}><span class="small"><b>Put a box behind the highlighted word</b></span></label>
    <div class="grid3" style="margin-top:8px;align-items:center"><label style="display:flex;align-items:center;gap:8px;grid-column:span 2"><input type="checkbox" id="cbOn" ${cBox ? "checked" : ""}><span class="small"><b>Put a box behind all the words</b></span></label>${pick("cbColor", cBox && /^#/.test(H.box) ? H.box : "#FFFFFF", "Box behind all", !cBox)}</div>
    <label class="f" style="margin-top:8px">Caption size <span class="small" id="csz">${H.size}</span></label><input type="range" id="cSize" min="60" max="160" step="2" value="${H.size}" style="width:100%">
    <p class="help" id="hlwarn" style="margin-top:8px;color:#b3261e" hidden>Some of these colors are too close to read: a word and the box behind it.</p>
    <div class="seg" style="margin-top:8px"><button class="on" data-a="hl-save" data-v="reel">Use for this reel</button><button data-a="hl-save" data-v="all">Use for every reel</button></div>
    ${hMine ? `<button class="sm" data-a="hl-reset" style="margin-top:8px">Back to my usual</button>` : ""}
    <p class="help" style="margin-top:8px">${hMine ? "This reel has its own caption colors." : "This reel uses your usual caption colors."} A highlighted word is one you marked in the Captions list. Pick, then press a button.</p><hr style="border:0;border-top:1px solid var(--line);margin:14px 0">`;
  // Added by By Mel Ross (0.28.0): add a look from the Style Menu at the playhead
  if ($("#addlook")) $("#addlook").innerHTML = (S.addLooks || []).length ? `<label class="f">Add a look at this point in the video</label>
    <div class="row" style="gap:8px"><select id="lookpick" style="flex:1;padding:10px;border-radius:10px;border:1.5px solid var(--line);font:inherit">${["Hooks", "Layouts"].map((g) => `<optgroup label="${g}">${S.addLooks.filter((l) => (l.group || "").startsWith(g.slice(0, 4))).map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join("")}</optgroup>`).join("")}</select>
    <button class="sm" data-a="look-add">Add</button></div>
    <p class="help" style="margin-top:6px">Pause where you want it, pick a look, press Add. It comes in with sample words: tap it in the list to change them.</p>
    ${RECS.state === "done" && RECS.picks.length ? `<label class="f" style="margin-top:12px">Recommended for this reel</label>${RECS.picks.map((p) => `<div class="recp"><div><b>${esc(p.kind === "theme" ? p.name + " theme" : p.name)}</b><span>${esc(p.why)}</span></div><button class="sm" data-a="rec-use" data-k="${esc(p.kind)}" data-v="${esc(p.id)}">${p.kind === "theme" ? "Use" : "Add here"}</button></div>`).join("")}<p class="help">${esc(RECS.checked.length ? "Based on: " + RECS.checked.join("; ") + "." : "Safe picks: the reel couldn't be checked.")}</p>` : RECS.state === "running" ? `<p class="help" style="margin-top:12px">Looking at your reel for recommendations...</p>` : ""}` : "";
  // Added by By Mel Ross (0.28.0): background music for this reel
  const MU = S.music || { tracks: [], track: "", level: "normal" };
  const musicBox = `<label class="f">Background music</label>
    <select data-a="music-track" style="width:100%;padding:10px;border-radius:10px;border:1.5px solid var(--line);font:inherit">
      <option value="" ${MU.track ? "" : "selected"}>No music</option>${[...new Set(MU.tracks.map((t) => t.mood))].map((m) => `<optgroup label="${esc(m || "My tracks")}">${MU.tracks.filter((t) => t.mood === m).map((t) => `<option value="${esc(t.name)}" ${t.name === MU.track ? "selected" : ""}>${esc(t.name.replace(/^[^/]*\//, "").replace(/\.[^.]+$/, ""))}</option>`).join("")}</optgroup>`).join("")}</select>
    ${!MU.tracks.length ? `<p class="help">Your music folder is empty. Ask Claude: "help me add background music", or add a track below.</p>` : ""}
    ${MU.missing ? `<p class="help" style="color:#b3261e">The track "${esc(MU.track)}" isn't in your music folder any more, so the reel plays without music. Pick another.</p>` : ""}
    ${MU.track ? `<audio controls src="/music/${encodeURIComponent(MU.track)}" style="width:100%;margin-top:8px"></audio>
    <div class="seg" style="margin-top:8px">${["softer", "normal", "louder"].map((k) => `<button class="${MU.level === k ? "on" : ""}" data-a="music-level" data-v="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join("")}</div>
    <label class="f">Start the track at (seconds)</label><div class="row" style="gap:8px"><input type="number" id="mstart" min="0" max="600" step="0.5" value="${MU.start}" style="width:90px"><button class="sm" data-a="music-start">Save</button><button class="sm" data-a="music-start-here">Where the player above is</button></div>
    <p class="help" style="margin:6px 0">Skip a slow intro: play the track above, pause where it gets good, press "Where the player above is".</p>
    <button class="sm" data-a="music-all" style="margin-top:4px">Use this track for every reel</button>${MU.everyReel ? ` <span class="help">Every reel now: ${esc(MU.everyReel)}</span>` : ""}` : ""}
    <p class="help" style="margin:8px 0">The music dips while you talk and under each sound effect. Tracks live in ${esc(MU.dir || "~/reels/music")}. <label style="text-decoration:underline;cursor:pointer"><input type="file" id="addtrack" accept=".mp3,.m4a,.wav,.aac,.ogg,.flac,audio/*" hidden>Add a track</label>. Use music you're allowed to use, like tracks from Pixabay Music or Mixkit.</p>
    ${S.hasFinal ? `<button class="sm" data-a="remix">Update the sound on my finished reel</button><p class="help" style="margin:6px 0 12px">Hear a music change in about 20 seconds, without rendering the picture again.</p>` : ""}
    <hr style="border:0;border-top:1px solid var(--line);margin:14px 0">`;
  $("#sfxmaster").innerHTML = musicBox + `<label class="f">Sounds when graphics appear</label><div class="seg"><button class="${S.sfxOn ? "on" : ""}" data-a="sfx-master" data-v="on" data-s="reel">On</button><button class="${S.sfxOn ? "" : "on"}" data-a="sfx-master" data-v="off" data-s="reel">Off</button></div>
    <p class="help" style="margin:8px 0">${S.sfxOn ? "Each graphic plays a short sound as it comes on." : "Graphics come on silently in this reel."} For every reel you make: <button class="sm" data-a="sfx-master" data-v="on" data-s="all">always on</button> <button class="sm" data-a="sfx-master" data-v="off" data-s="all">always off</button> (now ${S.sfxAll ? "on" : "off"}). Sounds you place by hand below always play.</p>
    <p class="help" style="margin:8px 0"><b>Your voice and the sounds are balanced for you on every render.</b> Nothing to set.</p>
    <details style="margin:4px 0 12px"><summary class="small" style="cursor:pointer">Adjust the balance (optional)</summary>
    <label class="f">How loud the sounds are</label><div class="seg">${["quieter", "normal", "louder"].map((k) => `<button class="${S.sfxVol === k ? "on" : ""}" data-a="sfx-vol" data-v="${k}" data-s="reel">${k[0].toUpperCase() + k.slice(1)}</button>`).join("")}</div>
    <p class="help" style="margin:8px 0">Sounds already sit under your voice and dip while you talk. For every reel: <button class="sm" data-a="sfx-vol" data-v="quieter" data-s="all">quieter</button> <button class="sm" data-a="sfx-vol" data-v="normal" data-s="all">normal</button> <button class="sm" data-a="sfx-vol" data-v="louder" data-s="all">louder</button> (now ${S.sfxVolAll}).</p>
    ${S.hasFinal ? `<button class="sm" data-a="remix">Update the sound on my finished reel</button><p class="help" style="margin:6px 0 12px">Keeps the picture and mixes the sound again in about 20 seconds. Use it after changing sound settings, or on a reel rendered before 0.25.0. Anything else needs Re-render.</p>` : ""}</details>`;
  // Added by By Mel Ross (0.26.0): where captions sit
  const hi = S.layout === "captions-high";
  const layBox = `<label class="f">Where captions sit</label>
    <div class="seg"><button class="${hi ? "" : "on"}" data-a="layout" data-v="captions-low" data-s="reel">At the bottom</button><button class="${hi ? "on" : ""}" data-a="layout" data-v="captions-high" data-s="reel">Above my head</button></div>
    <p class="help" style="margin:8px 0">${hi ? "Captions sit above your head and text graphics move to the lower third." : "Captions sit at the bottom and text graphics sit near the top."} For every reel: <button class="sm" data-a="layout" data-v="captions-low" data-s="all">bottom</button> <button class="sm" data-a="layout" data-v="captions-high" data-s="all">above my head</button> (now ${S.layoutAll === "captions-high" ? "above my head" : "bottom"}). To move captions for part of a reel, use the Captions tab on the review page.</p>
    <label class="f">When captions appear</label>
    <div class="seg">${[[0, "On the word"], [0.1, "0.1 s early"], [0.2, "0.2 s early"], [0.3, "0.3 s early"]].map(([v, t]) => `<button class="${Math.abs((S.captionLead || 0) - v) < 0.001 ? "on" : ""}" data-a="lead" data-v="${v}" data-s="reel">${t}</button>`).join("")}</div>
    <p class="help" style="margin:8px 0">If captions show up after you say the word, pick an earlier one and re-render. For every reel: ${[0, 0.1, 0.2].map((v) => `<button class="sm" data-a="lead" data-v="${v}" data-s="all">${v ? v + " s early" : "on the word"}</button>`).join(" ")} (now ${S.captionLeadAll ? S.captionLeadAll + " s early" : "on the word"}).</p><hr style="border:0;border-top:1px solid var(--line);margin:14px 0">`;
  $("#settings").innerHTML = themeBox + colorBox + layBox + hlBox + `<label class="f">Where text goes by default (every reel)</label><div class="seg"><button class="${L === "front" ? "on" : ""}" data-a="default" data-v="front">In front of me</button><button class="${L === "behind" ? "on" : ""}" data-a="default" data-v="behind">Behind me</button></div>
    <p class="help" style="margin-top:8px">Text sits in the top area above your head. This only sets the layer new text starts on; you can change any single piece of text. ${S.hasTextDefault ? "" : "(Not saved in the brand file yet: the built-in default is in front.)"}</p>`;
}
function renderVersions() {
  $("#vern").textContent = `${S.renders.length}`;
  $("#versions").innerHTML = S.renders.length ? S.renders.slice().reverse().map((r) => `<div class="item"><div class="hd"><div class="tt">${r.baseline ? "Before editing" : "Render " + r.v}<small>${esc(new Date(r.at).toLocaleString())} · ${r.len ? fmt(r.len) : ""} · ${esc(r.what || "")}${r.qa ? " · checks " + (r.qa.pass ? "passed" : "FAILED") : ""}</small></div><button class="sm" data-a="watch" data-v="${r.v}">Watch</button></div>${(r.notes || []).map((n) => `<div class="warnt">${esc(n)}</div>`).join("")}</div>`).join("") : `<p class="help">No renders yet.</p>`;
}

// ---- overlay: where the selected popup / pill will land (preview only; the real thing is drawn by the render)
function drawOverlay() {
  const ov = $("#ov"); ov.classList.toggle("place", !!placing);
  const c = selCard != null ? S.edit.cards[cidx(selCard)] : null;
  if (!c || c.off) { ov.innerHTML = ""; return; }
  const k = ov.clientWidth / 1080 || 0.33;
  if (c.type === "popup") {
    const m = S.media[c.src] || { w: 1, h: 1 }, b = popupBox(c, m.w, m.h);
    ov.innerHTML = `<div class="box" style="left:${b.left * k}px;top:${b.top * k}px;width:${b.w * k}px;height:${b.h * k}px;transform:rotate(${c.rotate || 0}deg)">${isClip(c.src) ? `<video src="/files/${esc(c.src)}#t=${Number(c.from || 0) + 0.5}" muted playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover;border-radius:${28 * k}px"></video>` : `<img src="/files/${esc(c.src)}" alt="">`}</div>`;
  } else if (Y_DEFAULT[c.type] != null) {   // 0.28.0: more text graphics show where they sit, and can be dragged up or down
    const label = c.text || c.title || c.label || c.value || TYPE_NAME[c.type] || c.type;
    ov.innerHTML = `<div class="pill" style="top:${(c.y ?? Y_DEFAULT[c.type]) * k}px"><span style="font-size:${Math.max(8, 36 * k)}px">${esc(label)}</span></div>`;
  } else ov.innerHTML = "";
  const tgt = ov.querySelector(".box, .pill span"); if (tgt) { tgt.dataset.dragv = "1"; tgt.title = "Drag to move it"; }
}
const Y_DEFAULT = { tag: 130, title: 360, cta: 1360, note: 210, quote: 150, chips: 130, columns: 110, stat: 1080, shot: 130 };
// Added by By Mel Ross (0.28.0): drag the selected graphic on the video. Pills and text move up or down; a popup moves anywhere.
$("#ov").addEventListener("pointerdown", (e) => {
  const tgt = e.target.closest("[data-dragv]"); if (!tgt || placing || S.busy) return;
  e.preventDefault(); e.stopPropagation();
  const i = cidx(selCard), c = S.edit.cards[i], el = tgt.classList.contains("box") ? tgt : tgt.parentElement, r = $("#ov").getBoundingClientRect(), k = 1080 / r.width;
  const x0 = e.clientX, y0 = e.clientY, l0 = el.offsetLeft, t0 = el.offsetTop; let dx = 0, dy = 0;
  tgt.setPointerCapture(e.pointerId); $("#ov").style.pointerEvents = "auto";
  const move = (ev) => { dx = ev.clientX - x0; dy = ev.clientY - y0; el.style.top = t0 + dy + "px"; if (c.type === "popup") el.style.left = l0 + dx + "px"; };
  const up = async () => { tgt.removeEventListener("pointermove", move); $("#ov").style.pointerEvents = "";
    if (Math.abs(dx) + Math.abs(dy) < 4) return;
    if (c.type === "popup") { const cx = Math.round((l0 + dx + el.offsetWidth / 2) * k), cy = Math.round((t0 + dy + el.offsetHeight / 2) * k);
      await op({ op: "card_set", i, set: { pos: "custom", x: Math.max(-200, Math.min(1280, cx)), y: Math.max(0, Math.min(1920, cy)) } }, `c${cid(i)}:place`, "Moved"); }
    else await op({ op: "card_set", i, set: { y: Math.max(0, Math.min(1800, Math.round((t0 + dy) * k))) } }, `c${cid(i)}:place`, "Moved"); };
  tgt.addEventListener("pointermove", move); tgt.addEventListener("pointerup", up, { once: true });
});
$("#ov").addEventListener("click", async (e) => {
  if (!placing) return;
  const r = $("#ov").getBoundingClientRect(), k = 1080 / r.width, x = Math.round((e.clientX - r.left) * k), y = Math.round((e.clientY - r.top) * k), i = cidx(placing.id), c = S.edit.cards[i];
  placing = null;
  await op({ op: "card_set", i, set: c.type === "popup" ? { pos: "custom", x, y } : { y } }, `c${cid(i)}:place`, "Placed");
});
window.addEventListener("resize", drawOverlay);

// ------------------------------------------------------------------ actions
const stampField = (i, f) => { const t = now(); return op({ op: "card_set", i, set: { [f]: t } }, `c${cid(i)}:${f}`, `${f === "start" ? "Starts" : "Ends"} at ${fmt(t)}`); };
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-a]"); if (!el) return;
  const a = el.dataset.a, i = el.dataset.i != null ? +el.dataset.i : null;
  if (a === "seek") { v.currentTime = +el.dataset.t; v.scrollIntoView?.({ behavior: "smooth", block: "nearest" }); }
  else if (a === "word") { const ci = +el.dataset.ci, wi = +el.dataset.wi; capSel = capSel && capSel[0] === ci && capSel[1] === wi ? null : [ci, wi]; renderCaps(); v.currentTime = S.edit.captions[ci].words[wi].t; if (capSel) $("#wtext")?.focus(); }
  else if (a === "word-cancel") { capSel = null; renderCaps(); }
  else if (a === "word-save") {
    const [ci, wi] = capSel, text = $("#wtext").value.trim();
    capSel = null; await op({ op: "caption_word", ci, wi, text, accent: $("#wacc").checked, always: $("#walways").checked }, null, "Word saved"); }
  else if (a === "open") { const id = cid(i); openCard.has(id) ? openCard.delete(id) : openCard.add(id); selCard = openCard.has(id) ? id : null; if (openCard.has(id)) v.currentTime = S.edit.cards[i].start; placing = null; renderCards(); renderPopups(); drawOverlay(); }
  else if (a === "stamp") { if (S.cutsStale) return toast("Re-render first: the video above has the old cuts.", true); stampField(i, el.dataset.f); }
  else if (a === "layer") { op({ op: "card_set", i, set: { layer: el.dataset.v } }, null, el.dataset.v === "behind" ? "Behind me: re-render to see it" : "In front of me"); }
  else if (a === "set" && el.dataset.v != null) { op({ op: "card_set", i, set: { [el.dataset.f]: el.dataset.v } }, null); }
  else if (a === "place") { placing = placing && placing.id === cid(i) ? null : { id: cid(i) }; selCard = cid(i); drawOverlay(); if (placing) toast("Tap the video where you want it", false); render(); }
  else if (a === "del") { openCard.delete(cid(i)); selCard = null; op({ op: "card_del", i }, null, "Deleted.", true); }   // 0.34.5: no dialog; Undo is there
  else if (a === "sfx-play") {   // Added by By Mel Ross (0.10.2): hear a sound before choosing it (plays the one picked in the list, at its volume)
    const e = S.edit.sfx_events[i], pick = document.querySelector(`select[data-a="sfx-set"][data-i="${i}"]`), name = (pick && pick.value) || e.name;
    const au = new Audio(`/sfx/${encodeURIComponent(name)}.wav`); au.volume = Math.min(1, Math.pow(10, ((e.db ?? -10) + 8) / 20));
    const fail = () => toast("That sound's file wasn't found. Tell Claude to run setup_engine.sh.");
    au.addEventListener("error", fail); au.play().catch(fail);
  }
  else if (a === "sfx-open") { const id = sid(i); openSfx.has(id) ? openSfx.delete(id) : openSfx.add(id); renderSfx(); }
  else if (a === "sfx-stamp") { if (S.cutsStale) return toast("Re-render first: the video above has the old cuts.", true); op({ op: "sfx_set", i, set: { t: now() } }, `s${sid(i)}:t`, `At ${fmt(now())}`); }
  else if (a === "sfx-del") op({ op: "sfx_del", i }, null, "Sound deleted.", true);
  else if (a === "default") { try { await post("/api/text-default", { layer: el.dataset.v, position: "above" }); toast("Default saved"); } catch (er) { toast(er.message, true); } }
  else if (a === "orbit-open") { orbitOpen = !orbitOpen; renderOrbitPick(); }
  else if (a === "orbit-cancel") { orbitOpen = false; orbitSel.clear(); renderOrbitPick(); }
  else if (a === "orbit-pick") { const s = el.dataset.v; orbitSel.has(s) ? orbitSel.delete(s) : orbitSel.size < 6 ? orbitSel.add(s) : toast("6 pictures at most", true); renderOrbitPick(); }
  else if (a === "orbit-add") {
    const t = Math.min(now(), Math.max(S.total - 1, 0));
    const j = await op({ op: "card_add", card: { type: "orbit", src: [...orbitSel], start: t, end: Math.min(t + 6, S.total) } }, null, "Added: re-render to see them circle");
    if (j?.info?.index != null) { orbitOpen = false; orbitSel.clear(); const id = cid(j.info.index); openCard.add(id); selCard = id; render(); }
  }
  else if (a === "giphy-go") giphySearch();
  else if (a === "giphy-key") saveGiphyKey();
  else if (a === "giphy-kind") { giphy.kind = el.dataset.v; giphy.items = []; giphy.note = ""; renderGiphy(); if (giphy.q) giphySearch(); }
  else if (a === "giphy-add") {
    toast("Getting it from GIPHY…");
    try { const j = await post("/api/giphy-add", { id: el.dataset.v, kind: giphy.kind }); await addPopup(j.upload.src); } catch (er) { toast(er.message, true); }
  }
  else if (a === "look-add") {   // 0.28.0
    try { const r = await post("/api/look-add", { id: $("#lookpick").value, t: now() }); toast(`Added ${r.name} at ${fmt(now())}`); } catch (er) { toast(er.message, true); }
  }
  else if (a === "music-start" || a === "music-start-here") {   // 0.28.0: where the track starts
    const au = document.querySelector("#sfxmaster audio"), s = a === "music-start-here" ? (au ? +au.currentTime.toFixed(1) : 0) : +$("#mstart").value;
    try { await post("/api/music", { start: s }); toast(`The track starts at ${s} s. Press "Update the sound" to hear it.`); } catch (er) { toast(er.message, true); }
  }
  else if (a === "music-all") {
    try { await post("/api/music", { track: S.music.track, scope: "all" }); toast("This track now plays under every reel. Pick another, or No music, on any reel."); } catch (er) { toast(er.message, true); }
  }
  else if (a === "music-level") {   // 0.28.0
    try { await post("/api/music", { level: el.dataset.v }); toast(`Music ${el.dataset.v}. Press "Update the sound" to hear it.`); } catch (er) { toast(er.message, true); }
  }
  else if (a === "lead") {   // 0.29.0
    try { await post("/api/caption-lead", { lead: Number(el.dataset.v), scope: el.dataset.s }); toast(`Captions ${Number(el.dataset.v) ? el.dataset.v + " s early" : "on the word"} for ${el.dataset.s === "all" ? "every reel" : "this reel"}. Re-render to see it.`); } catch (er) { toast(er.message, true); }
  }
  else if (a === "layout") {   // 0.26.0
    try { await post("/api/layout", { layout: el.dataset.v, scope: el.dataset.s }); toast(`Captions ${el.dataset.v === "captions-high" ? "above your head" : "at the bottom"} for ${el.dataset.s === "all" ? "every reel" : "this reel"}`); } catch (er) { toast(er.message, true); }
  }
  else if (a === "sfx-vol") {   // 0.25.0
    try { await post("/api/sfx-volume", { level: el.dataset.v, scope: el.dataset.s }); toast(`Sounds ${el.dataset.v} for ${el.dataset.s === "all" ? "every reel" : "this reel"}. Press "Update the sound" to hear it.`); } catch (er) { toast(er.message, true); }
  }
  else if (a === "remix") {   // 0.25.0: sound only
    try { await post("/api/remix"); startPoll(); await load(); toast("Updating the sound. The picture stays as it is."); } catch (er) { toast(er.message, true); }
  }
  else if (a === "sfx-master") {   // 0.19.0
    try { await post("/api/sfx", { on: el.dataset.v === "on", scope: el.dataset.s }); toast(`Sound effects ${el.dataset.v} for ${el.dataset.s === "all" ? "every reel" : "this reel"}. Press "Update the sound" to hear it.`); } catch (er) { toast(er.message, true); }
  }
  else if (a === "hl-save" || a === "hl-reset") {   // 0.23.0: the highlighted caption word
    const highlight = a === "hl-reset" ? {} : { words: $("#hlWords").value, text: $("#hlText").value, bg: $("#hlOn").checked ? $("#hlBg").value : "none",
      box: $("#cbOn").checked ? $("#cbColor").value : "none", size: +$("#cSize").value };   // 0.27.0: box behind all the words, caption size
    try { await post("/api/caption-highlight", { highlight, scope: a === "hl-reset" ? "reel" : el.dataset.v }); toast(a === "hl-reset" ? "Back to your usual caption colors" : el.dataset.v === "all" ? "Saved for every reel" : "Saved for this reel"); } catch (er) { toast(er.message, true); }
  }
  else if (a === "colors-save" || a === "colors-reset") {   // 0.16.0
    const colors = a === "colors-reset" ? {} : Object.fromEntries([...document.querySelectorAll("#settings [data-color]")].map((x) => [x.dataset.color, x.value]));
    try { await post("/api/colors", { colors, scope: a === "colors-reset" ? "reel" : el.dataset.v }); toast(a === "colors-reset" ? "Back to your brand colors: re-render to see it" : el.dataset.v === "all" ? "Saved for every reel: re-render to see it" : "Saved for this reel: re-render to see it"); } catch (er) { toast(er.message, true); }
  }
  else if (a === "see-themes") seeThemes();   // 0.33.0
  else if (a === "rec-use") {   // 0.34.0
    try {
      if (el.dataset.k === "theme") { await post("/api/theme", { name: el.dataset.v, scope: S.theme?.reel ? "reel" : "all" }); toast("Look saved: the preview updates now"); }
      else { const r = await post("/api/look-add", { id: el.dataset.v, t: now() }); toast(`Added ${r.name} at ${fmt(now())}`); }
    } catch (er) { toast(er.message, true); }
  }
  else if (a === "theme-pick") { try { await post("/api/theme", { name: el.dataset.v, scope: S.theme?.reel ? "reel" : "all" }); toast("Look saved: the live preview updates now. Render when you're happy."); } catch (er) { toast(er.message, true); } }
  else if (a === "theme-scope") { try { await post("/api/theme", { name: $("#themePick").value, scope: el.dataset.v }); toast("Look saved: the live preview updates now. Render when you're happy."); } catch (er) { toast(er.message, true); } }
  else if (a === "watch") { watch = +el.dataset.v; renderVideo(); v.scrollIntoView?.({ behavior: "smooth", block: "center" }); }
});
document.addEventListener("change", async (e) => {
  const el = e.target.closest("[data-a]"); if (!el) return;
  const a = el.dataset.a, i = el.dataset.i != null ? +el.dataset.i : null;
  if (a === "piece") {
    const kept = el.checked;
    try { const j = await post("/api/op", { op: { op: "piece", id: el.dataset.id, kept } }); toast(kept ? "Piece back in" : "Piece dropped: re-render to see it"); if (j.report?.length) { $("#notes").innerHTML = `<div class="banner info"><b>Heads up</b><ul>${j.report.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>`; } }
    catch (er) { toast(er.message, true); render(); }
  } else if (a === "toggle") op({ op: "card_set", i, set: { off: !el.checked } }, null, el.checked ? "On" : "Off");
  else if (a === "sfx-toggle") op({ op: "sfx_set", i, set: { off: !el.checked } }, null, el.checked ? "On" : "Off");
  else if (a === "frame") op({ op: "card_set", i, set: { frame: el.checked } }, null);
  else if (a === "items") op({ op: "card_set", i, set: { items: el.value.split("\n") } }, null, "Lines saved: re-render to see it");   // 0.28.0
  else if (a === "rows") op({ op: "card_set", i, set: { rows: el.value.split("\n") } }, null, "List saved: re-render to see it");
  else if (a === "loop") op({ op: "card_set", i, set: { loop: el.checked } }, null);
  else if (a === "set") op({ op: "card_set", i, set: { [el.dataset.f]: el.value } }, `c${cid(i)}:${el.dataset.f}`);
  else if (a === "range") op({ op: "card_set", i, set: { [el.dataset.f]: el.value } }, `c${cid(i)}:${el.dataset.f}`);
  else if (a === "sfx-set") op({ op: "sfx_set", i, set: { [el.dataset.f]: el.value } }, `s${sid(i)}:${el.dataset.f}`);
});
document.addEventListener("change", async (e) => {   // 0.28.0: background music: pick a track, or add one to the music folder
  if (e.target.dataset?.a === "music-track") {
    try { await post("/api/music", { track: e.target.value }); toast(e.target.value ? "Music picked. Press \"Update the sound\" to hear it in the reel." : "No music for this reel"); } catch (er) { toast(er.message, true); }
  }
  if (e.target.id === "addtrack" && e.target.files[0]) {
    const f = e.target.files[0]; toast("Adding " + f.name + "...");
    try { const r = await fetch("/api/music-upload?name=" + encodeURIComponent(f.name), { method: "POST", body: f }), j = await r.json(); if (!j.ok) throw new Error(j.error);
      await post("/api/music", { track: j.name }); toast(`Added "${j.name}" and picked it for this reel`); } catch (er) { toast(er.message, true); }
    e.target.value = "";
  }
});
document.addEventListener("change", (e) => { if (e.target.id === "igon") $("#igzone").classList.toggle("on", e.target.checked); });   // 0.26.0
// Added by By Mel Ross (0.23.0): the highlighted-word sample follows the pickers before you save.
function lum(h) { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function hlSample() {
  const w = $("#hlword"); if (!w) return;
  const on = $("#hlOn").checked; $("#hlBg").disabled = !on;
  const cb = $("#cbOn").checked; $("#cbColor").disabled = !cb; $("#csz").textContent = $("#cSize").value;
  $("#hlsample").querySelector(".cb2")?.style.setProperty("background", cb ? $("#cbColor").value : "none");
  $("#hlsample").style.fontSize = Math.round(26 * $("#cSize").value / 96) + "px";
  $("#hlsample").style.color = $("#hlWords").value; w.style.color = $("#hlText").value; w.style.background = on ? $("#hlBg").value : "none";
  $("#hlwarn").hidden = !((on && contrast($("#hlText").value, $("#hlBg").value) < 2.5) || (cb && contrast($("#hlWords").value, $("#cbColor").value) < 2.5) || (cb && !on && contrast($("#hlText").value, $("#cbColor").value) < 2.5));
}
document.addEventListener("input", (e) => {
  if (e.target.id === "hlOn" && e.target.checked) {   // switching the box on: the word's color becomes the box, and the word turns to whichever of main, black or white reads best on it
    const bg = $("#hlText").value, main = (S.colors.reel || {}).main || S.colors.all.main;
    $("#hlBg").value = bg; $("#hlText").value = contrast(main, bg) >= 4 ? main : contrast("#000000", bg) >= contrast("#ffffff", bg) ? "#000000" : "#ffffff";
  }
  if (e.target.id === "cbOn" && e.target.checked && contrast($("#hlWords").value, $("#cbColor").value) < 3) $("#hlWords").value = (S.colors.reel || {}).main || S.colors.all.main;   // white words on a white box: words go dark
  if (["hlWords", "hlText", "hlBg", "hlOn", "cbOn", "cbColor", "cSize"].includes(e.target.id)) hlSample();
});
document.addEventListener("input", (e) => { const el = e.target; if (el.dataset?.a === "range") { const l = el.previousElementSibling; if (l) l.textContent = l.textContent.replace(/:.*$/, `: ${el.value}${el.dataset.f === "size" ? "px wide" : el.dataset.f === "period" ? " seconds" : "°"}`); } });
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "wtext") document.querySelector('[data-a="word-save"]')?.click(); });

$("#undo").addEventListener("click", async () => { try { const j = await post("/api/undo"); toast(`Undid: ${j.undid}`); } catch (e) { toast(e.message, true); } });
// 0.34.5: no browser dialog. Some browsers (the one inside the Claude app among them) block confirm() without a word, so
// the button did nothing. First tap asks on the button itself; a second tap within 6 seconds starts the render.
let renderArmed = null;
$("#render").addEventListener("click", async () => {
  const b = $("#render");
  if (running()) return;
  if (!renderArmed) {
    b.textContent = "Tap again to render"; b.classList.add("armed");
    toast("A render takes a few minutes and pauses editing until it's done. Your earlier versions are kept.");
    renderArmed = setTimeout(() => { renderArmed = null; b.classList.remove("armed"); b.textContent = "Re-render"; }, 6000);
    return;
  }
  clearTimeout(renderArmed); renderArmed = null; b.classList.remove("armed");
  try { b.disabled = true; b.textContent = "Starting…"; await post("/api/render"); startPoll(); await load(); toast("Rendering. The new video shows here when it's done."); }
  catch (e) { b.disabled = false; b.textContent = "Re-render"; toast(e.message, true); }
});
$("#addList").addEventListener("click", async () => {   // 0.16.0
  const t = Math.min(now(), Math.max(S.total - 0.5, 0));
  const j = await op({ op: "card_add", card: { type: "card", start: t, end: Math.min(t + 4, S.total) } }, null, "List added: change its title and rows, then re-render");
  if (j?.info?.index != null) { openCard.add(cid(j.info.index)); render(); }
});
$("#addPill").addEventListener("click", () => {
  const t = Math.min(now(), Math.max(S.total - 0.5, 0)); op({ op: "card_add", card: { type: "tag", text: "new pill", start: t, end: Math.min(t + 2.5, S.total) } }, null, "Pill added").then((j) => { if (j?.info?.index != null) { const id = cid(j.info.index); openCard.add(id); selCard = id; render(); } });
});
$("#addSfx").addEventListener("click", () => { const t = now(); op({ op: "sfx_add", event: { name: "pop-soft", t, db: -16 } }, null, "Sound added").then((j) => { if (j?.info?.index != null) { openSfx.add(sid(j.info.index)); renderSfx(); } }); });
async function addPopup(src) {
  const t = Math.min(now(), Math.max(S.total - 0.5, 0));
  const j = await op({ op: "card_add", card: { type: "popup", src, start: t, end: Math.min(t + (isClip(src) ? 5 : 3), S.total), ...(isClip(src) ? {} : { size: 360 }) } }, null, null);
  if (j) toast(j.info?.paired ? "Added beside the picture already there: the 2 sit side by side. Re-render to see it." : "Added in the middle of the screen. Change where under Edit, then re-render.");
  if (j?.info?.index != null) { const id = cid(j.info.index); openCard.add(id); selCard = id; render(); $("#s-pop").open = true; }
}
$("#file").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return; e.target.value = "";
  if (f.size > 55e6) return toast("That file is over 55 MB", true);
  toast(`Uploading ${f.name}…`);
  try { const j = await post("/api/upload?name=" + encodeURIComponent(f.name), null, f); await addPopup(j.upload.src); }
  catch (er) { toast(er.message, true); }
});
document.addEventListener("change", (e) => { if (e.target.id === "reusePick" && e.target.value) { addPopup(e.target.value); e.target.value = ""; } });
document.addEventListener("change", async (e) => {
  if (e.target.id !== "themePick") return;
  try { await post("/api/theme", { name: e.target.value, scope: S.theme?.reel ? "reel" : "all" }); toast("Look saved: the live preview updates now. Render when you're happy."); } catch (er) { toast(er.message, true); }
});
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "gq") giphySearch(); if (e.key === "Enter" && e.target.id === "gkey") saveGiphyKey(); });

// 0.34.5: while the page is open, check every 5 seconds for a newer video (a render Claude made outside this page) and switch
// to it, so nobody has to wonder whether to refresh.
let freshNote = false;
setInterval(async () => {
  if (!S || running() || pollT) return;
  try {
    const f = await (await fetch("/api/fresh")).json();
    const have = S.renders.length ? S.renders[S.renders.length - 1].v : null;
    if (f.latest != null && f.latest !== have) { freshNote = false; watch = null; await load(); toast(`New video${f.outside ? " from Claude" : ""} is ready and showing now.`); }
    else if (f.prepping && !freshNote) { freshNote = true; toast("Claude finished a new render. Getting it ready for this page…"); }
  } catch { /* try again in 5 seconds */ }
}, 5000);
// ------------------------------------------------------------------ job polling
function startPoll() { clearInterval(pollT); pollT = setInterval(async () => {
  try { const j = await (await fetch("/api/job")).json(); const was = S.job.state; S.job = j.job;
    if (j.job.state === "done" || j.job.state === "failed") { clearInterval(pollT); pollT = null; watch = null; await load(); liveBuild(); toast(j.job.state === "done" ? "New video ready" : "Render failed", j.job.state !== "done"); }
    else { renderStatus(); renderLive(); $("#render").textContent = "Rendering…"; }
  } catch {} }, 2000); }
// ---- Live preview (Added by By Mel Ross, 0.17.0). The reel is built as a web page in a few seconds; that page is laid over the
// player and kept in step with it, so a change shows with the real fonts, colors and motion without a re-render. The player
// underneath is still the last render: it keeps the time and the sound.
let liveOn = true, liveState = { state: "none" }, liveT = null, livePollT = null;
try { liveOn = localStorage.getItem("reel-live") !== "off"; } catch { /* private mode */ }
$("#liveOn").checked = liveOn;
const liveFrame = $("#live");
function renderLive() {
  const L = liveState || { state: "none" }, msg = $("#livemsg");
  const can = liveOn && S && S.built !== false && !S.cutsStale && (S.renders.length > 0 || S.hasMaster) && !running();
  if (can && L.state === "ready" && liveFrame.dataset.at !== String(L.at)) { liveFrame.dataset.at = String(L.at); liveFrame.src = "/live/index.html?at=" + encodeURIComponent(L.at); }
  const show = can && !!liveFrame.dataset.at && L.state !== "none";
  liveFrame.style.display = show ? "" : "none";
  msg.className = "small" + (L.state === "failed" && liveOn ? " warnt" : "");
  msg.textContent = !liveOn ? "Off: the player shows your last render."
    : running() ? "Paused while the video renders."
    : S && S.cutsStale ? "Your cuts changed. Re-render once, then the live preview is back."
    : S && !S.renders.length && !S.hasMaster ? "Starts after the first render."
    : L.state === "building" ? "Updating…"
    : L.state === "failed" ? "Couldn't update: " + (L.error || "unknown reason")
    : L.state === "ready" ? `Shows your changes now (updated in ${L.secs} s). Sounds and the final polish come with Re-render.`
    : "";
}
async function liveBuild(force) {
  if (!liveOn || !S || S.built === false || running() || S.cutsStale) return renderLive();
  try {
    const r = await fetch("/api/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: !!force }) }), j = await r.json();
    if (!j.ok) throw new Error(j.error || "failed");
    liveState = j.live;
  } catch (e) { liveState = { ...liveState, state: "failed", error: e.message }; }
  renderLive();
  clearTimeout(livePollT); if (liveState.state === "building") livePollT = setTimeout(livePoll, 600);
}
async function livePoll() {
  try { liveState = (await (await fetch("/api/live")).json()).live; } catch { /* try again */ }
  renderLive();
  if (liveState.state === "building") livePollT = setTimeout(livePoll, 600);
}
function liveSoon() { clearTimeout(liveT); liveT = setTimeout(() => liveBuild(), 350); }
$("#liveOn").addEventListener("change", (e) => { liveOn = e.target.checked; try { localStorage.setItem("reel-live", liveOn ? "on" : "off"); } catch { /* fine */ } if (liveOn) liveBuild(); else renderLive(); });
(function liveLoop() {
  if (liveFrame.style.display !== "none") {
    const k = liveFrame.parentElement.clientWidth / 1080;
    liveFrame.style.transform = `scale(${k})`; liveFrame.style.clipPath = `inset(0 0 ${Math.round(46 / k)}px 0)`;   // the player's own buttons stay visible along the bottom
    try { const w = liveFrame.contentWindow; if (w && w.reelLive && w.reelLive.ready()) w.reelLive.sync(v.currentTime || 0, !v.paused && !v.seeking && !v.ended); } catch { /* the frame is loading */ }
  }
  requestAnimationFrame(liveLoop);
})();
await load();
if (running()) startPoll();
liveBuild();
// ---- Tips (Added by By Mel Ross, 0.15.0): a small ? beside the terms that need explaining. Tap it (or hover on a computer) for one
// plain sentence. The list is matched by the label's own words, so a re-drawn section gets its ? back on its own.
const TIPS = [
 [
  ".livebar b",
  "Live preview",
  "Shows your changes on the video within seconds, with your real fonts and colors. Sound effects and the final polish still need Re-render."
 ],
 [
  "summary",
  "Captions",
  "The words shown on screen while you speak. Fix a misspelled word or switch a line off here. Your voice doesn't change."
 ],
 [
  "summary",
  "Cuts",
  "The pieces of your clip that are in the reel. Switch a piece off to remove it: the reel gets shorter and everything after it moves earlier."
 ],
 [
  "summary",
  "Text on screen",
  "Titles, labels and notes that sit over the video for a few seconds, at a moment you choose."
 ],
 [
  "summary",
  "Popups",
  "A picture, GIF, SVG or video clip that appears for a few seconds, then leaves. It sits in a corner unless you move it."
 ],
 [
  "summary",
  "Music and sound effects",
  "Soft background music from your music folder, and short sounds such as a pop or a whoosh. Your voice stays on top."
 ],
 [
  "summary",
  "Settings",
  "Choices for the whole reel: the look, and where new text starts."
 ],
 [
  "summary",
  "Versions",
  "Every re-render is kept. Watch an older one to compare it with the newest."
 ],
 [
  "#receipt > b",
  "What was done",
  "A plain list of what the editor changed in your clip: cuts, speed, captions, graphics and sounds."
 ],
 [
  "label.f",
  "Layer",
  "In front puts it over you. Behind puts it between you and your background, which needs the outline of you that only a Mac makes."
 ],
 [
  "label.f",
  "Caption colors",
  "The caption size, a box behind all the words, the color of your caption words, the color of a highlighted word, and a colored box you can put behind it. A highlighted word is one you marked in the Captions list."
 ],
 [
  "label.f",
  "Colors",
  "Your 3 brand colors. Main is for text and dark shapes, Pop is for highlights, Light is for card backgrounds. Every look uses them."
 ],
 [
  "label.f",
  "Look (theme)",
  "One choice that changes the fonts, captions, titles and card shapes together. Your colors stay."
 ],
 [
  "label.f",
  "Tilt",
  "Turns it a few degrees so it looks hand-placed. 0 is straight."
 ],
 [
  "label.f",
  "Size",
  "How wide it is. The reel is 1080 wide, so 360 is a third of the screen."
 ],
 [
  "label.f",
  "Where the ring",
  "The pictures circle your head. Pick whether the ring sits around the top of your head or below your chin."
 ],
 [
  "label.f",
  "Where text goes",
  "The layer new text starts on, in every reel. You can still change any single piece of text."
 ],
 [
  "label.f",
  "In front or behind",
  "In front puts the picture over your face. Behind puts it between you and your background, so your head covers part of it."
 ],
 [
  "label.f",
  "Handwritten label",
  "A short note on a strip of tape across the bottom of the picture. Leave it empty for no label."
 ],
 [
  "label.f",
  "List title",
  "The heading at the top of the list card."
 ],
 [
  "label.f",
  "Rows",
  "Each line is one row of the list. Rows appear one after the other."
 ],
 [
  "label.f",
  "Where",
  "Which part of the screen it sits in. Tap the video to put it on an exact spot."
 ],
 [
  "label.f",
  "Starts at",
  "When it appears, in seconds from the start of the reel. Play to the moment and press Mark time to fill it in."
 ],
 [
  "label.f",
  "Ends at",
  "When it leaves, in seconds from the start of the reel."
 ],
 [
  "label.f",
  "Time (s)",
  "The moment the sound plays, in seconds from the start of the reel."
 ],
 [
  "label.f",
  "Volume",
  "0 is the loudest. -20 is quiet. Lower it if a sound covers your voice."
 ],
 [
  "label.f",
  "Height on screen",
  "How far down the screen the text sits, from above your head to just above the captions."
 ],
 [
  "label.f",
  "One lap every",
  "How long the pictures take to go around your head once. A bigger number is slower."
 ],
 [
  "label.f",
  "Start the clip at",
  "Skip the first seconds of your video clip. 3 means the clip starts playing from its 3 second mark."
 ],
 [
  "label.f",
  "Fix this word",
  "Changes the spelling in the caption only. What you said stays the same."
 ],
 [
  "label.f",
  "Pick 1 to 6 pictures",
  "These pictures circle your head, passing behind it and in front of it."
 ],
 [
  "label.f",
  "From GIPHY",
  "Type a word or two, press Search, then tap a result to add it at the moment the video is paused on."
 ]
];
function addTips() {
  for (const [sel, starts, tip] of TIPS) for (const el of document.querySelectorAll(sel)) {
    if (el.querySelector(":scope > .tipb")) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").trim();
    if (!own.startsWith(starts)) continue;
    const b = document.createElement("button"); b.type = "button"; b.className = "tipb"; b.dataset.tip = tip; b.setAttribute("aria-label", "What is this? " + tip);
    el.insertBefore(b, el.matches("summary") ? el.querySelector("small") : null);   // in a section title the ? sits beside the name, the count stays on the right
  }
}
function hideTip() { document.getElementById("tipbox")?.remove(); document.querySelectorAll(".tipb.on").forEach((b) => b.classList.remove("on")); }
let tipAt = 0;
function showTip(b) {
  hideTip(); b.classList.add("on"); tipAt = Date.now();
  const box = document.createElement("div"); box.id = "tipbox"; box.setAttribute("role", "tooltip"); box.textContent = b.dataset.tip; document.body.appendChild(box);
  const r = b.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
  box.style.left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 12)) + "px";
  box.style.top = (r.bottom + 8 + h > innerHeight ? Math.max(8, r.top - h - 8) : r.bottom + 8) + "px";
}
document.addEventListener("click", (e) => {
  const b = e.target.closest?.(".tipb");
  if (!b) return hideTip();
  e.preventDefault(); e.stopPropagation();   // a ? inside a section title or a label must not open the section or tick the box
  if (b.classList.contains("on") && !matchMedia("(hover: hover)").matches) hideTip(); else showTip(b);   // on a phone a second tap closes it
}, true);
document.addEventListener("mouseover", (e) => { const b = e.target.closest?.(".tipb"); if (b && matchMedia("(hover: hover)").matches) showTip(b); });
document.addEventListener("mouseout", (e) => { if (e.target.closest?.(".tipb") && matchMedia("(hover: hover)").matches) hideTip(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); });
addEventListener("scroll", () => { if (Date.now() - tipAt > 400) hideTip(); }, true);   // a tap can nudge the page; that must not close the tip it just opened
new MutationObserver(addTips).observe(document.body, { childList: true, subtree: true }); addTips();
