// Sends anonymous game events to the stats Worker in small batches.
// Nothing personal is sent: just a random id made on this device (hashed again on the server),
// what happened ("rule_out") and, for some events, which cookie/background it was about.
(() => {
  const url = (window.STATS_URL || "").replace(/\/+$/, "");
  const off = !url
    || new URLSearchParams(location.search).has("demo")          // testing boards don't count
    || navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true;
  if (off) { window.track = () => {}; return; }

  const ID_KEY = "crk-guess-who-player";
  let id;
  try {
    id = localStorage.getItem(ID_KEY);
    if (!id) { id = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)); localStorage.setItem(ID_KEY, id); }
  } catch { id = Math.random().toString(36).slice(2) + Date.now().toString(36); }

  let queue = [];
  function flush() {
    if (!queue.length) return;
    const body = JSON.stringify({ id, events: queue.splice(0, 40) });
    // text/plain avoids a CORS preflight; sendBeacon still delivers when the tab is closing
    const blob = new Blob([body], { type: "text/plain" });
    if (!(navigator.sendBeacon && navigator.sendBeacon(url + "/event", blob))) {
      fetch(url + "/event", { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
    }
    if (queue.length) flush();
  }

  window.track = (t, c, extra) => {
    queue.push({ t, ...(c ? { c } : {}), ...(extra || {}) });
    if (queue.length >= 40) flush();
  };
  setInterval(flush, 5000);
  addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
  addEventListener("pagehide", flush);

  window.track("visit");
})();
