// The review page (reel-review.html). Moved out of the page in 0.30.0; it loads after core.js.
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
setSteps("edit");
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const v = $("#v"), ov = $("#ov");
const fmt = t => `${Math.floor(t / 60)}:${(Math.max(0, t) % 60).toFixed(1).padStart(4, "0")}`;
let R = null, B = null, S = blank(), P = null, CAPS = [], GFX = [];
let tab = "cuts", ref = null, saving = Promise.resolve(), timer = null, undo = [], mode = "idle", loop = null;
function blank() { return { theme: null, colors: null, highlight: null, capmode: null, layout: null, sfxAll: null, cut: null, restoredFillers: [], restoredPauses: [], trimmedPauses: [], captions: null, board: {}, wanted: [], amount: null, sfxOff: {}, notes: {}, brandRequest: "", revisions: [], buildRequest: null }; }

// ---------- saving, undo ----------
const pill = (t, err) => { $("#save").textContent = t; $("#save").classList.toggle("err", !!err); $("#retry").hidden = !err; };
let dirty = false, mine = null;   // dirty: local edits not yet sent; mine: updatedAt of our last write (to spot other writers)
function queueSave() {
  clearTimeout(timer); dirty = true; pill("Unsaved changes…");
  timer = setTimeout(saveNow, 600);
}
function saveNow() {
  if (!ref) { pill("Not connected: changes won't save", true); return; }
  dirty = false;
  const body = JSON.parse(JSON.stringify({ ...S, updatedAt: new Date().toISOString() }));
  mine = body.updatedAt;
  pill("Saving…");
  saving = saving.then(() => ref.set(body)).then(() => { const at = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); pill("Saved " + at); const s = $("#savedat"); if (s) s.textContent = "Saved " + at; },   // 0.36.1: stays beside Undo
    e => pill("Couldn't save (" + (e?.code || "error") + ")", true));
}
$("#retry").addEventListener("click", saveNow);
// Modified by By Mel Ross (0.37.0): Redo next to Undo, 60 steps each way, and both survive a reload. They are kept in this
// browser (localStorage) with the decisions they belong to; when the saved decisions differ (Claude or another tab changed them)
// the history is dropped, so Undo never jumps back to a state that no longer follows.
let redo = [];
const STEPS = 60, strip = (x) => { const { updatedAt, ...rest } = x || {}; return JSON.stringify(rest); };
const undoKey = () => R ? `reelstudio-undo:${R.title || ""}:${(R.words || []).length}` : null;
function syncUndo() {
  $("#undo").disabled = !undo.length; const r = $("#redo"); if (r) r.disabled = !redo.length;
  const k = undoKey(); if (!k) return;
  let u = undo.slice(-STEPS), d = redo.slice(-STEPS);
  for (;;) {   // a long reel's history can outgrow the browser's space: keep the newest steps that fit
    try { localStorage.setItem(k, JSON.stringify({ cur: strip(S), undo: u, redo: d })); return; }
    catch { if (!u.length && !d.length) { try { localStorage.removeItem(k); } catch { /* storage off */ } return; } u = u.slice(Math.ceil(u.length / 2)); d = d.slice(Math.ceil(d.length / 2)); }
  }
}
function restoreUndo() {
  const k = undoKey(); if (!k) return;
  try { const h = JSON.parse(localStorage.getItem(k) || "null"); if (h && h.cur === strip(S)) { undo = h.undo || []; redo = h.redo || []; } } catch { /* nothing kept */ }
  syncUndo();
}
function pushUndo() { undo.push(JSON.stringify(S)); if (undo.length > STEPS) undo.shift(); redo = []; }
function mutate(fn) {
  pushUndo();
  fn(); recompute(); renderAll(); setPos(pos); queueSave(); syncUndo();
}
function restore(from, to) { if (!from.length) return; to.push(JSON.stringify(S)); if (to.length > STEPS) to.shift(); S = JSON.parse(from.pop()); recompute(); renderAll(); renderLook(); queueSave(); syncUndo(); }
const doUndo = () => restore(undo, redo), doRedo = () => restore(redo, undo);
$("#undo").addEventListener("click", doUndo);
$("#redo")?.addEventListener("click", doRedo);
document.addEventListener("keydown", e => {
  if (!(e.metaKey || e.ctrlKey) || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === "z" && !e.shiftKey) { e.preventDefault(); doUndo(); }
  else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); doRedo(); }
});

// ---------- derived timeline ----------
function decisions() { return { ...S, cut: S.cut || R.proposedCut, captions: S.captions || R.captions }; }
function recompute() { const d = decisions(); P = ReelCore.plan(R, d); CAPS = ReelCore.captions(R, d, P); GFX = ReelCore.graphics(R, d, P); }

// ---------- tabs ----------
function showTab(t) {
  tab = t;
  $$(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t));
  $$("section[data-p]").forEach(s => s.hidden = s.dataset.p !== t);
  $("#notetab").textContent = { cuts: "cuts", graphics: "graphics", captions: "captions", sound: "sound and color", preview: "preview" }[t];
  $("#notes").value = S.notes[t] || ""; $("#resetbox").hidden = t === "preview"; 
  stopPlay();
  if (t === "preview") { if (B?.url && v.getAttribute("src") !== B.url) { v.setAttribute("src", B.url); v.load(); } $("#rough").hidden = $("#back5").hidden = $("#fwd5").hidden = true; $(".scrub").hidden = true; v.controls = true; }
  else { if (v.getAttribute("src") !== R.srcUrl) { v.setAttribute("src", R.srcUrl); v.load(); } $("#rough").hidden = $("#back5").hidden = $("#fwd5").hidden = false; $(".scrub").hidden = false; v.controls = false; }
  overlay(0);
}
$$(".tab").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
$("#notes").addEventListener("input", e => { S.notes[tab] = e.target.value; queueSave(); });
$("#brand").addEventListener("input", e => { S.brandRequest = e.target.value; queueSave(); });
// Added by By Mel Ross (0.9.0): pick the theme for this reel. The page keeps showing your captions as they are; the theme shows in the preview build.
function renderLook() {
  renderColors();
  const list = Array.isArray(R.themes) ? R.themes : [], sel = $("#theme");
  $("#lookbox").hidden = !list.length; if (!list.length) return;
  const cur = S.theme ?? R.theme ?? "";
  sel.textContent = "";
  for (const t of [{ id: "", name: "My brand as it is" }, ...list]) { const o = document.createElement("option"); o.value = t.id; o.textContent = t.name; o.selected = t.id === cur; sel.append(o); }
  const t = list.find(x => x.id === cur);
  $("#themenote").textContent = (t ? t.summary + " " : "A theme changes the fonts, captions, titles and card shapes together. Your colors and name stay. ") + "You'll see it in the preview build.";
}
$("#theme").addEventListener("change", e => { mutate(() => { S.theme = e.target.value; }); renderLook(); });
// Added by By Mel Ross (0.16.0): the color box. 3 colors for this reel; every look uses them. They show in the preview build.
function renderColors() {
  const base = R.colors; $("#colorbox").hidden = !base; if (!base) return;
  const cur = { ...base, ...(S.colors || {}) }, row = $("#colorrow"); row.textContent = "";
  for (const [k, n, what] of [["main", "Main", "text and dark shapes"], ["pop", "Pop", "highlighted words and accents"], ["light", "Light", "card backgrounds"]]) {
    const lab = document.createElement("label"); const inp = document.createElement("input"); inp.type = "color"; inp.value = cur[k]; inp.setAttribute("aria-label", n + " color");
    const cap = document.createElement("span"); cap.className = "lede"; cap.innerHTML = `<b>${n}</b>: ${what}`;
    inp.addEventListener("change", () => mutate(() => { S.colors = { ...base, ...(S.colors || {}), [k]: inp.value.toUpperCase() }; }));
    lab.append(inp, cap); row.append(lab);
  }
  $("#colorreset").hidden = !S.colors;
  $("#colornote").textContent = (S.colors ? "This reel has its own colors. " : "This reel uses your brand colors. ") + "Every look uses these 3 colors, so changing them changes any look. You'll see them in the preview build. To change them for every reel, use Settings on the Touch-ups page.";
}
$("#colorreset").addEventListener("click", () => mutate(() => { S.colors = null; }));
// Added by By Mel Ross (0.23.0): the highlighted caption word. Its color, and a box behind it you can switch on. For this reel;
// the player shows it right away. To set it for every reel, use Settings on the Touch-ups page.
function hlNow() { return { words: R.style.cap, text: R.style.acc, bg: R.style.accBg || "none", box: R.style.capBox || "none", size: R.style.capSize, ...(S.highlight || {}), ...HLDRAFT }; }
// 0.34.2: see a change on a caption the moment you make it. While a color is being picked or the size slider moves,
// HLDRAFT holds the value; the player jumps to a caption with a highlighted word, paused, and redraws it.
let HLDRAFT = {};
function showCaptionSample() {
  if (!R || !P || tab === "preview") return;
  const live = CAPS.filter((c) => !c.gone && c.pos !== "hide");
  const marked = capModeNow() === "phrase" ? (c) => c.words.some((w) => w.accent) : (c) => c.words.length > 1 || R.style.mode === "word";   // 0.34.8
  const here = live.find((c) => pos >= c.start && pos < c.end && marked(c));
  const cap = here || live.find((c) => marked(c) && c.start >= pos) || live.find(marked) || live[0];
  if (!cap) return;
  if (mode === "rough") stopPlay();
  if (!here) seekCut(capModeNow() === "spoken" && cap.words[1] ? cap.words[1].t + 0.02 : cap.start + Math.min(0.3, (cap.end - cap.start) / 2)); else { mode = "roughPaused"; overlay(pos); }
  $("#player")?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
}
// Added by By Mel Ross (0.34.8): how captions highlight. "phrase" = only the words you mark, "spoken" = each word lights up
// as you say it, "word" = one word at a time. The player shows the choice on the caption under it.
const CAPMODES = [["phrase", "Only words I mark", "The words you tap below get the highlight color."], ["spoken", "Each word as I say it", "Every word lights up in the highlight color while you say it."], ["word", "One word at a time", "Captions show one word at a time, big."]];
function capModeNow() { return S.capmode || (R && R.style && R.style.mode) || "phrase"; }
function renderCapMode() {
  const box = $("#capmodebox"); if (!box) return; box.hidden = !R; if (!R) return;
  const row = $("#capmodes"), cur = capModeNow(); row.textContent = "";
  for (const [id, name] of CAPMODES) {
    const b = document.createElement("button"); b.type = "button"; b.className = "b quiet"; b.dataset.capmode = id; b.textContent = name;
    b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(id === cur));
    b.addEventListener("click", () => { mutate(() => { S.capmode = id === ((R.style && R.style.mode) || "phrase") ? null : id; }); renderCapMode(); showCaptionSample(); });
    row.append(b);
  }
  $("#capmodenote").textContent = (CAPMODES.find((m) => m[0] === cur) || CAPMODES[0])[2];
}
// the caption the player shows at cut time t, in the chosen mode
function shownCap(cap, t) {
  const m = capModeNow(), ws = cap.words;
  const at = (list) => { let k = 0; for (let j = 0; j < list.length; j++) if (list[j].t <= t + 0.001) k = j; return k; };
  if (m === "word") { const w = ws[at(ws)]; return { ...cap, words: [w] }; }
  let words = ws;
  if (R.style.mode === "word") {   // the page holds one word per caption: show the phrase it belongs to
    const live = CAPS.filter((c) => !c.gone && c.pos !== "hide"), i = live.indexOf(cap), grp = [];
    let s = i; while (s > 0 && grp.length < 2 && live[s].start - live[s - 1].end <= 0.35 && live[s - 1].pos === cap.pos && !/[.,!?;:]$/.test(live[s - 1].words.at(-1).text)) { s--; grp.push(1); }
    words = []; for (let k = s; k < live.length && words.length < 3; k++) { if (k > s && (live[k].start - live[k - 1].end > 0.35 || /[.,!?;:]$/.test(live[k - 1].words.at(-1).text))) break; words.push(...live[k].words); }
    if (!words.length) words = ws;
  }
  if (m === "spoken") { const k = at(words); return { ...cap, words: words.map((w, j) => ({ ...w, accent: j === k })) }; }
  return { ...cap, words };
}
function hlLum(h) { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function renderHighlight() {
  const ok = R && R.style && /^#[0-9a-f]{6}$/i.test(R.style.acc || ""); $("#hlbox").hidden = !ok; if (!ok) return;
  const cur = hlNow(), box = cur.bg !== "none", row = $("#hlrow"); row.textContent = "";
  const set = (patch) => { HLDRAFT = {}; mutate(() => { S.highlight = { ...hlNow(), ...patch }; }); showCaptionSample(); };
  const draft = (patch) => { Object.assign(HLDRAFT, patch); showCaptionSample(); };
  const pick = (name, val, off, on) => { const lab = document.createElement("label"); const inp = document.createElement("input"); inp.type = "color"; inp.value = val; inp.disabled = off; inp.setAttribute("aria-label", name);
    const cap = document.createElement("span"); cap.className = "lede"; cap.innerHTML = `<b>${name}</b>`; inp.addEventListener("change", () => on(inp.value.toUpperCase())); inp.addEventListener("input", () => { const k = { Words: "words", "Highlighted word": "text", Box: "bg", "Box behind all": "box" }[name]; if (k) draft({ [k]: inp.value.toUpperCase() }); }); lab.append(inp, cap); row.append(lab); };
  if (/^#[0-9a-f]{6}$/i.test(cur.words || "")) pick("Words", cur.words, false, v => set({ words: v }));
  pick("Highlighted word", cur.text, false, v => set({ text: v }));
  pick("Box", box ? cur.bg : "#FFFFFF", !box, v => set({ bg: v }));
  const lab = document.createElement("label"); const chk = document.createElement("input"); chk.type = "checkbox"; chk.id = "hlon"; chk.checked = box;
  const cap = document.createElement("span"); cap.className = "lede"; cap.innerHTML = "<b>Box behind the highlighted word</b>";
  // switching the box on: the word's color becomes the box, and the word turns to whichever of main, black or white reads best on it
  const con = (a, b) => { const x = hlLum(a), y = hlLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  chk.addEventListener("change", () => { if (!chk.checked) return set({ bg: "none" });
    const bg = cur.text.toUpperCase(), main = ((S.colors || {}).main || (R.colors || {}).main || "#141414").toUpperCase();
    set({ bg, text: con(main, bg) >= 4 ? main : con("#000000", bg) >= con("#FFFFFF", bg) ? "#000000" : "#FFFFFF" }); });
  lab.append(chk, cap); row.append(lab);
  // 0.27.0: a box behind all the words, and the caption size
  const cb = cur.box && cur.box !== "none";
  const lab2 = document.createElement("label"); const chk2 = document.createElement("input"); chk2.type = "checkbox"; chk2.id = "cbon"; chk2.checked = cb;
  const cap2 = document.createElement("span"); cap2.className = "lede"; cap2.innerHTML = "<b>Box behind all the words</b>";
  chk2.addEventListener("change", () => set({ box: chk2.checked ? "#FFFFFF" : "none", ...(chk2.checked && /^#fff/i.test(cur.words || "") ? { words: (S.colors || {}).main || (R.colors || {}).main || "#141414" } : {}) }));
  lab2.append(chk2, cap2); row.append(lab2);
  if (cb && /^#[0-9a-f]{6}$/i.test(cur.box)) pick("Box behind all", cur.box, false, v => set({ box: v }));
  const lab3 = document.createElement("label"); lab3.style.gridColumn = "1 / -1";
  const rng = document.createElement("input"); rng.type = "range"; rng.min = 60; rng.max = 160; rng.step = 2; rng.value = cur.size || 96; rng.id = "csize"; rng.setAttribute("aria-label", "Caption size");
  const cap3 = document.createElement("span"); cap3.className = "lede"; cap3.innerHTML = `<b>Caption size</b> ${rng.value}`;
  rng.addEventListener("input", () => { cap3.innerHTML = `<b>Caption size</b> ${rng.value}`; draft({ size: +rng.value }); });
  rng.addEventListener("change", () => set({ size: +rng.value }));
  lab3.append(cap3, rng); row.append(lab3);
  const ratio = (x, y) => { const a = hlLum(x), b = hlLum(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  let near = (box && ratio(cur.text, cur.bg) < 2.5) || (cb && /^#[0-9a-f]{6}$/i.test(cur.box) && /^#[0-9a-f]{6}$/i.test(cur.words || "") && ratio(cur.words, cur.box) < 2.5) || (cb && !box && /^#[0-9a-f]{6}$/i.test(cur.box) && ratio(cur.text, cur.box) < 2.5);
  $("#hlwarn").hidden = !near;
  $("#hlreset").hidden = !S.highlight;
  $("#hlnote").textContent = (S.highlight ? "This reel has its own caption colors. " : "This reel uses your usual caption colors. ") + "The player shows a caption with a highlighted word as you change these. To change it for every reel, use Settings on the Touch-ups page.";
}
$("#igon").addEventListener("change", (e) => $("#igzone").classList.toggle("on", e.target.checked));   // 0.26.0
$("#hlreset").addEventListener("click", () => mutate(() => { S.highlight = null; }));
$("#reset").addEventListener("click", () => {
  const box = $("#resetbox"); box.textContent = "";
  const msg = document.createElement("span"); msg.className = "confirm"; msg.textContent = "Reset this section to my proposal? ";
  const yes = document.createElement("button"); yes.className = "b"; yes.type = "button"; yes.textContent = "Reset";
  const no = document.createElement("button"); no.className = "b quiet"; no.type = "button"; no.textContent = "Cancel";
  const back = () => { box.textContent = ""; box.append(resetBtn); };
  yes.addEventListener("click", () => { mutate(() => {
    if (tab === "cuts") Object.assign(S, { cut: null, restoredFillers: [], restoredPauses: [], trimmedPauses: [] });
    if (tab === "graphics") S.board = {};
    if (tab === "captions") S.captions = null;
    if (tab === "sound") S.sfxOff = {};
  }); back(); });
  no.addEventListener("click", back); msg.append(yes, no); box.append(msg);
});
const resetBtn = $("#reset");

// ---------- playback: line (raw) and continuous rough cut ----------
let pos = 0;   // where the rough cut is, in cut time: pause, scrub and ±5 s all keep it
function stopPlay() { mode = "idle"; cancelAnimationFrame(loop); v.pause(); v.playbackRate = 1; $("#rough").textContent = "Play rough cut"; }
function setPos(c) {
  pos = Math.max(0, Math.min(c, P.cutDur - 0.05));
  $("#scrub").max = P.cutDur.toFixed(1); $("#scrub").value = pos.toFixed(1);
  $("#pos").textContent = `${fmt(pos)} / ${fmt(P.cutDur)}`; $("#clock").textContent = `cut ${fmt(pos)} / ${fmt(P.cutDur)}`;
}
function seekCut(c) {   // jump within the rough cut; keeps playing if it was playing, else shows that frame
  setPos(c); v.currentTime = P.toSrc(pos); $("#clock").hidden = false;
  if (mode !== "rough") { mode = "roughPaused"; overlay(pos); }
}
$("#scrub").addEventListener("input", e => seekCut(+e.target.value));
$("#back5").addEventListener("click", () => seekCut(pos - 5));
$("#fwd5").addEventListener("click", () => seekCut(pos + 5));
function playLine(s, e) {
  stopPlay(); mode = "line"; v.currentTime = s; v.play().catch(() => { stopPlay(); pill("Playback was blocked. Tap the time again.", true); });
  const tick = () => { if (mode !== "line") return; if (v.currentTime >= e) { stopPlay(); return; } overlay(); loop = requestAnimationFrame(tick); };
  loop = requestAnimationFrame(tick);
}
function playRough(fromCut = pos) {
  if (fromCut >= P.cutDur - 0.1) fromCut = 0;
  stopPlay(); mode = "rough"; v.playbackRate = P.speed; setPos(fromCut); v.currentTime = P.toSrc(pos); $("#clock").hidden = false;
  $("#rough").textContent = "Pause";
  v.play().catch(() => { stopPlay(); pill("Playback was blocked. Tap Play rough cut again.", true); });
  const tick = () => {
    if (mode !== "rough") return;
    const t = v.currentTime, sp = P.spans;
    const k = sp.findIndex(([a, b]) => t < b);
    if (k === -1) { stopPlay(); mode = "roughPaused"; setPos(P.cutDur); return; }
    if (t < sp[k][0] - 0.02) v.currentTime = sp[k][0];          // inside a cut: jump to the next kept span
    const c = P.toCut(Math.max(t, sp[k][0]));
    setPos(c); overlay(c); loop = requestAnimationFrame(tick);
  };
  loop = requestAnimationFrame(tick);
}
$("#rough").addEventListener("click", () => { if (mode === "rough") { stopPlay(); mode = "roughPaused"; overlay(pos); } else playRough(pos); });
v.addEventListener("error", () => pill("The video didn't load. Reload the page; if it keeps failing, ask Claude to re-upload it.", true));

// overlay at a cut time: approximate graphic boxes + caption style preview
function overlay(c) {
  ov.textContent = "";
  if (!R || tab === "preview" || c == null || (mode !== "rough" && mode !== "roughPaused")) { highlight(null); return; }
  for (const g of GFX) if (!g.gone && g.state !== "d" && c >= g.start && c < g.end) ov.appendChild(box(g, true));
  const cap = CAPS.find(x => !x.gone && c >= x.start && c < x.end);
  if (cap && cap.pos !== "hide") { const shown = shownCap(cap, c), el = capEl(shown, capModeNow() === "spoken"); ov.appendChild(el); fitCap(el); }
  highlight(c, cap);
}
function box(g, label) {
  const [x, y, w, h] = g.place || [90, 200, 900, 500];
  const el = document.createElement("div"); el.className = "gbox";
  Object.assign(el.style, { left: x / 10.8 + "%", top: y / 19.2 + "%", width: w / 10.8 + "%", height: h / 19.2 + "%" });
  if (g.imgUrl) el.style.backgroundImage = `linear-gradient(rgba(185,200,165,.2),rgba(185,200,165,.2)),url(${JSON.stringify(g.imgUrl)})`;
  if (label) el.textContent = g.kind;
  return el;
}
function capEl(cap, plain) {   // plain: the highlighted word keeps the same font and size (spoken mode)
  const st = R.style, W = $("#player").clientWidth, one = cap.words.length === 1;
  const el = document.createElement("div"); el.className = "capov" + (st.editorial && !one ? " ed" : "");
  const base = (hlNow().size || st.capSize) / 1080 * W * (one ? 1.35 : 1);
  Object.assign(el.style, { top: capTop(cap) / 19.2 + "%", fontFamily: "rb, var(--f-body)", fontSize: base + "px", color: hlNow().words || st.cap });
  for (const w of cap.words) {
    const s = document.createElement("span");
    if (w.accent && plain) { const hl = hlNow(); s.className = "a now"; s.style.color = hl.text; if (hl.bg !== "none") Object.assign(s.style, { background: hl.bg, padding: ".02em .16em .08em", borderRadius: ".16em", textShadow: "none" }); }
    else if (w.accent) { const hl = hlNow(); s.className = "a"; Object.assign(s.style, { fontFamily: "ra, Georgia, serif", fontStyle: "italic", color: hl.text, fontSize: (st.editorial ? 1.7 : 1.12) + "em" });
      if (hl.bg !== "none") Object.assign(s.style, { background: hl.bg, padding: ".02em .2em .08em", borderRadius: ".16em", textShadow: "none", boxDecorationBreak: "clone", webkitBoxDecorationBreak: "clone" }, st.editorial && cap.words.length > 1 ? { width: "fit-content", margin: ".06em auto" } : {}); }
    const t = w.text.replace(/[.,!?;:]+$/, "");   // captions carry no punctuation
    s.textContent = (st.case === "lower" ? t.toLowerCase() : t) + " "; el.appendChild(s);
  }
  const bx = hlNow().box;   // 0.27.0: the box behind all the words
  if (bx && bx !== "none") { const wrap = document.createElement("span"); Object.assign(wrap.style, { background: bx, padding: ".05em .25em", borderRadius: ".2em", lineHeight: "1.5", boxDecorationBreak: "clone", webkitBoxDecorationBreak: "clone", textShadow: "none" }); wrap.append(...el.childNodes); el.appendChild(wrap); }
  return el;
}
function fitCap(el) {   // shrink until the widest word fits the frame, measured in the real fonts (the render does the same)
  let fs = parseFloat(el.style.fontSize);
  for (let i = 0; i < 25 && el.scrollWidth > el.clientWidth + 1; i++) { fs *= 0.92; el.style.fontSize = fs + "px"; }
}
function highlight(c, cap) {
  $$(".card").forEach(el => { const g = GFX.find(x => x.id === el.dataset.id); el.classList.toggle("now", c != null && g && !g.gone && c >= g.start && c < g.end); });
  $$(".caprow").forEach(el => el.classList.toggle("now", !!cap && +el.dataset.ci === cap.ci));
  if (mode === "line" || mode === "rough") { const t = v.currentTime; $$(".w").forEach(e => { const w = R.words[+e.dataset.i]; e.classList.toggle("now", t >= w.s && t < w.e); }); }
}

// ---------- 1. cuts ----------
function renderCuts() {
  const tx = $("#tx"); tx.textContent = "";
  const cut = new Set(S.cut || R.proposedCut), fb = new Set(S.restoredFillers);
  const pz = new Map(P.pauses.map(p => [p.after, p]));
  // 0.26.0: false starts found by the editor, labelled so the person can see why a word is cut
  const FS = new Map(); for (const f of R.falseStarts || []) f.w.forEach((i, k) => FS.set(i, { f, last: k === f.w.length - 1 }));
  const FSNAME = { doubled: "doubled word", restart: "false start", "cut-off": "broken-off word", retake: "said twice" };
  const sents = []; let cur = [];
  R.words.forEach((w, i) => { cur.push(i); if (/[.?!]$/.test(w.text) || i === R.words.length - 1) { sents.push(cur); cur = []; } });
  for (const idx of sents) {
    const row = document.createElement("div"); row.className = "sent";
    const ts = document.createElement("button"); ts.className = "ts"; ts.type = "button";
    ts.innerHTML = `<span class="src">${fmt(R.words[idx[0]].s)}</span>`; ts.title = "Play this line from the raw clip";
    ts.addEventListener("click", () => playLine(R.words[idx[0]].s, R.words[idx[idx.length - 1]].e + 0.2));
    const ws = document.createElement("div"); ws.className = "words";
    for (const i of idx) {
      const w = R.words[i], s = document.createElement("span");
      s.className = "w" + (w.filler ? " filler" + (fb.has(i) ? " back" : "") : cut.has(i) ? " cut" : "");
      s.tabIndex = 0; s.setAttribute("role", "button"); s.dataset.i = i; s.textContent = w.text;
      s.title = w.filler ? (w.stumble ? (fb.has(i) ? "Repeated word kept (tap to remove again)" : "Repeated word removed automatically (tap to keep)") : fb.has(i) ? "Filler kept (tap to remove again)" : "Filler removed automatically (tap to keep)") : "";
      const fs = FS.get(i);
      if (fs) { s.classList.add("fs"); s.title = `${FSNAME[fs.f.kind] || "false start"}: ${fs.f.why}. ${cut.has(i) ? "Tap to keep it" : "Kept. Tap to cut it"}`; }
      ws.appendChild(s);
      if (fs && fs.last) { const l = document.createElement("span"); l.className = "fsl"; l.textContent = FSNAME[fs.f.kind] || "false start"; ws.appendChild(l); }
      const p = pz.get(i);
      if (p) {
        const b = document.createElement("button"); b.type = "button"; b.className = "pz" + (p.kept ? " kept" : "");
        b.textContent = `⏸ ${p.len.toFixed(2)}s ${p.kept ? "kept" : "trimmed"}`;
        b.title = p.kept ? "Pause kept. Tap to trim it" : "Pause trimmed to ~0.1 s. Tap to keep it";
        b.addEventListener("click", () => mutate(() => {
          const keepDefault = (R.keepPauses || []).includes(i);
          S.restoredPauses = S.restoredPauses.filter(x => x !== i); S.trimmedPauses = S.trimmedPauses.filter(x => x !== i);
          if (p.kept) { if (keepDefault) S.trimmedPauses.push(i); } else if (!keepDefault) S.restoredPauses.push(i);
        }));
        ws.appendChild(b);
      }
    }
    row.append(ts, ws); tx.appendChild(row);
  }
  const words = [...cut].length, fills = R.words.filter((w, i) => w.filler && !fb.has(i)).length, pt = P.pauses.filter(p => !p.kept).length;
  const nfs = (R.falseStarts || []).filter(f => f.w.some(i => cut.has(i))).length;
  $("#ctally").innerHTML = `<span>reel <b>${fmt(P.cutDur)}</b></span><span><b>${words}</b> words cut</span>${(R.falseStarts || []).length ? `<span><b>${nfs}</b> of ${R.falseStarts.length} false starts cut</span>` : ""}<span><b>${fills}</b> fillers removed</span><span><b>${pt}</b> of ${P.pauses.length} pauses trimmed</span>`;
}
(function wireCuts() {
  const tx = $("#tx"); let drag = null;
  const toggle = (i, val) => { const set = new Set(S.cut || R.proposedCut); val ? set.add(i) : set.delete(i); S.cut = [...set].sort((a, b) => a - b); };
  tx.addEventListener("pointerdown", e => {
    const w = e.target.closest(".w"); if (!w) return; e.preventDefault();
    const i = +w.dataset.i;
    if (R.words[i].filler) { mutate(() => { const fb = new Set(S.restoredFillers); fb.has(i) ? fb.delete(i) : fb.add(i); S.restoredFillers = [...fb]; }); return; }
    pushUndo(); syncUndo();
    drag = { start: i, val: !(S.cut || R.proposedCut).includes(i), base: JSON.stringify(S.cut || R.proposedCut) };
    toggle(i, drag.val); recompute(); renderCuts();
  });
  tx.addEventListener("pointermove", e => {
    if (!drag) return;
    const w = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".w"); if (!w) return;
    S.cut = JSON.parse(drag.base); const j = +w.dataset.i, [lo, hi] = drag.start < j ? [drag.start, j] : [j, drag.start];
    for (let i = lo; i <= hi; i++) if (!R.words[i].filler) toggle(i, drag.val);
    recompute(); renderCuts();
  });
  window.addEventListener("pointerup", () => { if (drag) { drag = null; renderAll(); queueSave(); syncUndo(); } });
  tx.addEventListener("keydown", e => {
    const w = e.target.closest(".w"); if (!w || (e.key !== "Enter" && e.key !== " ")) return; e.preventDefault();
    const i = +w.dataset.i;
    mutate(() => { if (R.words[i].filler) { const fb = new Set(S.restoredFillers); fb.has(i) ? fb.delete(i) : fb.add(i); S.restoredFillers = [...fb]; } else toggle(i, !(S.cut || R.proposedCut).includes(i)); });
  });
})();

// ---------- 2. graphics ----------
const LABEL = { k: "Keep", c: "Change", d: "Drop" };
function placeText(g) {
  const [x, y, w, h] = g.place || [0, 0, 1080, 1920];
  if (w >= 1000 && h >= 1800) return "Full screen";
  const mid = y + h / 2; return (mid < 700 ? "Top, above your head" : mid < 1250 ? "Middle" : "Lower third") + (w < 600 ? (x + w / 2 < 540 ? ", left" : ", right") : "");
}
// Added by By Mel Ross (0.28.0): change a graphic's words on the review page. Saved as board[id].set; the import writes them
// into the card, so no note to Claude is needed for a typo or a better word.
const WORD_FIELDS = { title: [["text", "Words"]], tag: [["text", "Words"]], cta: [["text", "Words"]], note: [["text", "Words"]], quote: [["text", "Words"]],
  arctitle: [["text", "Arched words"], ["sub", "Line under it"]], card: [["title", "List title"], ["rows", "Rows, one per line"]], chips: [["title", "Title"]],
  stat: [["value", "The number"], ["label", "Words above it"], ["delta", "The change"]], xlist: [["items", "Lines, one per line"]], shot: [["label", "Label"]] };
function wordsBox(g) {
  const box = document.createElement("div"); box.className = "gwords";
  const set = (S.board[g.id] || {}).set || {};
  for (const [f, name] of WORD_FIELDS[g.type]) {
    const list = f === "rows" || f === "items", now = f in set ? set[f] : g[f];
    if (now == null && f === "delta") continue;
    const lab = document.createElement("label"); lab.className = "lede"; lab.textContent = name;
    const inp = document.createElement(list ? "textarea" : "input"); if (!list) inp.type = "text";
    inp.value = list ? (now || []).join("\n") : (now ?? ""); inp.maxLength = list ? 300 : 80; if (list) inp.rows = Math.max(3, (now || []).length);
    inp.dataset.wf = f; inp.setAttribute("aria-label", `${name} for ${g.id}`);
    inp.addEventListener("change", () => mutate(() => {
      const cur = { ...(S.board[g.id] || {}) }, s2 = { ...(cur.set || {}) };
      const v = list ? inp.value.split("\n").map(x => x.trim()).filter(Boolean).slice(0, 6) : inp.value.trim();
      const orig = g[f]; if (JSON.stringify(v) === JSON.stringify(orig) || (!list && !v && f !== "sub" && f !== "delta")) delete s2[f]; else s2[f] = v;
      if (Object.keys(s2).length) cur.set = s2; else delete cur.set; S.board[g.id] = cur;
    }));
    lab.appendChild(inp); box.appendChild(lab);
  }
  if (Object.keys(set).length) { const n = document.createElement("p"); n.className = "lede"; n.textContent = "New words saved. They go in at the next build."; box.appendChild(n); }
  return box;
}
function renderGraphics() {
  const box = $("#cards"); box.textContent = ""; const n = { k: 0, c: 0, d: 0 };
  for (const g of GFX) {
    const st = (S.board[g.id] || {}).state || "k"; n[st]++;
    const el = document.createElement("div"); el.className = "card" + (st === "d" ? " dropped" : ""); el.dataset.id = g.id;
    const th = document.createElement("div");
    const tb = document.createElement("div"); tb.className = "thumb"; if (g.thumbUrl) tb.style.backgroundImage = `url(${JSON.stringify(g.thumbUrl)})`;
    tb.appendChild(box_(g)); const ap = document.createElement("div"); ap.className = "approx"; ap.textContent = "Approx. layout";
    th.append(tb, ap);
    const body = document.createElement("div");
    const kind = document.createElement("div"); kind.className = "kind"; kind.textContent = g.kind;
    const what = document.createElement("div"); what.className = "what"; what.textContent = g.what;
    const meta = document.createElement("div"); meta.className = "meta";
    if (g.gone) meta.innerHTML = `<span class="warnline">Its line is cut, so this graphic won't appear.</span>`;
    else {
      const t = document.createElement("button"); t.className = "ts"; t.type = "button"; t.innerHTML = `<span class="tc">${fmt(g.start)}</span>`;
      t.title = "Play the rough cut from here"; t.addEventListener("click", () => playRough(g.start));
      meta.append(t);
      const d = document.createElement("span"); d.textContent = `${(g.end - g.start).toFixed(1)} s on screen`; meta.append(d);
      const p = document.createElement("span"); p.textContent = placeText(g); meta.append(p);
      if (g.moved) { const m = document.createElement("span"); m.className = "warnline"; m.textContent = "Its first word is cut, so it moved to the next kept word."; meta.append(m); }
    }
    const seg = document.createElement("div"); seg.className = "seg"; seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Decision for " + g.kind);
    for (const k of ["k", "c", "d"]) {
      const b = document.createElement("button"); b.type = "button"; b.className = k; b.textContent = LABEL[k]; b.setAttribute("aria-pressed", st === k);
      b.addEventListener("click", () => mutate(() => { S.board[g.id] = { ...(S.board[g.id] || {}), state: k }; }));
      seg.appendChild(b);
    }
    body.append(kind, what, meta, seg);
    if (st !== "d" && !g.gone) body.appendChild(placer(S.board[g.id] || {}, (k, v) => mutate(() => { const cur = { ...(S.board[g.id] || {}) }; if (v) cur[k] = v; else delete cur[k]; S.board[g.id] = cur; })));
    if (st !== "d" && !g.gone && WORD_FIELDS[g.type]) body.appendChild(wordsBox(g));   // 0.28.0: change the words here
    if (st === "c") {
      const inp = document.createElement("input"); inp.type = "text"; inp.id = "note-" + g.id; inp.placeholder = "What should change?"; inp.value = (S.board[g.id] || {}).note || "";
      inp.addEventListener("input", () => { S.board[g.id] = { ...(S.board[g.id] || { state: "c" }), note: inp.value }; queueSave(); });
      body.appendChild(inp);
      body.appendChild(uploader((S.board[g.id] || {}).files || [], files => mutate(() => { S.board[g.id] = { ...(S.board[g.id] || { state: "c" }), files }; })));
    }
    el.append(th, body); box.appendChild(el);
  }
  $("#gtally").innerHTML = `<span><b>${GFX.length}</b> graphics</span><span><b>${n.k}</b> keep</span><span><b>${n.c}</b> change</span><span><b>${n.d}</b> drop</span>`;
}
const box_ = g => box(g, false);
// Where a graphic goes (Added by By Mel Ross, 0.16.0): chosen here, before the build. "As planned" leaves it to the plan.
const WHERE = [["", "Where: as planned"], ["center", "Middle (covers part of my face)"], ["top-center", "Top, above my head"], ["top-left", "Top left"], ["top-right", "Top right"], ["middle-left", "Left of my face"], ["middle-right", "Right of my face"], ["lower", "Bottom (lower third)"]];
const LAYER = [["", "Layer: as planned"], ["front", "In front of my face"], ["behind", "Behind my head (Mac only)"]];
function placer(cur, set) {
  const row = document.createElement("div"); row.className = "placer";
  const w = document.createElement("select"); w.setAttribute("aria-label", "Where on screen"); w.append(...WHERE.map(([v, t]) => new Option(t, v))); w.value = cur.where || "";
  const l = document.createElement("select"); l.setAttribute("aria-label", "In front of my face or behind my head"); l.append(...LAYER.map(([v, t]) => new Option(t, v))); l.value = cur.layer || "";
  w.addEventListener("change", () => set("where", w.value)); l.addEventListener("change", () => set("layer", l.value));
  row.append(w, l); return row;
}

// Their own pictures for a graphic (Added by By Mel Ross, 0.10.2). Only at the local Reel Studio link: the picture is saved in the
// reel folder (popups/) and its path travels with the decision, so Claude uses that file when it builds the graphic.
function uploader(files, onChange) {
  const wrap = document.createElement("div"); wrap.className = "upl";
  if (!window.REEL_STUDIO_LINKS) return wrap;
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*,video/mp4,video/quicktime,.gif,.heic,.heif,.svg,.mp4,.mov,.m4v"; inp.multiple = true; inp.hidden = true;
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "b quiet"; btn.textContent = files.length ? "Add another" : "Use my own picture, GIF or video clip";
  const msg = document.createElement("span"); msg.className = "lede";
  btn.addEventListener("click", () => inp.click());
  inp.addEventListener("change", async () => {
    const got = [...files];
    for (const f of inp.files) {
      msg.textContent = `Uploading ${f.name}…`;
      try {
        const r = await fetch("/api/review-upload?name=" + encodeURIComponent(f.name), { method: "POST", body: f }), j = await r.json();
        if (!j.ok) throw new Error(j.error || "upload failed");
        got.push(j.upload.src);
      } catch (e) { msg.textContent = `${f.name}: ${e.message}`; msg.classList.add("warnline"); return; }
    }
    onChange(got.slice(0, 6));
  });
  // GIPHY search (their own free key, kept on this computer; see references/giphy.md). The page asks GIPHY for small previews;
  // the picked GIF is downloaded by the local server into the reel folder, like an upload.
  const gbtn = document.createElement("button"); gbtn.type = "button"; gbtn.className = "b quiet"; gbtn.textContent = "Search GIPHY";
  const gbox = document.createElement("div"); gbox.className = "giphy"; gbox.hidden = true;
  const gq = document.createElement("input"); gq.type = "search"; gq.placeholder = "Search GIFs, e.g. mind blown"; gq.setAttribute("aria-label", "Search GIPHY");
  const kind = document.createElement("select"); kind.setAttribute("aria-label", "GIFs or stickers"); kind.append(new Option("GIFs", "gifs"), new Option("Stickers (see-through)", "stickers"));
  const go = document.createElement("button"); go.type = "button"; go.className = "b"; go.textContent = "Search";
  const grid = document.createElement("div"); grid.className = "ggrid"; const gnote = document.createElement("p"); gnote.className = "lede";
  const credit = document.createElement("p"); credit.className = "lede"; credit.textContent = "Powered by GIPHY";
  const search = async () => {
    const q = gq.value.trim(); if (!q) return gq.focus();
    gnote.textContent = "Searching…"; grid.textContent = "";
    try {
      const { key } = await (await fetch("/api/review-giphy-key")).json();
      if (!key) { gnote.textContent = ""; keyForm(); return; }
      const u = new URL(`https://api.giphy.com/v1/${kind.value}/search`); u.search = new URLSearchParams({ api_key: key, q, limit: "12", rating: "g", bundle: "messaging_non_clips" });
      const r = await fetch(u); if (r.status === 429) throw new Error("GIPHY's hourly limit is used up for this key. Try again later.");
      if (!r.ok) throw new Error(`GIPHY said no (${r.status}). Ask Claude to check the key.`);
      const items = ((await r.json()).data || []).map(d => ({ id: d.id, title: d.title || "GIF", preview: d.images?.fixed_width_small?.url || d.images?.fixed_width?.url || "" })).filter(g => /^https:\/\/[\w-]+\.giphy\.com\//.test(g.preview));
      gnote.textContent = items.length ? "Tap one to use it for this graphic." : "Nothing found. Try other words.";
      for (const g of items) {
        const b = document.createElement("button"); b.type = "button"; b.title = g.title; const im = document.createElement("img"); im.src = g.preview; im.alt = g.title; im.loading = "lazy"; b.append(im);
        b.addEventListener("click", async () => {
          gnote.textContent = "Adding it…";
          try {
            const j = await (await fetch("/api/review-giphy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: g.id }) })).json();
            if (!j.ok) throw new Error(j.error || "couldn't add it");
            onChange([...files, j.upload.src].slice(0, 6));
          } catch (e) { gnote.textContent = e.message; }
        });
        grid.append(b);
      }
    } catch (e) { gnote.textContent = e.message; }
  };
  // 0.15.0: no key yet? The page takes it here and saves it on this computer. Nobody opens a hidden file.
  const keyForm = () => {
    if (gbox.querySelector(".gkey")) return gbox.querySelector(".gkey input").focus();
    const box = document.createElement("div"); box.className = "gkey";
    const say = document.createElement("p"); say.className = "lede"; say.append("GIPHY needs a free key, once. ");
    const a = document.createElement("a"); a.href = "https://developers.giphy.com/dashboard/"; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Get one at developers.giphy.com";
    say.append(a, ". Choose API (not SDK), copy the key, and paste it here.");
    const kin = document.createElement("input"); kin.type = "password"; kin.placeholder = "Paste your GIPHY key"; kin.autocomplete = "off"; kin.setAttribute("aria-label", "Your GIPHY key");
    const save = document.createElement("button"); save.type = "button"; save.className = "b"; save.textContent = "Save key";
    const out = document.createElement("p"); out.className = "lede";
    const doSave = async () => {
      out.classList.remove("warnline"); out.textContent = "Checking the key…";
      try {
        const j = await (await fetch("/api/giphy-key-save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: kin.value }) })).json();
        if (!j.ok) throw new Error(j.error || "couldn't save it");
        box.remove(); gnote.textContent = j.tested ? "GIPHY is connected." : "Key saved. This computer couldn't reach GIPHY to test it yet."; if (gq.value.trim()) search(); else gq.focus();
      } catch (e) { out.textContent = e.message; out.classList.add("warnline"); }
    };
    save.addEventListener("click", doSave); kin.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); doSave(); } });
    const krow = document.createElement("div"); krow.className = "ctl"; krow.append(kin, save); box.append(say, krow, out); gbox.insertBefore(box, gbox.firstChild); kin.focus();
  };
  go.addEventListener("click", search); gq.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); search(); } });
  gbtn.addEventListener("click", async () => {
    gbox.hidden = !gbox.hidden; if (gbox.hidden) return; gq.focus();
    try { const { key } = await (await fetch("/api/review-giphy-key")).json(); if (!key) keyForm(); } catch { /* the search will say what's wrong */ }
  });
  const row = document.createElement("div"); row.className = "ctl"; row.append(gq, kind, go); gbox.append(row, gnote, grid, credit);
  wrap.append(btn, gbtn, inp, msg, gbox);
  files.forEach((src, k) => {
    const chip = document.createElement("span"); chip.className = "upchip";
    const clip = /\.(mp4|mov|m4v|webm)$/i.test(src);                // 0.13.0: a video clip shows its first moment
    const im = document.createElement(clip ? "video" : "img"); im.src = "/files/" + src + (clip ? "#t=0.5" : "");
    if (clip) { im.muted = true; im.playsInline = true; im.preload = "metadata"; } else im.alt = "";
    const rm = document.createElement("button"); rm.type = "button"; rm.textContent = "×"; rm.title = "Remove this picture"; rm.setAttribute("aria-label", "Remove this picture");
    rm.addEventListener("click", () => onChange(files.filter((_, i) => i !== k)));
    chip.append(im, rm); wrap.append(chip);
  });
  return wrap;
}

// ---------- 2b. ask for more graphics (Added by By Mel Ross, 0.10.1) ----------
// The page can't design a graphic, so these are requests: Claude builds each one when the decisions are imported
// (review_sync.py prints them as GRAPHIC WANTED / GRAPHICS AMOUNT). They change the build fingerprint like any other decision.
const KINDS = [
  ["choose", "You choose what fits", ""],
  ["title", "Big headline", ""],
  ["list", "List that builds row by row", ""],
  ["checks", "Check or X list", ""],
  ["label", "Small label", ""],
  ["note", "Handwritten note on taped paper", ""],
  ["number", "Number or stat card", ""],
  ["photo", "My photo or screenshot", "Put the picture in the reel folder, or say which site to screenshot."],
  ["clip", "My video clip or screen recording", "Upload it once the request is added, with the button on its card. It plays in a small window, without sound."],
  ["gif", "GIF", "Say what the GIF should be. You can also search and place GIFs yourself on the touch-ups page after the build."],
  ["carousel", "Animation: picture carousel", "Needs 3 or more pictures from you."],
  ["chart", "Animation: chart that draws itself", "Say the numbers."],
  ["counter", "Animation: number that counts up", "Say the number."],
  ["follow", "Animation: words written across the screen", ""],
  ["social", "Animation: comment, message or notification", "Say what it should read."],
  ["orbit", "Photos circling my head", "Needs 1 to 6 pictures from you. Mac only."],
];
const AMOUNT = { few: "About 1 every 10 seconds.", some: "About 1 every 5 seconds.", lots: "About 1 every 3 seconds." };
const capText = c => c.words.map(w => w.text).join(" ");
function renderWanted() {
  const cur = S.amount || R.graphicsAmount || "some";
  $$("#amount button").forEach(b => b.setAttribute("aria-pressed", b.dataset.amt === cur));
  $("#amountnote").textContent = AMOUNT[cur] + (S.amount && S.amount !== (R.graphicsAmount || "some") ? " Claude re-plans the graphics when you send this, so the list below is the old plan." : "");
  const box = $("#wanted"); box.textContent = "";
  for (const w of S.wanted || []) {
    if (w.done) continue;   // 0.16.0: Claude added it to the plan, so it shows in the list below now
    const el = document.createElement("div"); el.className = "card wanted";
    const body = document.createElement("div");
    const kind = document.createElement("div"); kind.className = "kind"; kind.textContent = "You asked for: " + (KINDS.find(k => k[0] === w.kind) || KINDS[0])[1];
    const what = document.createElement("div"); what.className = "what"; what.textContent = w.note || "No details given. Claude picks.";
    const meta = document.createElement("div"); meta.className = "meta";
    const line = document.createElement("span"); line.textContent = `At "${w.line}"`; meta.append(line);
    const rm = document.createElement("button"); rm.type = "button"; rm.className = "b quiet"; rm.textContent = "Remove";
    rm.addEventListener("click", () => mutate(() => { S.wanted = S.wanted.filter(x => x.id !== w.id); }));
    body.append(kind, what, meta, placer(w, (k, v) => mutate(() => { S.wanted = S.wanted.map(x => { if (x.id !== w.id) return x; const y = { ...x }; if (v) y[k] = v; else delete y[k]; return y; }); })),
      uploader(w.files || [], files => mutate(() => { S.wanted = S.wanted.map(x => x.id === w.id ? { ...x, files } : x); })), rm); el.append(body); box.appendChild(el);
  }
  if ((S.wanted || []).some(w => !w.done)) $("#gtally").insertAdjacentHTML("beforeend", `<span><b>${S.wanted.filter(w => !w.done).length}</b> asked for</span>`);
}
$$("#amount button").forEach(b => b.addEventListener("click", () => mutate(() => { S.amount = b.dataset.amt === (R.graphicsAmount || "some") ? null : b.dataset.amt; })));
$("#addkind").append(...KINDS.map(([v, t]) => new Option(t, v)));
$("#addkind").addEventListener("change", () => { $("#addhint").textContent = (KINDS.find(k => k[0] === $("#addkind").value) || [])[2] || ""; });
$("#addg").addEventListener("click", () => {
  const sel = $("#addwhen"); sel.textContent = "";
  for (const c of CAPS.filter(c => !c.gone)) sel.append(new Option(`${fmt(c.start)}  ${capText(c)}`.slice(0, 70), String(c.ci)));
  if (!sel.options.length) sel.append(new Option("At the start of the reel", "start"));   // audit 3: a clip with no spoken lines had an empty list, and Add it did nothing
  $("#addform").hidden = false; $("#addg").hidden = true; $("#addnote").value = ""; $("#addkind").value = "choose"; $("#addhint").textContent = ""; sel.focus();
});
const closeAdd = () => { $("#addform").hidden = true; $("#addg").hidden = false; };
$("#addcancel").addEventListener("click", closeAdd);
$("#addform").addEventListener("submit", e => {
  e.preventDefault();
  const c = CAPS.find(c => String(c.ci) === $("#addwhen").value);
  if (!c && $("#addwhen").value !== "start") return closeAdd();
  const w = { id: "w" + Date.now().toString(36), kind: $("#addkind").value, ci: c ? c.ci : null, word: c ? (c.words[0].i ?? null) : null, line: c ? capText(c).slice(0, 80) : "the start of the reel", note: $("#addnote").value.trim().slice(0, 300) };
  mutate(() => { S.wanted = [...(S.wanted || []), w]; }); closeAdd();
});

// ---------- 3. captions ----------
// Added by By Mel Ross (0.26.0): where captions sit. The layout puts them all at the bottom or above the head; a stretch of
// captions can be moved to the top, the middle or the bottom, or hidden. Whole captions only, so nothing jumps mid-line.
const ZONE_NAME = { top: "top", middle: "middle", bottom: "bottom", hide: "hidden" };
function layoutNow() { return S.layout || (R && R.style && R.style.layout) || "captions-low"; }
function capTop(cap) {
  const z = (R && R.style && R.style.zones) || { top: 290, middle: 900, bottom: R ? R.style.capY : 1250 };
  if (cap && z[cap.pos] != null) return z[cap.pos];
  return layoutNow() === "captions-high" ? z.top : z.bottom;
}
let capPick = null;   // null = not choosing; [] = waiting for the first caption; [ci] = waiting for the last; [a, b] = choose a spot
let capSpotsOpen = false;   // 0.34.2: remember the fold while the page redraws
function renderCapSpots() {
  const el = $("#capspots"); if (!el || !R) return;
  const high = layoutNow() === "captions-high";
  const moved = CAPS.filter(c => !c.gone && c.pos).length;
  // 0.34.2: folded. Most reels keep the default, and it's easiest to judge on the finished reel (Touch-ups has it too)
  let h = `<details class="spotfold"${high || capSpotsOpen ? " open" : ""}><summary><b>Captions above your head instead?</b> <span class="lede">${high ? "On for this reel." : "Most reels keep them at the bottom."}</span></summary>
    <p class="lede">Easiest to judge once you see the reel: Touch-ups has the same switch. Tap one and the player shows a caption there.</p><div class="ctl"><button class="b${high ? " quiet" : ""}" type="button" data-lay="captions-low">At the bottom</button><button class="b${high ? "" : " quiet"}" type="button" data-lay="captions-high">Above my head</button></div>
    <p class="lede">${high ? "Captions sit above your head. Text graphics move to the lower third." : "Captions sit at the bottom. Text graphics sit near the top."} This is for this reel. For every reel, use Settings on the Touch-ups page. When a graphic covers the captions, they move to the other spot for that moment.</p></details>`;
  if (capPick == null) h += `<div class="ctl"><button class="b quiet" type="button" id="capmove">Move some captions</button>${moved ? `<button class="b quiet" type="button" id="capclear">Put all ${moved} back</button>` : ""}</div>`;
  else if (capPick.length < 2) h += `<p class="lede"><b>${capPick.length ? "Now tap the last caption to move." : "Tap the first caption to move."}</b> Tap its time on the left.</p><div class="ctl"><button class="b quiet" type="button" id="capcancel">Cancel</button></div>`;
  else h += `<p class="lede"><b>Move captions ${capPick[0] + 1} to ${capPick[1] + 1} to:</b></p><div class="ctl">${["top", "middle", "bottom", "hide"].map(p => `<button class="b quiet" type="button" data-spot="${p}">${p === "hide" ? "Hide them" : p[0].toUpperCase() + p.slice(1)}</button>`).join("")}<button class="b quiet" type="button" data-spot="">Usual spot</button><button class="b quiet" type="button" id="capcancel">Cancel</button></div>`;
  el.innerHTML = h;
  el.querySelector(".spotfold")?.addEventListener("toggle", (e) => { capSpotsOpen = e.target.open; });
  el.querySelectorAll("[data-lay]").forEach(b => b.addEventListener("click", () => { capSpotsOpen = true; mutate(() => { S.layout = b.dataset.lay === (R.style.layout || "captions-low") ? null : b.dataset.lay; }); showCaptionSample(); }));
  const on = (id, fn) => { const b = el.querySelector("#" + id); if (b) b.addEventListener("click", fn); };
  on("capmove", () => { capPick = []; renderCaptions(); });
  on("capcancel", () => { capPick = null; renderCaptions(); });
  on("capclear", () => mutate(() => { for (const c of capsEditable()) delete c.pos; }));
  el.querySelectorAll("[data-spot]").forEach(b => b.addEventListener("click", () => { const [a, z] = capPick; capPick = null;
    mutate(() => { const arr = capsEditable(); for (let k = Math.min(a, z); k <= Math.max(a, z); k++) { if (b.dataset.spot) arr[k].pos = b.dataset.spot; else delete arr[k].pos; } }); }));
}
function capsEditable() { if (!S.captions) S.captions = JSON.parse(JSON.stringify(R.captions)); return S.captions; }
function renderCaptions() {
  const box = $("#caps"); box.textContent = "";
  const live = CAPS.filter(c => !c.gone);
  for (const c of CAPS) {
    const src = (S.captions || R.captions)[c.ci];
    const row = document.createElement("div"); row.className = "caprow" + (c.gone ? " gone" : ""); row.dataset.ci = c.ci;
    const ts = document.createElement("button"); ts.className = "ts"; ts.type = "button";
    const cw = document.createElement("div"); cw.className = "cw";
    if (c.gone) {
      ts.textContent = "cut out"; ts.disabled = true;
      cw.textContent = src.text || src.w.map(i => R.words[i].text).join(" ");
      row.append(ts, cw, document.createElement("span")); box.appendChild(row); continue;
    }
    ts.innerHTML = `<span class="tc">${fmt(c.start)}</span>`;
    ts.addEventListener("click", () => { if (capPick == null) return playRough(c.start); capPick.push(c.ci); if (capPick.length === 2) capPick.sort((x, y) => x - y); renderCaptions(); });
    if (capPick != null && capPick.includes(c.ci)) row.classList.add("now");
    if (capPick && capPick.length === 2 && c.ci > capPick[0] && c.ci < capPick[1]) row.classList.add("now");
    c.words.forEach((w, k) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "x" + (w.accent ? " acc" : ""); b.textContent = w.text;
      b.title = w.accent ? "Accent (tap for plain)" : "Tap to make this an accent";
      b.addEventListener("click", () => mutate(() => {
        const cc = capsEditable()[c.ci];
        if (cc.text) { const a = new Set(cc.accText || []); a.has(k) ? a.delete(k) : a.add(k); cc.accText = [...a]; }
        else { const a = new Set(cc.acc || []); a.has(w.i) ? a.delete(w.i) : a.add(w.i); cc.acc = [...a]; }
      }));
      cw.appendChild(b);
    });
    if (c.pos) { const f = document.createElement("span"); f.className = "flag"; f.textContent = c.pos === "hide" ? "hidden" : "moved to the " + ZONE_NAME[c.pos]; cw.appendChild(f); }
    if (c.overlapFixed) { const f = document.createElement("span"); f.className = "flag"; f.textContent = "shortened so it doesn't overlap the next"; cw.appendChild(f); }
    const tools = document.createElement("div"); tools.className = "tools";
    const tool = (label, title, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.title = title; b.addEventListener("click", fn); tools.appendChild(b); };
    tool("edit", "Fix the wording", () => {
      const inp = document.createElement("input"); inp.type = "text"; inp.id = "cap-" + c.ci; inp.value = c.words.map(w => w.text).join(" ");
      let done = false;
      const finish = keep => { if (done) return; done = true; if (!keep) { renderCaptions(); return; }
        const val = inp.value.trim(), orig = src.w.filter(i => !P.removed(i)).map(i => R.words[i].text).join(" ");
        mutate(() => { const cc = capsEditable()[c.ci]; if (!val || val === orig) { delete cc.text; delete cc.accText; } else { cc.text = val; cc.accText = []; } }); };
      inp.addEventListener("keydown", e => { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); });
      inp.addEventListener("blur", () => finish(true));
      cw.replaceWith(inp); inp.focus();
    });
    tool("−0.1", "Start 0.1 s earlier", () => mutate(() => { const cc = capsEditable()[c.ci]; cc.nudge = +Math.max(-1, (cc.nudge || 0) - 0.1).toFixed(2); }));
    tool("+0.1", "Start 0.1 s later", () => mutate(() => { const cc = capsEditable()[c.ci]; cc.nudge = +Math.min(1, (cc.nudge || 0) + 0.1).toFixed(2); }));
    const nextLive = live[live.indexOf(c) + 1];
    if (nextLive) tool("merge", "Join with the next caption", () => mutate(() => {
      const arr = capsEditable(), a = arr[c.ci], b = arr[nextLive.ci];
      if (a.text || b.text) { a.text = [a.text || a.w.map(i => R.words[i].text).join(" "), b.text || b.w.map(i => R.words[i].text).join(" ")].join(" "); a.accText = []; }
      a.w = a.w.concat(b.w); a.acc = (a.acc || []).concat(b.acc || []); arr.splice(nextLive.ci, 1);
    }));
    row.append(ts, cw, tools); box.appendChild(row);
  }
  renderCapSpots();
  const acc = live.reduce((n, c) => n + c.words.filter(w => w.accent).length, 0);
  $("#captally").innerHTML = `<span><b>${live.length}</b> captions</span><span><b>${CAPS.length - live.length}</b> cut out with their words</span><span><b>${acc}</b> accent words</span>`;
}

// ---------- 4. sound & color ----------
function renderSound() {
  const A = R.assets || {};
  const fig = (label, el) => { const f = document.createElement("figure"); const c = document.createElement("figcaption"); c.textContent = label; f.append(c, el); return f; };
  const au = u => { const a = document.createElement("audio"); a.controls = true; a.preload = "none"; a.src = u; return a; };
  const im = (u, alt) => { const i = document.createElement("img"); i.src = u; i.alt = alt; return i; };
  $("#audio").replaceChildren(...(A.audioOriginal ? [fig("Original", au(A.audioOriginal)), fig("Cleaned", au(A.audioCleaned))] : [Object.assign(document.createElement("div"), { className: "empty", textContent: "No audio comparison for this reel yet." })]));
  $("#colour").replaceChildren(...(A.colourBefore && R.grade ? [fig("Original", im(A.colourBefore, "Frame before grading")), fig("Graded", im(A.colourAfter, "Same frame after grading"))] : [Object.assign(document.createElement("div"), { className: "empty", textContent: "No color grade is set for this brand, so the reel keeps its original color." })]));
  const cues = $("#cues"); cues.textContent = "";
  // 0.19.0: one switch for all sound effects on this reel. On unless your brand settings say off.
  const sfxOn = S.sfxAll ? S.sfxAll === "on" : R.sfxOn !== false, bar = $("#sfxall"); bar.textContent = "";
  for (const [v, label] of [["on", "Sound effects on"], ["off", "Sound effects off"]]) { const b = document.createElement("button"); b.type = "button"; b.className = "b" + ((v === "on") === sfxOn ? " primary" : " quiet"); b.textContent = label; b.setAttribute("aria-pressed", (v === "on") === sfxOn); b.addEventListener("click", () => mutate(() => { S.sfxAll = v; })); bar.append(b); }
  if (!sfxOn) { cues.append(Object.assign(document.createElement("div"), { className: "empty", textContent: R.sfxOn === false && !S.sfxAll ? "Sound effects are off in your brand settings. Switch them on here for this reel. To switch them on for every reel, use Sound effects on the Touch-ups page." : "Sound effects are off for this reel." })); return; }
  if (!GFX.some(g => g.sfx && !g.gone && g.state !== "d")) {   // 0.16.0: say why the list is empty
    cues.append(Object.assign(document.createElement("div"), { className: "empty", textContent: GFX.length ? "No sounds are set for this reel's graphics. Sounds are switched off in your brand settings, or this review was made before sounds were listed here. Tell Claude: \"turn sound effects on and refresh the review\"." : "Sounds come with graphics, and this reel has no graphics planned yet." }));
  }
  for (const g of GFX.filter(g => g.sfx && !g.gone && g.state !== "d")) {
    const off = !!S.sfxOff[g.id];
    const row = document.createElement("div"); row.className = "cue" + (off ? " off" : "");
    const t = document.createElement("span"); t.className = "tc"; t.textContent = fmt(g.start);
    const w = document.createElement("span"); w.className = "what"; w.textContent = `${g.sfx.name} · ${g.kind}`;
    const ctl = document.createElement("span"); ctl.className = "ctl";
    const play = document.createElement("button"); play.type = "button"; play.className = "b quiet"; play.textContent = "Play";
    // Modified by By Mel Ross (0.10.2): Play did nothing, with no message, when the reel's data had no address for the sound.
    // The local Reel Studio link serves every library sound at /sfx/<name>.wav, and a sound that can't play now says so.
    play.addEventListener("click", () => {
      const u = A.sfx?.[g.sfx.name] || (window.REEL_STUDIO_LINKS ? `/sfx/${encodeURIComponent(g.sfx.name)}.wav` : null);
      const fail = () => { play.textContent = "Can't play"; play.title = "This sound's file wasn't found. Tell Claude: run setup_engine.sh, then refresh the review page."; };
      if (!u) return fail();
      const a = new Audio(u); a.volume = Math.min(1, Math.pow(10, (g.sfx.db + 8) / 20));
      a.addEventListener("error", fail); a.play().then(() => { play.textContent = "Play"; }).catch(fail);
    });
    const tg = document.createElement("button"); tg.type = "button"; tg.className = "b quiet"; tg.textContent = off ? "Switch on" : "Switch off";
    tg.addEventListener("click", () => mutate(() => { if (off) delete S.sfxOff[g.id]; else S.sfxOff[g.id] = true; }));
    ctl.append(play, tg); row.append(t, w, ctl); cues.appendChild(row);
  }
}

// ---------- 5. preview ----------
function renderPreview() {
  const h = ReelCore.hash(decisions()), st = $("#bstate");
  st.className = "state";
  if (B?.url && B.hash === h) { st.textContent = `Preview is up to date (built ${new Date(B.at).toLocaleString()}). Press play on the video.`; st.classList.add("ok"); }
  else if (B?.url) { st.textContent = "Preview is outdated: you've changed decisions since it was built. Build again to see them."; st.classList.add("out"); }
  else if (pageBuild.busy) st.textContent = pageBuild.text;
  else if (pageBuild.error) { st.textContent = pageBuild.error; st.classList.add("out"); }
  else if (S.buildRequest?.hash === h && !LOCAL) st.textContent = "Build requested. Tell Claude \"build preview\" in chat; the page can't start a render on its own.";
  else st.textContent = "No preview built yet. Build one when your decisions look right.";
  $("#build").disabled = pageBuild.busy; $("#build").textContent = pageBuild.busy ? "Building…" : "Build preview";
  const tb = $("#told"); tb.textContent = "";
  if (pageBuild.told.length && !pageBuild.busy) {
    const hd = document.createElement("p"); hd.className = "lede"; hd.innerHTML = "<b>Not in this preview.</b> These need Claude. Tell Claude: \"build preview\".";
    const ul = document.createElement("ul"); ul.className = "toldlist"; const PLAIN = [[/^CHANGE REQUESTED:\s*\S+\s*/, "A graphic you set to Change, "], [/^GRAPHIC WANTED:\s*/, "A graphic you asked for: "], [/^GRAPHICS AMOUNT:\s*/, "How many graphics: "], [/^NOTE\s*/, "Your note "], [/^REVISION\s*/, "Your note on the draft, "],
      [/^PLACE IT[^:]*:\s*\S+\s*/, "A graphic you moved, "], [/^BRAND CHANGE REQUESTED[^:]*:\s*/, "A change to your brand: "], [/^TOUCH-UP NOT KEPT[^:]*:\s*/, "A touch-up that did not carry over: "]];
    for (const t of pageBuild.told) { const li = document.createElement("li"); const m = PLAIN.find(([re]) => re.test(t)); li.textContent = (m ? t.replace(m[0], m[1]) : t).replace(/\. (Add it to edit\.json|So the review page shows it)[\s\S]*$/, ".").replace(/\(set this card's position[^)]*\)/, ""); ul.append(li); }
    tb.append(hd, ul);
  }
  const revs = $("#revs"); revs.textContent = "";
  S.revisions.forEach((r, k) => {
    const row = document.createElement("div"); row.className = "rev";
    const t = document.createElement("button"); t.className = "ts"; t.type = "button"; t.innerHTML = `<span class="tc">${fmt(r.t)}</span>`;
    t.addEventListener("click", () => { if (B?.url) { v.currentTime = r.t; v.play().catch(() => {}); } });
    const x = document.createElement("span"); x.textContent = r.text + (r.rough ? " (written before the build)" : "");
    const del = document.createElement("button"); del.type = "button"; del.className = "b quiet"; del.textContent = "Remove";
    del.addEventListener("click", () => mutate(() => S.revisions.splice(k, 1)));
    row.append(t, x, del); revs.appendChild(row);
  });
  if (!S.revisions.length) revs.innerHTML = `<div class="empty">No notes yet. Write what should change and add the note. With a draft built, pause it at the moment first.</div>`;
}
// Added by By Mel Ross (0.18.0): at the local Reel Studio link the page starts the build itself. It lists first what only Claude
// can do (a graphic to change or add, typed notes), so nobody waits 3 minutes for a preview that is missing what they asked for.
const LOCAL = !!window.REEL_STUDIO_LINKS;
let pageBuild = { busy: false, text: "", error: "", told: [] };
const STEP_TEXT = { queued: "Starting…", cut: "Step 1 of 4: cutting your clip…", render: "Step 2 of 4: building the video. This is the long step, about 3 minutes…", checks: "Step 3 of 4: checking sound, length and captions…", copies: "Step 4 of 4: making the copy for this page…", "phone copy": "Step 4 of 4: making the copy for this page…", qa: "Step 3 of 4: checking sound, length and captions…" };
function needsClaude() {
  const out = [], b = S.board || {};
  const ch = GFX.filter(g => !g.gone && g.state === "c").length; if (ch) out.push(`${ch} graphic${ch > 1 ? "s" : ""} set to Change`);
  const w = (S.wanted || []).filter(x => !x.done).length; if (w) out.push(`${w} graphic${w > 1 ? "s" : ""} you asked for with "Add a graphic"`);
  if (S.amount) out.push("a new answer to \"How many graphics?\"");
  const mv = GFX.filter(g => !g.gone && g.state !== "d" && g.type !== "popup" && (b[g.id] || {}).where).length; if (mv) out.push(`${mv} graphic${mv > 1 ? "s" : ""} moved to a new place`);
  const n = Object.values(S.notes || {}).filter(x => String(x || "").trim()).length; if (n) out.push(`${n} typed note${n > 1 ? "s" : ""}`);
  if ((S.revisions || []).length) out.push(`${S.revisions.length} note${S.revisions.length > 1 ? "s" : ""} on the draft`);
  if (String(S.brandRequest || "").trim()) out.push("a change to your brand");
  return out;
}
async function pollBuild() {
  try {
    const j = await (await fetch("/api/review-build")).json(), st = j.build.state;
    if (st === "importing") pageBuild = { ...pageBuild, busy: true, text: "Reading your choices…" };
    else if (st === "rendering") pageBuild = { ...pageBuild, busy: true, text: STEP_TEXT[j.job.step] || "Building…" };
    else if (st === "failed") pageBuild = { busy: false, text: "", error: "The build stopped: " + (j.build.error || "unknown reason") + " Tell Claude \"the preview build failed\" and it will look.", told: j.build.told || [] };
    else if (st === "done") pageBuild = { busy: false, text: "", error: "", told: (j.build.told || []) };
    else pageBuild = { ...pageBuild, busy: false };
  } catch { /* the server is busy: ask again */ }
  if (R) renderPreview();
  if (pageBuild.busy) setTimeout(pollBuild, 2000);
}
async function buildHere() {
  clearTimeout(timer); if (dirty) saveNow(); await saving;   // the server reads the saved choices, so they go first
  pageBuild = { busy: true, text: "Reading your choices…", error: "", told: [] }; renderPreview();
  try {
    const j = await (await fetch("/api/review-build", { method: "POST" })).json();
    if (!j.ok) throw new Error(j.error || "the build did not start");
  } catch (e) { pageBuild = { busy: false, text: "", error: "The build did not start: " + e.message, told: [] }; renderPreview(); return; }
  setTimeout(pollBuild, 1200);
}
$("#build").addEventListener("click", () => {
  mutate(() => { S.buildRequest = { hash: ReelCore.hash(decisions()), at: new Date().toISOString() }; });
  if (!LOCAL) return;
  const need = needsClaude(), box = $("#needbox"); box.textContent = "";
  if (!need.length) return buildHere();
  const p1 = document.createElement("p"); p1.className = "lede"; p1.innerHTML = "<b>Some of what you asked for needs Claude:</b> " + need.map(x => x.replace(/</g, "&lt;")).join(", ") + ".";
  const p2 = document.createElement("p"); p2.className = "lede"; p2.textContent = "To get all of it, tell Claude \"build preview\" in chat. Or build now and see the rest (cuts, captions, sounds, colors, kept graphics) in about 3 minutes.";
  const go = document.createElement("button"); go.type = "button"; go.className = "b"; go.textContent = "Build now without those";
  const no = document.createElement("button"); no.type = "button"; no.className = "b quiet"; no.textContent = "I'll tell Claude";
  go.addEventListener("click", () => { box.textContent = ""; buildHere(); }); no.addEventListener("click", () => { box.textContent = ""; });
  const row = document.createElement("div"); row.className = "ctl"; row.append(go, no); box.append(p1, p2, row);
});
if (LOCAL) pollBuild();
$("#revadd").addEventListener("click", () => {
  const text = $("#revtext").value.trim(); if (!text) { $("#revtext").focus(); return; }
  // Modified by By Mel Ross (0.10.2): this refused every note until a preview was built, with a message that vanished. A note
  // written before the build is kept too: it carries the rough-cut time and "rough": true, and the import passes it to Claude.
  const built = !!B?.url, t = built ? v.currentTime : pos;
  mutate(() => { S.revisions.push({ t: +(+t || 0).toFixed(2), text, hash: built ? B.hash : null, ...(built ? {} : { rough: true }) }); S.revisions.sort((a, b) => a.t - b.t); }); $("#revtext").value = "";
});
$("#revtext").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("#revadd").click(); } });


function renderAll() {
  renderCuts(); renderGraphics(); renderWanted(); renderCaptions(); renderCapMode(); renderHighlight(); renderSound(); renderPreview();
  const sent = { cuts: S.cut != null, graphics: Object.keys(S.board).length || (S.wanted || []).length || S.amount, captions: S.captions != null || S.highlight != null || S.layout != null || S.capmode != null, sound: Object.keys(S.sfxOff).length };
  $$(".tab").forEach(b => { const d = b.querySelector(".dot"); if (d) d.hidden = !sent[b.dataset.tab]; });
}

// ---------- load ----------
(async () => {
  const db = await window.claude?.use?.("db");
  if (!db) { pill("This view can't load the reel. Open it from your claude.ai link.", true); $("#reelname").textContent = "Not connected."; return; }
  try {
    const rs = await db.doc("reel/current").get();
    if (!rs.exists) { $("#reelname").textContent = "No reel loaded yet. Ask Claude to load one."; pill("Nothing to review", true); return; }
    R = rs.data();
    if (R.fonts) {   // brand fonts, so the caption preview uses the real faces
      const css = [["rb", R.fonts.body], ["ra", R.fonts.accent]].filter(f => f[1]).map(([n, u]) => `@font-face{font-family:${n};src:url(${u});font-display:swap}`).join("");
      document.head.appendChild(Object.assign(document.createElement("style"), { textContent: css }));
    }
    ref = db.doc("review/current");
    const rv = await ref.get(); if (rv.exists) S = { ...blank(), ...JSON.parse(JSON.stringify(rv.data())) };
    // someone else (Claude, another tab) changed the decisions: take theirs instead of saving a stale copy over it
    ref.onSnapshot(s => {
      if (!s.exists || !R) return;
      const d = s.data(); if (d.updatedAt === mine || dirty) return;
      if (JSON.stringify(d) === JSON.stringify({ ...S })) return;
      S = { ...blank(), ...JSON.parse(JSON.stringify(d)) }; undo = []; redo = []; syncUndo();
      recompute(); renderAll(); renderLook(); setPos(pos); pill("Updated by Claude");
    }, () => {});
    let firstReel = true;
    // 0.16.0: when Claude changes the plan (new graphics after an import, a new export), the page loads it by itself. It used to
    // keep showing the old plan until someone reloaded. Unsaved taps are saved first.
    db.doc("reel/current").onSnapshot(() => { if (firstReel) { firstReel = false; return; } pill("Claude updated the plan: loading it…"); setTimeout(() => { if (dirty) pill("Claude updated the plan: reload the page to see it", true); else location.reload(); }, 1500); }, () => {});
    db.doc("builds/latest").onSnapshot(s => { B = s.exists ? s.data() : null; if (R) renderPreview(); if (tab === "preview") showTab("preview"); }, () => {});
    recompute();
    $("#reelname").textContent = `${R.title} · raw ${fmt(R.srcDur)} → reel ${fmt(P.cutDur)}`; setPos(0);
    restoreUndo();   // 0.37.0: Undo and Redo from before a reload
    setSteps("edit", { cover: R.thumbnailUrl, edit: (() => { try { return R.editorUrl ? new URL("/edit", R.editorUrl).href : null; } catch { return null; } })(), ...(window.REEL_STUDIO_LINKS || {}) });
    $("#lookslink").hidden = !window.REEL_STUDIO_LINKS;   // the looks page is served by the local Reel Studio link only
    if (window.REEL_STUDIO_LINKS) fetch("/api/stage").then(r => r.json()).then(st => { $("#builtnote").hidden = !st.built; }).catch(() => {});
    $("#brand").value = S.brandRequest || "";
    renderLook();
    renderAll(); showTab(["cuts", "graphics", "captions", "sound", "preview"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "cuts");   // 0.34.3: the cover is step 2, after the edit
    pill(rv.exists ? "Saved decisions loaded" : "Ready");
  } catch (e) { pill("Couldn't load the reel (" + (e?.code || "error") + "). Reload to try again.", true); }
})();
// ---- Tips (Added by By Mel Ross, 0.15.0): a small ? beside the terms that need explaining. Tap it (or hover on a computer) for one
// plain sentence. The list is matched by the label's own words, so a re-drawn section gets its ? back on its own.
const TIPS = [
 [
  "h1",
  "Review the cut",
  "This page is the plan for your reel. Nothing is built until you press Build preview and tell Claude."
 ],
 [
  "#amountlabel",
  "How many graphics",
  "How often something appears on screen besides you: a title, a list, a picture. A few is about 1 every 10 seconds. Lots is 1 every few seconds."
 ],
 [
  "h2",
  "Voice clean-up",
  "The editor lowers background noise and sets your voice to the volume Instagram expects. Listen to both and check your voice still sounds like you."
 ],
 [
  "h2",
  "Color",
  "A light correction to the picture: a little warmer and brighter. It is the same for the whole reel."
 ],
 [
  "h2",
  "Sound effects",
  "Short sounds such as a pop or a whoosh that play when a graphic appears."
 ],
 [
  "h2",
  "Notes on the draft",
  "After a preview is built, pause where something looks wrong and write what to change. Claude reads these notes and fixes them in the next build."
 ],
 [
  "label",
  "Colors for this reel",
  "Your 3 brand colors. Main is for text and dark shapes, Pop is for highlights, Light is for card backgrounds. A change here applies to this reel only."
 ],
 [
  "label",
  "Look for this reel",
  "One choice that changes the fonts, captions, titles and card shapes together. Your colors stay."
 ],
 [
  "label",
  "When should it appear",
  "Pick the line you are saying when the graphic should come on screen."
 ],
 [
  "label",
  "What kind",
  "The type of graphic: a title, a list, a picture, a number and so on. Pick the closest one and describe the rest."
 ],
 [
  ".approx",
  "Approx",
  "A rough sketch of where the graphic sits. The finished graphic uses your fonts and colors and moves."
 ]
];
function addTips() {
  for (const [sel, starts, tip] of TIPS) for (const el of document.querySelectorAll(sel)) {
    if (el.querySelector(":scope > .tipb")) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").trim();
    if (!own.startsWith(starts)) continue;
    const b = document.createElement("button"); b.type = "button"; b.className = "tipb"; b.dataset.tip = tip; b.setAttribute("aria-label", "What is this? " + tip);
    el.appendChild(b);
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
