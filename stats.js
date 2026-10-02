// Sends anonymous game events to the stats Worker in small batches.
// Nothing personal is sent: a player pass handed out by the Worker (random, hashed again on the
// server), what happened ("rule_out") and, for some events, which cookie/background it was about.
(() => {
  const url = (window.STATS_URL || "").replace(/\/+$/, "");
  const params = new URLSearchParams(location.search);

  // ?statsdebug shows a little label saying whether this browser is counted, and if not, why
  const debug = params.has("statsdebug");
  let label = null;
  function say(text, bad = false) {
    if (!debug) return;
    if (!label) {
      label = document.createElement("div");
      label.style.cssText = "position:fixed;left:10px;bottom:10px;z-index:99;max-width:min(92vw,420px);padding:8px 12px;" +
        "border-radius:12px;font:700 13px/1.35 system-ui,sans-serif;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.4)";
      (document.body || document.documentElement).append(label);
    }
    label.style.background = bad ? "#b3261e" : "#1f7a4d";
    label.textContent = "Stats: " + text;
  }

  const reason = !url ? "off (no Worker address in stats-config.js)"
    : params.has("demo") ? "off (demo boards never count)"
    : navigator.doNotTrack === "1" ? "off (“Do Not Track” is switched on in this browser)"
    : navigator.globalPrivacyControl === true ? "off (“Global Privacy Control” is on in this browser or an extension)"
    : "";
  if (reason) {
    window.track = () => {};
    if (debug) addEventListener("DOMContentLoaded", () => say(reason, true));
    return;
  }

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
      .then((d) => {
        if (d && d.pass) { pass = d.pass; store.set(PASS_KEY, pass); say("on – player pass received"); flush(); }
        else say("the stats server refused a player pass (" + ((d && d.error) || "unknown") + ")", true);
      })
      .catch(() => say("can't reach the stats server – an ad or tracker blocker is probably blocking it", true))
      .finally(() => { asking = false; });
  }

  let queue = [], sent = 0;
  function flush() {
    if (!queue.length) return;
    if (!pass) { getPass(); return; }   // events wait until there's a pass
    const body = JSON.stringify({ id: pass, events: queue.splice(0, 40) });
    if (debug) {   // debug mode reads the answer, so it can say whether the batch was accepted
      fetch(url + "/event", { method: "POST", body, headers: { "Content-Type": "text/plain" } })
        .then((r) => r.json())
        .then((d) => { sent++; say(d.ok ? `on – ${sent} batch${sent > 1 ? "es" : ""} sent and accepted` : `a batch was refused (${d.error || "unknown"})`, !d.ok); })
        .catch(() => say("can't reach the stats server – an ad or tracker blocker is probably blocking it", true));
      if (queue.length) flush();
      return;
    }
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

  // starting message, unless something more specific was already said
  if (debug) addEventListener("DOMContentLoaded", () => label || say(pass ? "on – this browser has a player pass" : "on – asking for a player pass…"));
  getPass();
  window.track("visit");
})();
