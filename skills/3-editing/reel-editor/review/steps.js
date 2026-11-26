// Added by By Mel Ross (0.38.2). A step in the step bar that can't open from here (greyed) used to explain itself only in a
// tooltip, which phones never show. Tapping it now opens a small card that says why, with the words to send Claude and a
// Copy button. Shared by every page with a step bar.
(() => {
  const css = document.createElement("style");
  css.textContent = `.steps .step.off{cursor:pointer}
#stepcard{position:fixed;left:12px;right:12px;top:64px;max-width:440px;margin:0 auto;z-index:90;background:#fff;color:#0d2b2d;border:1.5px solid #0d2b2d;border-radius:14px;padding:14px 16px;box-shadow:0 8px 28px rgba(0,0,0,.18);font:15px/1.45 -apple-system,"Helvetica Neue",Arial,sans-serif}
#stepcard p{margin:0 0 10px}#stepcard code{display:block;background:#f5f2ec;border-radius:8px;padding:8px 10px;margin:0 0 10px;font:14px/1.4 ui-monospace,Menlo,monospace;white-space:pre-wrap}
#stepcard button{font:inherit;font-weight:600;min-height:44px;padding:0 14px;border-radius:12px;border:1.5px solid #0d2b2d;background:#fff;color:#0d2b2d;margin-right:8px;cursor:pointer}#stepcard button.pri{background:#0d2b2d;color:#fff}`;
  document.head.append(css);
  function card(step) {
    document.querySelector("#stepcard")?.remove();
    const t = step.getAttribute("title") || "", ask = (t.match(/^Ask Claude to (.+)$/) || [])[1];
    const name = step.textContent.trim().replace(/^\d+\s*/, "");
    const el = document.createElement("div"); el.id = "stepcard"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", name);
    const p = document.createElement("p");
    if (ask) {
      p.textContent = `${name} opens once Claude starts it. Send Claude this:`;
      const code = document.createElement("code"); code.textContent = ask.charAt(0).toUpperCase() + ask.slice(1);
      const copy = document.createElement("button"); copy.type = "button"; copy.className = "pri"; copy.textContent = "Copy";
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(code.textContent); copy.textContent = "Copied"; }
        catch { const r = document.createRange(); r.selectNodeContents(code); const s = getSelection(); s.removeAllRanges(); s.addRange(r); copy.textContent = "Select and copy it"; }
      });
      el.append(p, code, copy);
    } else { p.textContent = t || `${name} isn't ready yet.`; el.append(p); }
    const close = document.createElement("button"); close.type = "button"; close.textContent = "Close"; close.addEventListener("click", () => el.remove());
    el.append(close); document.body.append(el); close.focus();
  }
  document.addEventListener("click", (e) => {
    const s = e.target.closest(".steps .step.off");
    if (s) { e.preventDefault(); card(s); return; }
    const c = document.querySelector("#stepcard"); if (c && !c.contains(e.target)) c.remove();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelector("#stepcard")?.remove(); });
})();
