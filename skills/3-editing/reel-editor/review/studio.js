// Added by By Mel Ross (0.39.0). The new Edit page (studio.html), step 1 of 5: the preview, the 4 tabs, and the Trim tab.
// It reads and writes the same decisions as the review page (review/current through the page's db), and uses the same
// core.js to turn them into a cut, so a cut made here is the cut that renders. Audio arrives in the next step.
(() => {
  const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
  const fmt = (t) => { t = Math.max(0, +t || 0); return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`; };
  const blank = () => ({ theme: null, colors: null, highlight: null, capmode: null, layout: null, sfxAll: null, cut: null, restoredFillers: [], restoredPauses: [], trimmedPauses: [], captions: null, board: {}, wanted: [], amount: null, sfxOff: {}, notes: {}, brandRequest: "", revisions: [], buildRequest: null });
  const v = $("#v"), ov = $("#ov");
  let R = null, B = null, S = blank(), P = null, CAPS = [], GFX = [], ref = null;
  let tab = "trim", mode = "idle", loop = null, pos = 0, timer = null, dirty = false, mine = null, saving = Promise.resolve();

  function pill(msg, bad) { const p = $("#pill"); p.textContent = msg; p.className = bad ? "bad" : ""; p.style.display = "block"; clearTimeout(pill.h); pill.h = setTimeout(() => (p.style.display = "none"), bad ? 7000 : 2400); }

  // ---------- saving, Undo and Redo (60 steps each way, kept across a reload, shared with the review page) ----------
  function queueSave() { clearTimeout(timer); dirty = true; timer = setTimeout(saveNow, 600); }
  function saveNow() {
    if (!ref) return; dirty = false;
    const body = JSON.parse(JSON.stringify({ ...S, updatedAt: new Date().toISOString() })); mine = body.updatedAt;
    saving = saving.then(() => ref.set(body)).then(() => { $("#savedat").textContent = "Saved " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); quickSoon(); },
      (e) => pill("Couldn't save (" + (e?.code || "error") + "). Check the Unmess Reels link is still running.", true));
  }
  let undo = [], redo = [];
  const STEPS = 60, strip = (x) => { const { updatedAt, ...rest } = x || {}; return JSON.stringify(rest); };
  const undoKey = () => (R ? `reelstudio-undo:${R.title || ""}:${(R.words || []).length}` : null);
  function syncUndo() {
    $("#undo").disabled = !undo.length; $("#redo").disabled = !redo.length;
    const k = undoKey(); if (!k) return;
    let u = undo.slice(-STEPS), d = redo.slice(-STEPS);
    for (;;) {
      try { localStorage.setItem(k, JSON.stringify({ cur: strip(S), undo: u, redo: d })); return; }
      catch { if (!u.length && !d.length) { try { localStorage.removeItem(k); } catch { /* storage off */ } return; } u = u.slice(Math.ceil(u.length / 2)); d = d.slice(Math.ceil(d.length / 2)); }
    }
  }
  function restoreUndo() { const k = undoKey(); if (!k) return; try { const h = JSON.parse(localStorage.getItem(k) || "null"); if (h && h.cur === strip(S)) { undo = h.undo || []; redo = h.redo || []; } } catch { /* none kept */ } syncUndo(); }
  function pushUndo() { undo.push(JSON.stringify(S)); if (undo.length > STEPS) undo.shift(); redo = []; }
  function mutate(fn) { pushUndo(); fn(); recompute(); renderAll(); setPos(pos); queueSave(); syncUndo(); }
  function step(from, to) { if (!from.length) return; to.push(JSON.stringify(S)); if (to.length > STEPS) to.shift(); S = JSON.parse(from.pop()); recompute(); renderAll(); setPos(pos); queueSave(); syncUndo(); }
  $("#undo").addEventListener("click", () => step(undo, redo));
  $("#redo").addEventListener("click", () => step(redo, undo));
  document.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey) || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) { e.preventDefault(); step(undo, redo); } else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); step(redo, undo); }
  });

  // ---------- the cut, worked out from the decisions ----------
  const decisions = () => ({ ...S, cut: S.cut || R.proposedCut, captions: S.captions || R.captions });
  function recompute() { const d = decisions(); P = ReelCore.plan(R, d); CAPS = ReelCore.captions(R, d, P); GFX = ReelCore.graphics(R, d, P); }
  const capsEditable = () => { if (!S.captions) S.captions = JSON.parse(JSON.stringify(R.captions)); return S.captions; };
  const fresh = () => !!(B && B.url && B.hash === ReelCore.hash(decisions()));

  // ---------- tabs ----------
  function showTab(t) {
    tab = t;
    $$(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
    $$("section[data-p]").forEach((s) => (s.hidden = s.dataset.p !== t));
    history.replaceState(null, "", "#" + t);
    if (t === "style" && P) renderLine();   // the line needs its real width, which a hidden tab doesn't have
    syncSource(); renderBuild();
  }
  $$(".tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  document.addEventListener("click", (e) => { const n = e.target.closest("[data-next]"); if (n) { showTab(n.dataset.next); window.scrollTo({ top: 0, behavior: "smooth" }); } });

  // ---------- the preview: the best picture there is for your choices as they stand ----------
  // built: the finished reel, when the last build matches your choices. live: the cut video with the reel's own page laid over
  // it (real fonts, colors, graphics and motion), made in seconds by the quick preview. rough: the raw clip with the cuts
  // skipped and graphics as outlines, always there and always instant. pos is the time in the cut reel in all 3.
  const live = $("#live");
  let kind = "rough", Q = { state: "idle" }, lineHold = false, seekOnLoad = null, quickT = null, quickPollT = null, oldEngine = false, clockSkew = 0;
  const hashNow = () => ReelCore.hash(decisions());
  const quickBusy = () => ["reading", "cutting", "drawing"].includes(Q.state);
  const quickOk = () => Q.state === "ready" && !!Q.hash && Q.hash === hashNow();
  const wantKind = () => (lineHold ? "rough" : fresh() ? "built" : quickOk() ? "live" : "rough");
  const srcTime = () => (kind === "rough" ? P.toSrc(pos) : pos);
  function syncSource() {
    if (!R || !P) return;
    const k = wantKind(), url = k === "built" ? B.url : k === "live" ? "/files/master.mp4?v=" + encodeURIComponent(Q.at || "") : R.srcUrl;
    if (v.getAttribute("src") !== url) { stop(); kind = k; seekOnLoad = srcTime(); v.setAttribute("src", url); v.load(); }
    else if (kind !== k) { kind = k; }
    if (k === "live") { const want = "/live/index.html?at=" + encodeURIComponent(Q.at || ""); if (live.getAttribute("src") !== want) live.setAttribute("src", want); }
    live.style.display = k === "live" ? "" : "none";
    setPos(pos); if (k === "rough") overlay(pos); else { ov.textContent = ""; marks(pos); }
    const note = $("#pnote"), btn = $("#quickbtn"); note.className = "";
    btn.hidden = !(k === "rough" && !quickBusy() && !build.busy && !lineHold && !oldEngine);
    btn.textContent = Q.state === "needs-cut" || B || Q.hash ? "Show my cuts with real graphics" : "Show real graphics";
    // 0.40.3: every state says what is happening and what to do. A build that is running, an editor that needs a restart and
    // a long cut all used to look like "it doesn't work".
    const took = Q.started ? " " + fmt(Math.max(0, (Date.now() + clockSkew - Date.parse(Q.started)) / 1000)) + " so far." : "";
    if (oldEngine) { note.textContent = "The editor needs a restart before it can show real graphics. In your Claude chat, say: restart the editor. Then reload this page."; note.className = "bad"; }
    else if (build.busy) note.textContent = "Building your reel. " + (build.text || "") + " The finished reel shows here when it's done.";
    else if (Q.state === "cutting") note.textContent = "Cutting the video for the preview." + took + " A short clip takes about a minute, a long one a few.";
    else if (Q.state === "drawing") note.textContent = "Drawing your graphics…";
    else if (Q.state === "reading") note.textContent = "Updating the preview…";
    else if (k === "built") note.textContent = "Your built reel. It matches your choices.";
    else if (k === "live") note.textContent = "Live preview: your real fonts, colors and graphics. Sound effects and music come with Build.";
    else if (Q.state === "failed") { note.textContent = "The live preview didn't update: " + (Q.error || "unknown reason") + " The rough preview still works. To get it fixed, tell Claude: the live preview failed."; note.className = "bad"; }
    else note.textContent = "Rough preview: your cuts and captions, with graphics as outlines.";
  }
  const clock = (a, b) => { $("#clock").textContent = `${fmt(a)} / ${fmt(b)}`; };
  function stop() { cancelAnimationFrame(loop); v.pause(); v.playbackRate = 1; mode = "paused"; $("#playbtn").textContent = "▶"; $("#playbtn").setAttribute("aria-label", "Play"); }
  function setPos(c) { if (!P) return; pos = Math.max(0, Math.min(c, P.cutDur - 0.05)); $("#scrub").max = P.cutDur.toFixed(1); $("#scrub").value = pos.toFixed(1); clock(pos, P.cutDur); const ph = $("#tlhead"); if (ph) ph.style.left = (pos / Math.max(1, P.cutDur)) * 100 + "%"; }
  function seekCut(c) { if (mode !== "paused") stop(); setPos(c); try { v.currentTime = srcTime(); } catch { seekOnLoad = srcTime(); } if (kind === "rough") overlay(pos); else marks(pos); }
  function playing() { $("#playbtn").textContent = "❚❚"; $("#playbtn").setAttribute("aria-label", "Pause"); }
  function playFrom(from = pos) {
    if (from >= P.cutDur - 0.1) from = 0;
    if (kind === "rough") return playRough(from);
    stop(); mode = "final"; setPos(from); v.currentTime = pos; playing();
    v.play().catch(() => { stop(); pill("Playback was blocked. Tap play again.", true); });
    const tick = () => { if (mode !== "final") return; if (v.ended) { stop(); return; } setPos(v.currentTime); marks(pos); loop = requestAnimationFrame(tick); };
    loop = requestAnimationFrame(tick);
  }
  function playRough(from = pos) {
    stop(); mode = "rough"; v.playbackRate = P.speed; setPos(from); v.currentTime = P.toSrc(pos); playing();
    v.play().catch(() => { stop(); pill("Playback was blocked. Tap play again.", true); });
    const tick = () => {
      if (mode !== "rough") return;
      const t = v.currentTime, sp = P.spans, k = sp.findIndex(([, b]) => t < b);
      if (k === -1) { stop(); setPos(P.cutDur); return; }
      if (t < sp[k][0] - 0.02) v.currentTime = sp[k][0];   // inside a cut: jump to the next kept stretch
      const c = P.toCut(Math.max(t, sp[k][0])); setPos(c); overlay(c); loop = requestAnimationFrame(tick);
    };
    loop = requestAnimationFrame(tick);
  }
  function playLine(s, e) {   // one line from the raw clip, cuts and all, so you can hear what a cut word sounds like
    const go = () => {
      stop(); mode = "line"; v.currentTime = s; playing(); ov.textContent = "";
      v.play().catch(() => { endLine(); pill("Playback was blocked. Tap the time again.", true); });
      const tick = () => { if (mode !== "line") return; if (v.currentTime >= e) { endLine(); return; } nowWord(v.currentTime); loop = requestAnimationFrame(tick); };
      loop = requestAnimationFrame(tick);
    };
    const endLine = () => { stop(); lineHold = false; syncSource(); };
    if (kind === "rough") return go();
    lineHold = true; syncSource(); seekOnLoad = null; v.addEventListener("loadedmetadata", go, { once: true });   // the raw clip has to load first
  }
  $("#playbtn").addEventListener("click", () => {
    if (!R) return;
    if (mode === "line") { stop(); lineHold = false; syncSource(); return; }
    if (mode === "rough" || mode === "final") { stop(); if (kind === "rough") overlay(pos); } else playFrom(pos);
  });
  $("#scrub").addEventListener("input", (e) => { if (R) seekCut(+e.target.value); });
  v.addEventListener("loadedmetadata", () => { if (seekOnLoad != null) { try { v.currentTime = seekOnLoad; } catch { /* the first frame shows */ } seekOnLoad = null; } });
  v.addEventListener("error", () => pill("The video didn't load. Reload the page.", true));
  (function liveLoop() {   // the reel's page has no clock of its own: it follows the player
    if (kind === "live" && live.style.display !== "none") {
      live.style.transform = `scale(${$("#player").clientWidth / 1080})`;
      try { const w = live.contentWindow; if (w && w.reelLive && w.reelLive.ready()) w.reelLive.sync(v.currentTime || 0, !v.paused && !v.seeking && !v.ended); } catch { /* the frame is loading */ }
    }
    requestAnimationFrame(liveLoop);
  })();
  // the quick preview: after a save it redraws by itself when the cuts are the same (seconds); a new cut waits for the button
  // the editor's answer: its state, whether a build is running, and its clock. An editor started before this page existed
  // answers 404 or a web page, which means it needs a restart.
  async function quickAsk(body) {
    const r = await fetch("/api/quick-preview", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
    if (r.status === 404 || !/json/.test(r.headers.get("content-type") || "")) { oldEngine = true; return; }
    const j = await r.json(); oldEngine = false;
    if (!j.ok) throw new Error(j.error || "failed");
    if (j.now) clockSkew = Date.parse(j.now) - Date.now();
    Q = j.quick || Q;
    if (j.building && !build.busy) pollBuild();   // a build started somewhere else: show it, then the built reel
  }
  async function quickPoll() {
    try { await quickAsk(); } catch { /* try again */ }
    syncSource(); clearTimeout(quickPollT); if (quickBusy()) quickPollT = setTimeout(quickPoll, 700);
  }
  async function quickStart(cut) {
    if (build.busy) return;
    try { await quickAsk({ cut: !!cut }); }
    catch (e) { Q = { ...Q, state: "failed", error: /Failed to fetch|NetworkError/.test(String(e.message)) ? "this page can't reach the editor. Check the link is still running." : e.message }; }
    syncSource(); clearTimeout(quickPollT); if (quickBusy()) quickPollT = setTimeout(quickPoll, 700);
  }
  function quickSoon() { if (!(B || Q.hash) || fresh() || quickOk()) return; clearTimeout(quickT); quickT = setTimeout(() => { if (!dirty && !fresh() && !quickOk()) quickStart(false); }, 900); }
  $("#quickbtn").addEventListener("click", async () => { clearTimeout(timer); if (dirty) saveNow(); await saving; quickStart(true); });

  // what's drawn on the rough preview at a cut time: outlines for graphics, and the caption in your caption style
  const hlNow = () => ({ words: R.style.cap, text: R.style.acc, bg: R.style.accBg || "none", box: R.style.capBox || "none", size: R.style.capSize, ...(S.highlight || {}) });
  const capMode = () => S.capmode || (R.style && R.style.mode) || "phrase";
  function capTop(cap) {
    const z = (R.style && R.style.zones) || { top: 290, middle: 900, bottom: R.style.capY || 1250 };
    if (cap && z[cap.pos] != null) return z[cap.pos];
    return (S.layout || R.style.layout || "captions-low") === "captions-high" ? z.top : z.bottom;
  }
  function shown(cap, t) {   // the caption as the chosen highlight mode shows it at time t
    const m = capMode(), ws = cap.words, at = (l) => { let k = 0; for (let j = 0; j < l.length; j++) if (l[j].t <= t + 0.001) k = j; return k; };
    if (m === "word") return { ...cap, words: [ws[at(ws)]] };
    if (m === "spoken") { const k = at(ws); return { ...cap, words: ws.map((w, j) => ({ ...w, accent: j === k })) }; }
    return cap;
  }
  function capEl(cap, plain) {
    const st = R.style, W = $("#player").clientWidth, one = cap.words.length === 1, hl = hlNow();
    const el = document.createElement("div"); el.className = "capov" + (st.editorial && !one ? " ed" : "");
    Object.assign(el.style, { top: capTop(cap) / 19.2 + "%", fontFamily: "rb, inherit", fontWeight: "600", fontSize: ((hl.size || st.capSize) / 1080) * W * (one ? 1.35 : 1) + "px", color: hl.words || st.cap });
    for (const w of cap.words) {
      const s = document.createElement("span");
      if (w.accent) {
        s.className = "a"; s.style.color = hl.text;
        if (!plain) Object.assign(s.style, { fontFamily: "ra, Georgia, serif", fontStyle: "italic", fontSize: (st.editorial ? 1.7 : 1.12) + "em" });
        if (hl.bg !== "none") Object.assign(s.style, { background: hl.bg, padding: ".02em .18em .08em", borderRadius: ".16em", textShadow: "none" });
      }
      const t = w.text.replace(/[.,!?;:]+$/, ""); s.textContent = (st.case === "lower" ? t.toLowerCase() : t) + " "; el.appendChild(s);
    }
    if (hl.box && hl.box !== "none") { const wrap = document.createElement("span"); Object.assign(wrap.style, { background: hl.box, padding: ".05em .25em", borderRadius: ".2em", lineHeight: "1.5", textShadow: "none" }); wrap.append(...el.childNodes); el.appendChild(wrap); }
    return el;
  }
  function marks(c) { const cap = CAPS.find((x) => !x.gone && c >= x.start && c < x.end); nowWord(P.toSrc(c)); $$(".caprow").forEach((r) => r.classList.toggle("now", !!cap && +r.dataset.ci === cap.ci)); return cap; }
  function overlay(c) {
    ov.textContent = "";
    if (!R || kind !== "rough" || mode === "line" || c == null) return;
    for (const g of GFX) if (!g.gone && g.state !== "d" && c >= g.start && c < g.end) {
      const [x, y, w, h] = g.place || [90, 200, 900, 500], b = document.createElement("div"); b.className = "gbox"; b.textContent = g.kind;
      Object.assign(b.style, { left: x / 10.8 + "%", top: y / 19.2 + "%", width: w / 10.8 + "%", height: h / 19.2 + "%" });
      if (g.imgUrl) b.style.backgroundImage = `url(${JSON.stringify(g.imgUrl)})`;
      ov.appendChild(b);
    }
    const cap = marks(c);
    if (cap && cap.pos !== "hide") { const el = capEl(shown(cap, c), capMode() === "spoken"); ov.appendChild(el); let fs = parseFloat(el.style.fontSize); for (let i = 0; i < 25 && el.scrollWidth > el.clientWidth + 1; i++) { fs *= 0.92; el.style.fontSize = fs + "px"; } }
  }
  function nowWord(src) { $$("#tx .w.now").forEach((e) => e.classList.remove("now")); const i = R.words.findIndex((w) => src >= w.s && src < w.e); if (i >= 0) $(`#tx .w[data-i="${i}"]`)?.classList.add("now"); }

  // ---------- Trim: what you say ----------
  const FSNAME = { doubled: "doubled word", restart: "false start", "cut-off": "broken-off word", retake: "said twice" };
  function renderWords() {
    const tx = $("#tx"); tx.textContent = "";
    const cut = new Set(S.cut || R.proposedCut), fb = new Set(S.restoredFillers), pz = new Map(P.pauses.map((p) => [p.after, p]));
    const FS = new Map(); for (const f of R.falseStarts || []) f.w.forEach((i, k) => FS.set(i, { f, last: k === f.w.length - 1 }));
    const sents = []; let cur = [];
    R.words.forEach((w, i) => { cur.push(i); if (/[.?!]$/.test(w.text) || i === R.words.length - 1) { sents.push(cur); cur = []; } });
    for (const idx of sents) {
      const row = document.createElement("div"); row.className = "sent";
      const ts = document.createElement("button"); ts.className = "ts"; ts.type = "button"; ts.textContent = fmt(R.words[idx[0]].s); ts.title = "Hear this line from your raw clip";
      ts.addEventListener("click", () => playLine(R.words[idx[0]].s, R.words[idx[idx.length - 1]].e + 0.2));
      const ws = document.createElement("div"); ws.className = "words";
      for (const i of idx) {
        const w = R.words[i], s = document.createElement("span");
        s.className = "w" + (w.filler ? " filler" + (fb.has(i) ? " back" : "") : cut.has(i) ? " cut" : "");
        s.tabIndex = 0; s.setAttribute("role", "button"); s.dataset.i = i; s.textContent = w.text;
        s.title = w.filler ? (fb.has(i) ? "Kept. Tap to remove it again" : (w.stumble ? "Repeated word" : "Filler") + " removed for you. Tap to keep it") : cut.has(i) ? "Cut. Tap to bring it back" : "Tap to cut";
        const fs = FS.get(i);
        if (fs) { s.classList.add("fs"); s.title = `${FSNAME[fs.f.kind] || "false start"}: ${fs.f.why}. ${cut.has(i) ? "Tap to keep it" : "Kept. Tap to cut it"}`; }
        ws.appendChild(s);
        if (fs && fs.last) { const l = document.createElement("span"); l.className = "fsl"; l.textContent = FSNAME[fs.f.kind] || "false start"; ws.appendChild(l); }
        const p = pz.get(i);
        if (p) {
          const b = document.createElement("button"); b.type = "button"; b.className = "pz" + (p.kept ? " kept" : "");
          b.textContent = `pause ${p.len.toFixed(1)} s ${p.kept ? "kept" : "trimmed"}`; b.title = p.kept ? "Pause kept. Tap to trim it" : "Pause trimmed to about 0.1 s. Tap to keep it";
          b.addEventListener("click", () => mutate(() => {
            const keepDefault = (R.keepPauses || []).includes(i);
            S.restoredPauses = S.restoredPauses.filter((x) => x !== i); S.trimmedPauses = S.trimmedPauses.filter((x) => x !== i);
            if (p.kept) { if (keepDefault) S.trimmedPauses.push(i); } else if (!keepDefault) S.restoredPauses.push(i);
          }));
          ws.appendChild(b);
        }
      }
      row.append(ts, ws); tx.appendChild(row);
    }
    $("#reelname").textContent = `${R.title} · ${fmt(R.srcDur)} raw, ${fmt(P.cutDur)} as a reel`;
  }
  (function wireWords() {
    const tx = $("#tx"); let drag = null;
    const toggle = (i, val) => { const set = new Set(S.cut || R.proposedCut); val ? set.add(i) : set.delete(i); S.cut = [...set].sort((a, b) => a - b); };
    const filler = (i) => { const fb = new Set(S.restoredFillers); fb.has(i) ? fb.delete(i) : fb.add(i); S.restoredFillers = [...fb]; };
    tx.addEventListener("pointerdown", (e) => {
      const w = e.target.closest(".w"); if (!w) return; e.preventDefault(); const i = +w.dataset.i;
      if (R.words[i].filler) { mutate(() => filler(i)); return; }
      pushUndo(); drag = { start: i, val: !(S.cut || R.proposedCut).includes(i), base: JSON.stringify(S.cut || R.proposedCut) };
      toggle(i, drag.val); recompute(); renderWords();
    });
    tx.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const w = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".w"); if (!w) return;
      S.cut = JSON.parse(drag.base); const j = +w.dataset.i, [lo, hi] = drag.start < j ? [drag.start, j] : [j, drag.start];
      for (let i = lo; i <= hi; i++) if (!R.words[i].filler) toggle(i, drag.val);
      recompute(); renderWords();
    });
    window.addEventListener("pointerup", () => { if (!drag) return; drag = null; renderAll(); setPos(pos); queueSave(); syncUndo(); });
    tx.addEventListener("keydown", (e) => {
      const w = e.target.closest(".w"); if (!w || (e.key !== "Enter" && e.key !== " ")) return; e.preventDefault(); const i = +w.dataset.i;
      mutate(() => { if (R.words[i].filler) filler(i); else toggle(i, !(S.cut || R.proposedCut).includes(i)); });
    });
  })();

  // ---------- Trim: captions ----------
  function renderCaps() {
    const box = $("#caps"); box.textContent = "";
    const live = CAPS.filter((c) => !c.gone);
    for (const c of CAPS) {
      const src = (S.captions || R.captions)[c.ci];
      const row = document.createElement("div"); row.className = "caprow" + (c.gone ? " gone" : ""); row.dataset.ci = c.ci;
      const ts = document.createElement("button"); ts.className = "ts"; ts.type = "button";
      const cw = document.createElement("div"); cw.className = "cw";
      if (c.gone) { ts.textContent = "cut"; ts.disabled = true; cw.textContent = src.text || src.w.map((i) => R.words[i].text).join(" "); row.append(ts, cw, document.createElement("span")); box.appendChild(row); continue; }
      ts.textContent = fmt(c.start); ts.title = "Play from this caption"; ts.addEventListener("click", () => playFrom(c.start));
      c.words.forEach((w, k) => {
        const b = document.createElement("button"); b.type = "button"; b.className = "x" + (w.accent ? " acc" : ""); b.textContent = w.text; b.setAttribute("aria-pressed", String(!!w.accent));
        b.title = w.accent ? "Highlighted. Tap for plain" : "Tap to highlight this word";
        b.addEventListener("click", () => mutate(() => {
          const cc = capsEditable()[c.ci];
          if (cc.text) { const a = new Set(cc.accText || []); a.has(k) ? a.delete(k) : a.add(k); cc.accText = [...a]; }
          else { const a = new Set(cc.acc || []); a.has(w.i) ? a.delete(w.i) : a.add(w.i); cc.acc = [...a]; }
        }));
        cw.appendChild(b);
      });
      if (c.overlapFixed) { const f = document.createElement("span"); f.className = "flag"; f.textContent = "shortened so it doesn't overlap the next"; cw.appendChild(f); }
      const tools = document.createElement("div"); tools.className = "tools";
      const tool = (label, title, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.title = title; b.dataset.tool = label; b.addEventListener("click", fn); tools.appendChild(b); };
      tool("edit", "Fix the wording", () => {
        const inp = document.createElement("input"); inp.type = "text"; inp.value = c.words.map((w) => w.text).join(" "); inp.setAttribute("aria-label", "Caption wording");
        let done = false;
        const finish = (keep) => { if (done) return; done = true; if (!keep) { renderCaps(); return; }
          const val = inp.value.trim(), orig = src.w.filter((i) => !P.removed(i)).map((i) => R.words[i].text).join(" ");
          mutate(() => { const cc = capsEditable()[c.ci]; if (!val || val === orig) { delete cc.text; delete cc.accText; } else { cc.text = val; cc.accText = []; } }); };
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); });
        inp.addEventListener("blur", () => finish(true));
        cw.replaceWith(inp); tools.remove(); inp.focus();
      });
      tool("−0.1", "Start 0.1 s earlier", () => mutate(() => { const cc = capsEditable()[c.ci]; cc.nudge = +Math.max(-1, (cc.nudge || 0) - 0.1).toFixed(2); }));
      tool("+0.1", "Start 0.1 s later", () => mutate(() => { const cc = capsEditable()[c.ci]; cc.nudge = +Math.min(1, (cc.nudge || 0) + 0.1).toFixed(2); }));
      const next = live[live.indexOf(c) + 1];
      if (next) tool("merge", "Join with the next caption", () => mutate(() => {
        const arr = capsEditable(), a = arr[c.ci], b = arr[next.ci], words = (x) => x.text || x.w.map((i) => R.words[i].text).join(" ");
        if (a.text || b.text) { a.text = [words(a), words(b)].join(" "); a.accText = []; }
        a.w = a.w.concat(b.w); a.acc = (a.acc || []).concat(b.acc || []); arr.splice(next.ci, 1);
      }));
      row.append(ts, cw, tools); box.appendChild(row);
    }
  }

  // ---------- Style: look, captions, and the graphics laid out on the reel's own line (Added by By Mel Ross, 0.41.0) ----------
  // Every control writes the same choices the current Edit page writes (theme, colors, capmode, layout, highlight, board,
  // wanted, amount), so the import and the build need nothing new. The live preview redraws after each one.
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
  const HEX = /^#[0-9a-f]{6}$/i;
  function renderLooks() {
    const box = $("#looks"), cur = S.theme ?? R.theme ?? ""; box.textContent = "";
    for (const t of [{ id: "", name: "My brand", summary: "Your brand's own fonts and shapes, with no look laid over them." }, ...(Array.isArray(R.themes) ? R.themes : [])]) {
      const b = el("button", { type: "button", className: "lookcard" }, el("b", { textContent: t.name }), el("span", { textContent: t.summary || "" }));
      b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(t.id === cur)); b.dataset.look = t.id;
      b.addEventListener("click", () => mutate(() => { S.theme = t.id === (R.theme ?? "") ? null : t.id; }));
      box.append(b);
    }
    const base = R.colors || {}, now = { ...base, ...(S.colors || {}) }, sw = $("#swatches"); sw.textContent = "";
    for (const [k, name, what] of [["main", "Main", "text and dark shapes"], ["pop", "Pop", "highlights and accents"], ["light", "Light", "card backgrounds"]]) {
      if (!HEX.test(now[k] || "")) continue;
      const inp = el("input", { type: "color", value: now[k] }); inp.setAttribute("aria-label", name + " color"); inp.dataset.color = k;
      inp.addEventListener("change", () => mutate(() => { S.colors = { ...base, ...(S.colors || {}), [k]: inp.value.toUpperCase() }; }));
      sw.append(el("label", {}, inp, el("span", { innerHTML: `<b>${name}</b>: ${what}` })));
    }
    if (S.colors) { const r = el("button", { type: "button", className: "b sm", textContent: "Back to my brand colors" }); r.addEventListener("click", () => mutate(() => { S.colors = null; })); sw.append(r); }
    $("#colornote").textContent = S.colors ? "This reel has its own colors. Every look uses these 3." : "These are your brand colors. Every look uses these 3. Changing one here changes it for this reel only.";
  }
  const CAPMODES = [["phrase", "Only words I mark", "The words you tap on the Trim tab get the highlight color."], ["spoken", "Each word as I say it", "Every word lights up while you say it."], ["word", "One word at a time", "Captions show 1 word at a time, big."]];
  const layoutNow = () => S.layout || (R.style && R.style.layout) || "captions-low";
  function renderCapStyle() {
    const modes = $("#capmodes"), cur = capMode(); modes.textContent = "";
    for (const [id, name] of CAPMODES) {
      const b = el("button", { type: "button", textContent: name }); b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(id === cur)); b.dataset.capmode = id;
      b.addEventListener("click", () => mutate(() => { S.capmode = id === ((R.style && R.style.mode) || "phrase") ? null : id; })); modes.append(b);
    }
    $("#capmodenote").textContent = (CAPMODES.find((m) => m[0] === cur) || CAPMODES[0])[2];
    const lay = $("#caplay"); lay.textContent = "";
    for (const [id, name] of [["captions-low", "Low, under my face"], ["captions-high", "High, above my head"]]) {
      const b = el("button", { type: "button", textContent: name }); b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(id === layoutNow())); b.dataset.lay = id;
      b.addEventListener("click", () => mutate(() => { S.layout = id === ((R.style && R.style.layout) || "captions-low") ? null : id; })); lay.append(b);
    }
    const hl = hlNow(), row = $("#capstyle"), set = (patch) => mutate(() => { S.highlight = { ...hlNow(), ...patch }; }); row.textContent = "";
    const main = () => ((S.colors || {}).main || (R.colors || {}).main || "#141414").toUpperCase();
    const pick = (name, key, val, off) => { const inp = el("input", { type: "color", value: HEX.test(val || "") ? val : "#FFFFFF", disabled: !!off }); inp.setAttribute("aria-label", name); inp.dataset.hl = key;
      inp.addEventListener("change", () => set({ [key]: inp.value.toUpperCase() })); row.append(el("label", {}, inp, el("b", { textContent: name }))); };
    const size = el("input", { type: "range", min: 60, max: 160, step: 2, value: hl.size || 96, id: "csize" }); size.setAttribute("aria-label", "Caption size");
    const sizeLab = el("b", { textContent: "Size " + size.value });
    size.addEventListener("input", () => { sizeLab.textContent = "Size " + size.value; }); size.addEventListener("change", () => set({ size: +size.value }));
    row.append(el("label", {}, sizeLab, size));
    if (HEX.test(hl.words || "")) pick("Words", "words", hl.words);
    if (HEX.test(hl.text || "")) pick("Highlighted word", "text", hl.text);
    const boxOn = hl.bg && hl.bg !== "none", allOn = hl.box && hl.box !== "none";
    const c1 = el("input", { type: "checkbox", checked: !!boxOn, id: "hlon" }); c1.addEventListener("change", () => set(c1.checked ? { bg: (hl.text || "#FFFFFF").toUpperCase(), text: main() } : { bg: "none" }));
    row.append(el("label", {}, c1, el("b", { textContent: "Box behind the highlighted word" })));
    if (boxOn) pick("Its color", "bg", hl.bg);
    const c2 = el("input", { type: "checkbox", checked: !!allOn, id: "cbon" }); c2.addEventListener("change", () => set(c2.checked ? { box: "#FFFFFF", ...(/^#fff/i.test(hl.words || "") ? { words: main() } : {}) } : { box: "none" }));
    row.append(el("label", {}, c2, el("b", { textContent: "Box behind all the words" })));
    if (allOn) pick("Its color", "box", hl.box);
    if (S.highlight) { const r = el("button", { type: "button", className: "b sm", textContent: "Back to my usual captions" }); r.addEventListener("click", () => mutate(() => { S.highlight = null; })); row.append(r); }
    $("#capnote").textContent = "For this reel. The preview shows each change on a caption.";
  }
  // --- graphics on the line ---
  const KEEP = { k: "Keep", c: "Change", d: "Remove" };
  const KINDS = [["choose", "You choose what fits", ""], ["title", "Big headline", ""], ["list", "List that builds row by row", ""], ["checks", "Check or X list", ""], ["label", "Small label", ""], ["note", "Handwritten note on taped paper", ""], ["number", "Number or stat card", ""],
    ["photo", "My photo or screenshot", "Add the picture after, with the button on its card."], ["clip", "My video clip or screen recording", "Add the clip after, with the button on its card. It plays without sound."], ["gif", "GIF", "Say what the GIF should be."],
    ["carousel", "Animation: picture carousel", "Needs 3 or more pictures from you."], ["chart", "Animation: chart that draws itself", "Say the numbers."], ["counter", "Animation: number that counts up", "Say the number."], ["follow", "Animation: words written across the screen", ""], ["social", "Animation: comment, message or notification", "Say what it should read."], ["orbit", "Photos circling my head", "Needs 1 to 6 pictures from you. Mac only."]];
  const WORD_FIELDS = { title: [["text", "Words"]], tag: [["text", "Words"]], cta: [["text", "Words"]], note: [["text", "Words"]], quote: [["text", "Words"]], arctitle: [["text", "Arched words"], ["sub", "Line under it"]], card: [["title", "List title"], ["rows", "Rows, one per line"]], chips: [["title", "Title"]],
    stat: [["value", "The number"], ["label", "Words above it"], ["delta", "The change"]], xlist: [["items", "Lines, one per line"]], shot: [["label", "Label"]] };
  const WHERE = [["", "As planned"], ["center", "Middle (covers part of my face)"], ["top-center", "Top, above my head"], ["top-left", "Top left"], ["top-right", "Top right"], ["middle-left", "Left of my face"], ["middle-right", "Right of my face"], ["lower", "Bottom (lower third)"]];
  const LAYER = [["", "As planned"], ["front", "In front of my face"], ["behind", "Behind my head (Mac only)"]];
  const AMOUNT = { few: ["Few", "about 1 every 10 seconds"], some: ["Some", "about 1 every 5 seconds"], lots: ["Lots", "about 1 every 3 seconds"] };
  let selG = null;
  const boardOf = (id) => S.board[id] || {};
  const capText = (c) => c.words.map((w) => w.text).join(" ");
  const capAt = (t) => { const live = CAPS.filter((c) => !c.gone); return live.find((c) => t >= c.start && t < c.end) || live.filter((c) => c.start <= t).pop() || live[0] || null; };
  function renderLine() {
    const tl = $("#tl"), D = Math.max(1, P.cutDur); tl.textContent = "";
    for (let t = 0; t < D; t += D > 90 ? 20 : 10) tl.append(el("span", { className: "tick", textContent: fmt(t), style: `left:${(t / D) * 100}%` }));
    const lanes = [], items = [];
    for (const g of GFX) items.push({ id: g.id, start: g.gone ? 0 : g.start, end: g.gone ? 0.1 : g.end, label: g.kind, cls: (boardOf(g.id).state || "k") + (g.gone ? " gone" : ""), title: `${g.kind}: ${g.what}` });
    for (const w of S.wanted || []) if (!w.done) { const c = CAPS.find((x) => x.ci === w.ci); items.push({ id: w.id, start: c ? c.start : 0, end: (c ? c.start : 0) + 2, label: "New: " + (KINDS.find((k) => k[0] === w.kind) || KINDS[0])[1], cls: "w", title: "A graphic you asked for" }); }
    items.sort((a, b) => a.start - b.start);
    for (const it of items) {
      const minW = (D * 60) / Math.max(200, tl.clientWidth || 600);   // a block is never thinner than a finger
      let lane = lanes.findIndex((end) => end <= it.start); if (lane < 0) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = Math.max(it.end, it.start + minW) + D * 0.004;
      const b = el("button", { type: "button", className: "tlb " + it.cls, textContent: it.label, title: it.title, style: `left:${(it.start / D) * 100}%;width:${(Math.max(it.end - it.start, minW) / D) * 100}%;top:${20 + lane * 36}px` });
      b.dataset.g = it.id; b.setAttribute("aria-pressed", String(it.id === selG));
      b.addEventListener("click", (e) => { e.stopPropagation(); selG = it.id; seekCut(Math.min(D - 0.1, it.start + 0.4)); renderLine(); renderDetail(); $("#addform").hidden = true; });
      tl.append(b);
    }
    tl.style.height = 26 + Math.max(1, lanes.length) * 36 + "px";
    tl.append(el("i", { id: "tlhead", style: `left:${(pos / D) * 100}%` }));
    const amt = $("#amount"), curA = S.amount || R.graphicsAmount || "some"; amt.textContent = ""; amt.append("How many: ");
    for (const k of ["few", "some", "lots"]) { const b = el("button", { type: "button", textContent: AMOUNT[k][0], title: AMOUNT[k][1] }); b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(k === curA)); b.dataset.amt = k;
      b.addEventListener("click", () => mutate(() => { S.amount = k === (R.graphicsAmount || "some") ? null : k; })); amt.append(b); }
    if (!items.length) tl.append(el("span", { className: "hint", textContent: "No graphics on this reel yet. Add one below.", style: "position:absolute;left:12px;top:26px" }));
  }
  $("#tl").addEventListener("click", (e) => { if (!P) return; const r = $("#tl").getBoundingClientRect(); seekCut(((e.clientX - r.left) / r.width) * P.cutDur); });
  function uploadBtn(files, onChange) {
    const wrap = el("div", { className: "hint" });
    if (!window.REEL_STUDIO_LINKS) return wrap;
    const inp = el("input", { type: "file", accept: "image/*,video/mp4,video/quicktime,.gif,.heic,.heif,.svg,.mp4,.mov,.m4v", multiple: true, hidden: true });
    const btn = el("button", { type: "button", className: "b sm", textContent: files.length ? "Add another picture or clip" : "Use my own picture, GIF or video clip" }), msg = el("span", { textContent: files.length ? ` ${files.length} added.` : "" });
    btn.addEventListener("click", () => inp.click());
    inp.addEventListener("change", async () => {
      const got = [...files];
      for (const f of inp.files) { msg.textContent = ` Uploading ${f.name}…`;
        try { const j = await (await fetch("/api/review-upload?name=" + encodeURIComponent(f.name), { method: "POST", body: f })).json(); if (!j.ok) throw new Error(j.error || "upload failed"); got.push(j.upload.src); }
        catch (e) { msg.textContent = ` ${f.name}: ${e.message}`; return; } }
      onChange(got.slice(0, 6));
    });
    wrap.append(btn, inp, msg); return wrap;
  }
  function renderDetail() {
    const box = $("#gdetail"); box.textContent = "";
    const w = (S.wanted || []).find((x) => x.id === selG && !x.done);
    if (w) {
      const rm = el("button", { type: "button", className: "b sm", textContent: "Take it back" }); rm.addEventListener("click", () => { selG = null; mutate(() => { S.wanted = S.wanted.filter((x) => x.id !== w.id); }); });
      box.append(el("div", { className: "gd" }, el("h3", { textContent: "You asked for: " + (KINDS.find((k) => k[0] === w.kind) || KINDS[0])[1] }), el("p", { className: "what", textContent: (w.note || "No details given. Claude picks.") + ` At "${w.line}".` }),
        uploadBtn(w.files || [], (files) => mutate(() => { S.wanted = S.wanted.map((x) => (x.id === w.id ? { ...x, files } : x)); })), el("p", { className: "hint", textContent: "Claude makes it at your next build from your chat." }), rm));
      return;
    }
    const g = GFX.find((x) => x.id === selG); if (!g) return;
    const st = boardOf(g.id).state || "k", card = el("div", { className: "gd" });
    card.dataset.g = g.id;
    card.append(el("h3", { textContent: `${g.kind} at ${fmt(g.start)}` }), el("p", { className: "what", textContent: g.what }));
    if (g.gone) card.append(el("p", { className: "warn", textContent: "Its line is cut, so this graphic won't appear." }));
    else if (g.moved) card.append(el("p", { className: "warn", textContent: "Its first word is cut, so it moved to the next kept word." }));
    const seg = el("div", { className: "seg" }); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "What to do with this graphic");
    for (const k of ["k", "c", "d"]) { const b = el("button", { type: "button", textContent: KEEP[k] }); b.dataset.state = k; b.setAttribute("aria-pressed", String(st === k));
      b.addEventListener("click", () => mutate(() => { S.board[g.id] = { ...boardOf(g.id), state: k }; })); seg.append(b); }
    card.append(seg);
    if (st === "c") {
      const inp = el("input", { type: "text", placeholder: "For example: make it a list of 3", value: boardOf(g.id).note || "" }); inp.id = "gnote";
      inp.addEventListener("input", () => { S.board[g.id] = { ...boardOf(g.id), state: "c", note: inp.value }; queueSave(); });
      card.append(el("label", { textContent: "What should change?" }, inp), uploadBtn(boardOf(g.id).files || [], (files) => mutate(() => { S.board[g.id] = { ...boardOf(g.id), state: "c", files }; })),
        el("p", { className: "hint", textContent: "Claude makes this change at your next build from your chat. Fixing the words below needs no Claude." }));
    }
    if (st !== "d" && !g.gone) {
      const set = boardOf(g.id).set || {};
      for (const [f, name] of WORD_FIELDS[g.type] || []) {
        const list = f === "rows" || f === "items", now = f in set ? set[f] : g[f]; if (now == null && f === "delta") continue;
        const inp = el(list ? "textarea" : "input", { value: list ? (now || []).join("\n") : now ?? "" }); if (!list) inp.type = "text"; else inp.rows = Math.max(3, (now || []).length); inp.maxLength = list ? 300 : 80; inp.dataset.wf = f;
        inp.addEventListener("change", () => mutate(() => {
          const cur = { ...boardOf(g.id) }, s2 = { ...(cur.set || {}) }, v = list ? inp.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 6) : inp.value.trim();
          if (JSON.stringify(v) === JSON.stringify(g[f]) || (!list && !v && f !== "sub" && f !== "delta")) delete s2[f]; else s2[f] = v;
          if (Object.keys(s2).length) cur.set = s2; else delete cur.set; S.board[g.id] = cur;
        }));
        card.append(el("label", { textContent: name }, inp));
      }
      const pickSel = (key, name, opts) => { const sel = el("select"); sel.append(...opts.map(([v, t]) => new Option(t, v))); sel.value = boardOf(g.id)[key] || ""; sel.dataset.place = key;
        sel.addEventListener("change", () => mutate(() => { const cur = { ...boardOf(g.id) }; if (sel.value) cur[key] = sel.value; else delete cur[key]; S.board[g.id] = cur; })); return el("label", { textContent: name }, sel); };
      card.append(el("div", { className: "two" }, pickSel("where", "Where on screen", WHERE), pickSel("layer", "In front or behind", LAYER)));
      if (boardOf(g.id).where && g.type !== "popup") card.append(el("p", { className: "hint", textContent: "Claude moves it at your next build from your chat." }));
    }
    box.append(card);
  }
  $("#addkind").append(...KINDS.map(([v, t]) => new Option(t, v)));
  $("#addkind").addEventListener("change", () => { $("#addhint").textContent = (KINDS.find((k) => k[0] === $("#addkind").value) || [])[2] || ""; });
  $("#addg").addEventListener("click", () => { if (!P) return; const c = capAt(pos); $("#addtitle").textContent = c ? `Add a graphic at ${fmt(c.start)}, "${capText(c).slice(0, 40)}"` : "Add a graphic at the start"; $("#addkind").value = "choose"; $("#addnote").value = ""; $("#addhint").textContent = ""; $("#addform").hidden = false; selG = null; renderLine(); renderDetail(); $("#addkind").focus(); });
  $("#addcancel").addEventListener("click", () => { $("#addform").hidden = true; });
  $("#addform").addEventListener("submit", (e) => {
    e.preventDefault(); const c = capAt(pos);
    const w = { id: "w" + Date.now().toString(36), kind: $("#addkind").value, ci: c ? c.ci : null, word: c ? c.words[0].i ?? null : null, line: c ? capText(c).slice(0, 80) : "the start of the reel", note: $("#addnote").value.trim().slice(0, 300) };
    $("#addform").hidden = true; selG = w.id; mutate(() => { S.wanted = [...(S.wanted || []), w]; });
  });
  function renderStyle() { renderLooks(); renderCapStyle(); renderLine(); renderDetail(); }

  // ---------- Wrap up: build ----------
  const STEP_TEXT = { queued: "Waiting to start.", cut: "Cutting the video.", render: "Building the video. This is the long part.", sound: "Mixing the sound.", checks: "Checking it.", copies: "Saving this version." };
  let build = { busy: false, text: "", error: "", told: [] };
  function renderBuild() {
    if (!R) return;
    const m = $("#buildmsg"); m.className = "";
    if (build.busy) m.textContent = build.text;
    else if (build.error) { m.textContent = build.error; m.className = "bad"; }
    else if (fresh()) { m.textContent = `Built ${new Date(B.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. It matches your choices. Press play on the preview.`; m.className = "ok"; }
    else if (B && B.url) m.textContent = "You've changed things since the last build. Build again to see them.";
    else m.textContent = "Not built yet.";
    $("#build").disabled = build.busy; $("#build").textContent = build.busy ? "Building…" : B && B.url ? "Build again" : "Build my reel";
    const ul = $("#told"); ul.textContent = "";
    if (build.told.length && !build.busy) for (const t of build.told) { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); }
  }
  async function pollBuild() {
    try {
      const j = await (await fetch("/api/review-build")).json(), st = j.build.state;
      if (st === "importing") build = { ...build, busy: true, text: "Reading your choices." };
      else if (st === "rendering") build = { ...build, busy: true, text: STEP_TEXT[j.job.step] || "Building." };
      else if (st === "failed") build = { busy: false, text: "", error: "The build stopped: " + (j.build.error || "unknown reason") + " Tell Claude \"the build failed\" and it will look.", told: [] };
      else if (st === "done") { const was = build.busy; build = { busy: false, text: "", error: "", told: j.build.told || [] }; if (was) quickPoll(); }
      else build = { ...build, busy: false };
    } catch { build = { ...build, busy: false }; }
    renderBuild(); syncSource(); if (build.busy) setTimeout(pollBuild, 2000);
  }
  $("#build").addEventListener("click", async () => {
    clearTimeout(timer); clearTimeout(quickT); if (dirty) saveNow(); await saving;
    build = { busy: true, text: "Reading your choices.", error: "", told: [] }; renderBuild(); syncSource();
    for (let i = 0; i < 200 && quickBusy(); i++) { await new Promise((r) => setTimeout(r, 500)); await quickPoll(); }
    try { const r = await fetch("/api/review-build", { method: "POST" }), j = await r.json(); if (!j.ok) throw new Error(j.error || "the build did not start"); }
    catch (e) { build = { busy: false, text: "", error: /Failed to fetch|NetworkError|404/.test(String(e.message)) ? "This page can't start a build from here. Tell Claude \"build preview\"." : "The build did not start: " + e.message, told: [] }; renderBuild(); return; }
    setTimeout(pollBuild, 1500);
  });

  function renderAll() { renderWords(); renderCaps(); renderStyle(); renderBuild(); syncSource(); }

  // ---------- load ----------
  (async () => {
    const links = window.REEL_STUDIO_LINKS || {};
    $$(".steps .step[data-step]").forEach((el) => { const u = links[el.dataset.step]; if (typeof u === "string" && /^\/[\w\-\/]*$/.test(u)) { el.href = u; el.classList.remove("off"); el.removeAttribute("title"); } });
    const db = await window.claude?.use?.("db");
    if (!db) { $("#reelname").textContent = "This page can't load the reel. Open it from your Unmess Reels link."; return; }
    try {
      const rs = await db.doc("reel/current").get();
      if (!rs.exists) { $("#reelname").textContent = "No reel loaded yet. Ask Claude to edit a clip first."; return; }
      R = rs.data();
      if (R.fonts) { const css = [["rb", R.fonts.body], ["ra", R.fonts.accent]].filter((f) => f[1]).map(([n, u]) => `@font-face{font-family:${n};src:url(${u});font-display:swap}`).join(""); document.head.appendChild(Object.assign(document.createElement("style"), { textContent: css })); }
      ref = db.doc("review/current");
      const rv = await ref.get(); if (rv.exists) S = { ...blank(), ...JSON.parse(JSON.stringify(rv.data())) };
      ref.onSnapshot((s) => {   // Claude, or the current Edit page in another tab, changed the choices: take theirs
        if (!s.exists || !R) return; const d = s.data(); if (d.updatedAt === mine || dirty) return;
        if (strip(d) === strip(S)) return;
        S = { ...blank(), ...JSON.parse(JSON.stringify(d)) }; undo = []; redo = []; syncUndo(); recompute(); renderAll(); setPos(pos); pill("Updated from another page");
      }, () => {});
      db.doc("builds/latest").onSnapshot((s) => { B = s.exists ? s.data() : null; if (R && P) { renderBuild(); syncSource(); } }, () => {});
      recompute(); restoreUndo();
      const want = location.hash.slice(1); tab = ["trim", "style", "audio", "wrap"].includes(want) ? want : "trim";
      renderWords(); renderCaps(); renderStyle(); showTab(tab); pollBuild(); quickPoll();
    } catch (e) { $("#reelname").textContent = "The reel didn't load. Reload the page."; console.error(e); }
  })();
})();
