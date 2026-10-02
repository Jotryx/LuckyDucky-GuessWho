// Sends anonymous game events to the stats Worker in small batches.
// Nothing personal is sent: a player pass handed out by the Worker (random, hashed again on the
// server), what happened ("rule_out") and, for some events, which cookie/background it was about.
(() => {
  const url = (window.STATS_URL || "").replace(/\/+$/, "");
  const off = !url
    || new URLSearchParams(location.search).has("demo")          // testing boards don't count
    || navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true;
  if (off) { window.track = () => {}; return; }

  const PASS_KEY = "crk-guess-who-pass", OLD_ID_KEY = "crk-guess-who-player";
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  let pass = store.get(PASS_KEY), asking = false;

  // a new player asks the Worker for a signed pass once (it may say "slow down" to bots)
  function getPass() {
    if (pass || asking) return;
    asking = true;
    const keep = store.get(OLD_ID_KEY);
    fetch(url + "/hello" + (keep ? "?keep=" + encodeURIComponent(keep) : ""))
      .then((r) => r.json())
      .then((d) => { if (d && d.pass) { pass = d.pass; store.set(PASS_KEY, pass); flush(); } })
      .catch(() => {})
      .finally(() => { asking = false; });
  }

  let queue = [];
  function flush() {
    if (!queue.length) return;
    if (!pass) { getPass(); return; }   // events wait until there's a pass
    const body = JSON.stringify({ id: pass, events: queue.splice(0, 40) });
    // text/plain avoids a CORS preflight; sendBeacon still delivers when the tab is closing
    const blob = new Blob([body], { type: "text/plain" });
    if (!(navigator.sendBeacon && navigator.sendBeacon(url + "/event", blob))) {
      fetch(url + "/event", { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
    }
    if (queue.length) flush();
  }

  window.track = (t, c, extra) => {
    if (queue.length < 400) queue.push({ t, ...(c ? { c } : {}), ...(extra || {}) });
    if (queue.length >= 40) flush();
  };
  setInterval(flush, 5000);
  addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
  addEventListener("pagehide", flush);

  getPass();
  window.track("visit");
})();
