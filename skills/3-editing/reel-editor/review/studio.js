// Added by By Mel Ross (0.39.0). The new Edit page (studio.html), step 1 of 5: the preview, the 4 tabs, and the Trim tab.
// It reads and writes the same decisions as the review page (review/current through the page's db), and uses the same
// core.js to turn them into a cut, so a cut made here is the cut that renders. Style and Sound arrive in the next steps.
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
    saving = saving.then(() => ref.set(body)).then(() => { $("#savedat").textContent = "Saved " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); },
      (e) => pill("Couldn't save (" + (e?.code || "error") + "). Check the Reel Studio link is still running.", true));
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
    syncSource(); renderBuild();
  }
  $$(".tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  document.addEventListener("click", (e) => { const n = e.target.closest("[data-next]"); if (n) { showTab(n.dataset.next); window.scrollTo({ top: 0, behavior: "smooth" }); } });

  // ---------- the preview: the rough cut while you trim, the built reel once a build matches your choices ----------
  const showsBuilt = () => tab !== "trim" && fresh();
  function syncSource() {
    if (!R) return;
    const want = showsBuilt() ? B.url : R.srcUrl;
    const changed = v.getAttribute("src") !== want;
    if (changed) { stop(); v.setAttribute("src", want); v.load(); }
    if (showsBuilt()) { mode = "built"; ov.textContent = ""; if (changed) { $("#scrub").max = (B.cutDur || P.cutDur).toFixed(1); $("#scrub").value = 0; clock(0, +$("#scrub").max); }
      $("#pnote").textContent = "Your built reel. It matches your choices."; }
    else { if (mode === "built") mode = "idle"; setPos(pos); overlay(pos);
      $("#pnote").textContent = B && B.url ? "Rough preview. You've changed things since the last build, so build again in Wrap up to see them finished." : "Rough preview: your cuts and captions, with graphics as outlines. Build in Wrap up to see the finished look."; }
  }
  const clock = (a, b) => { $("#clock").textContent = `${fmt(a)} / ${fmt(b)}`; };
  function stop() { cancelAnimationFrame(loop); v.pause(); v.playbackRate = 1; if (mode !== "built") mode = "paused"; $("#playbtn").textContent = "▶"; $("#playbtn").setAttribute("aria-label", "Play"); }
  function setPos(c) { if (!P) return; pos = Math.max(0, Math.min(c, P.cutDur - 0.05)); if (mode === "built") return; $("#scrub").max = P.cutDur.toFixed(1); $("#scrub").value = pos.toFixed(1); clock(pos, P.cutDur); }
  function seekCut(c) { setPos(c); v.currentTime = P.toSrc(pos); if (mode !== "rough") { mode = "paused"; overlay(pos); } }
  function playing() { $("#playbtn").textContent = "❚❚"; $("#playbtn").setAttribute("aria-label", "Pause"); }
  function playRough(from = pos) {
    if (from >= P.cutDur - 0.1) from = 0;
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
    if (mode === "built") return;
    stop(); mode = "line"; v.currentTime = s; playing(); ov.textContent = "";
    v.play().catch(() => { stop(); pill("Playback was blocked. Tap the time again.", true); });
    const tick = () => { if (mode !== "line") return; if (v.currentTime >= e) { stop(); overlay(pos); return; } nowWord(v.currentTime); loop = requestAnimationFrame(tick); };
    loop = requestAnimationFrame(tick);
  }
  $("#playbtn").addEventListener("click", () => {
    if (!R) return;
    if (mode === "built") { if (v.paused) { v.play().catch(() => {}); playing(); } else stop(); return; }
    if (mode === "rough" || mode === "line") { stop(); overlay(pos); } else playRough(pos);
  });
  $("#scrub").addEventListener("input", (e) => { if (!R) return; if (mode === "built") { v.currentTime = +e.target.value; clock(+e.target.value, +e.target.max); } else seekCut(+e.target.value); });
  v.addEventListener("timeupdate", () => { if (mode !== "built") return; $("#scrub").value = v.currentTime.toFixed(1); clock(v.currentTime, v.duration || +$("#scrub").max); });
  v.addEventListener("loadedmetadata", () => { if (mode === "built" && v.duration) { $("#scrub").max = v.duration.toFixed(1); clock(0, v.duration); } });
  v.addEventListener("ended", () => { if (mode === "built") stop(); });
  v.addEventListener("error", () => pill("The video didn't load. Reload the page.", true));

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
  function overlay(c) {
    ov.textContent = "";
    if (!R || mode === "built" || mode === "line" || c == null) return;
    for (const g of GFX) if (!g.gone && g.state !== "d" && c >= g.start && c < g.end) {
      const [x, y, w, h] = g.place || [90, 200, 900, 500], b = document.createElement("div"); b.className = "gbox"; b.textContent = g.kind;
      Object.assign(b.style, { left: x / 10.8 + "%", top: y / 19.2 + "%", width: w / 10.8 + "%", height: h / 19.2 + "%" });
      if (g.imgUrl) b.style.backgroundImage = `url(${JSON.stringify(g.imgUrl)})`;
      ov.appendChild(b);
    }
    const cap = CAPS.find((x) => !x.gone && c >= x.start && c < x.end);
    if (cap && cap.pos !== "hide") { const el = capEl(shown(cap, c), capMode() === "spoken"); ov.appendChild(el); let fs = parseFloat(el.style.fontSize); for (let i = 0; i < 25 && el.scrollWidth > el.clientWidth + 1; i++) { fs *= 0.92; el.style.fontSize = fs + "px"; } }
    nowWord(P.toSrc(c)); $$(".caprow").forEach((r) => r.classList.toggle("now", !!cap && +r.dataset.ci === cap.ci));
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
    const fills = R.words.filter((w, i) => w.filler && !fb.has(i)).length, pt = P.pauses.filter((p) => !p.kept).length, nfs = (R.falseStarts || []).filter((f) => f.w.some((i) => cut.has(i))).length;
    $("#ctally").innerHTML = `<span>reel <b>${fmt(P.cutDur)}</b> from ${fmt(R.srcDur)}</span><span><b>${cut.size}</b> ${cut.size === 1 ? "word" : "words"} cut</span>${(R.falseStarts || []).length ? `<span><b>${nfs}</b> of ${R.falseStarts.length} false starts cut</span>` : ""}<span><b>${fills}</b> fillers removed</span><span><b>${pt}</b> of ${P.pauses.length} pauses trimmed</span>`;
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
      ts.textContent = fmt(c.start); ts.title = "Play from this caption"; ts.addEventListener("click", () => { if (mode === "built") showTab("trim"); playRough(c.start); });
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
    const acc = live.reduce((n, c) => n + c.words.filter((w) => w.accent).length, 0);
    $("#captally").innerHTML = `<span><b>${live.length}</b> captions</span><span><b>${acc}</b> highlighted words</span>`;
  }

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
      else if (st === "done") build = { busy: false, text: "", error: "", told: j.build.told || [] };
      else build = { ...build, busy: false };
    } catch { build = { ...build, busy: false }; }
    renderBuild(); if (build.busy) setTimeout(pollBuild, 2000);
  }
  $("#build").addEventListener("click", async () => {
    clearTimeout(timer); if (dirty) saveNow(); await saving;
    build = { busy: true, text: "Reading your choices.", error: "", told: [] }; renderBuild();
    try { const r = await fetch("/api/review-build", { method: "POST" }), j = await r.json(); if (!j.ok) throw new Error(j.error || "the build did not start"); }
    catch (e) { build = { busy: false, text: "", error: /Failed to fetch|NetworkError|404/.test(String(e.message)) ? "This page can't start a build from here. Tell Claude \"build preview\"." : "The build did not start: " + e.message, told: [] }; renderBuild(); return; }
    setTimeout(pollBuild, 1500);
  });

  function renderAll() { renderWords(); renderCaps(); renderBuild(); syncSource(); }

  // ---------- load ----------
  (async () => {
    const links = window.REEL_STUDIO_LINKS || {};
    $$(".steps .step[data-step]").forEach((el) => { const u = links[el.dataset.step]; if (typeof u === "string" && /^\/[\w\-\/]*$/.test(u)) { el.href = u; el.classList.remove("off"); el.removeAttribute("title"); } });
    const db = await window.claude?.use?.("db");
    if (!db) { $("#reelname").textContent = "This page can't load the reel. Open it from your Reel Studio link."; return; }
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
      const want = location.hash.slice(1); tab = ["trim", "style", "sound", "wrap"].includes(want) ? want : "trim";
      renderWords(); renderCaps(); showTab(tab); pollBuild();
    } catch (e) { $("#reelname").textContent = "The reel didn't load. Reload the page."; console.error(e); }
  })();
})();
