// The game mode menu shown when the site opens: Guess Who, and Guess the Gender ("coming soon").
//
// Guess the Gender is for testers only. Tapping its card 5 times quickly opens a password box; the
// password is checked by the stats Worker (it's a Cloudflare secret, never in this code), which hands
// back a signed tester pass. With that pass the Worker serves the mode's code, styles and gender list,
// none of which are in the public site or repo. The pass is kept in this browser for 30 days.
(() => {
  const $ = (id) => document.getElementById(id);
  const url = (window.STATS_URL || "").replace(/\/+$/, "");
  const PASS_KEY = "crk-tester-pass";
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    del: (k) => { try { localStorage.removeItem(k); } catch {} },
  };
  const fx = () => window.FX || {};

  // ---------- the cookies on the two cards ----------
  const regular = (window.COOKIES || []).filter((c) => !c.collab);
  const sample = (n) => regular.slice().sort(() => Math.random() - 0.5).slice(0, n);
  function art(box, cookies) {
    cookies.forEach((c, i) => {
      const img = new Image();
      img.src = c.src; img.alt = ""; img.draggable = false;
      img.style.setProperty("--i", i);
      box.append(img);
    });
  }
  art(document.querySelector(".whoArt"), sample(3));
  // Guess the Gender: three face-down mystery cards
  [0, 1, 2].forEach((i) => {
    const m = document.createElement("span");
    m.className = "mystery"; m.textContent = "?"; m.style.setProperty("--i", i);
    document.querySelector(".genderArt").append(m);
  });
  ["He", "She", "They"].forEach((t, i) => {
    const s = document.createElement("span");
    s.className = "pronounChip chip" + t; s.textContent = t; s.style.setProperty("--i", i);
    document.querySelector(".genderArt").append(s);
  });

  // ---------- showing screens ----------
  const genderCard = $("modeGender");
  let tester = false;     // the tester pass worked and the mode is loaded
  function show(screen) {
    document.body.dataset.screen = screen;
    $("modes").hidden = screen !== "menu";
    if (screen === "menu") {
      document.querySelectorAll(".modeCard").forEach((c) => c.classList.remove("chosen", "notChosen"));
      $("modes").classList.remove("leaving");
    }
    if (screen === "who") dispatchEvent(new Event("resize"));   // the board measures itself again
  }
  function leaveMenu(card, then) {
    card.classList.add("chosen");
    document.querySelectorAll(".modeCard").forEach((c) => c !== card && c.classList.add("notChosen"));
    fx().burst?.(card, 12, 1.1);
    $("modes").classList.add("leaving");
    setTimeout(then, 520);
  }

  $("modeWho").onclick = () => leaveMenu($("modeWho"), () => show("who"));
  // the logo on the Guess Who sheet goes back to the menu
  document.querySelector(".sheet .logo")?.addEventListener("click", () => show("menu"));

  // ---------- Guess the Gender: tester access ----------
  let taps = [];
  genderCard.onclick = () => {
    if (tester) {
      leaveMenu(genderCard, () => { show("gender"); window.GenderMode?.open(); });
      return;
    }
    // looks like a plain "not yet" wiggle; 5 quick taps open the password box
    genderCard.classList.remove("nope"); void genderCard.offsetWidth; genderCard.classList.add("nope");
    const now = Date.now();
    taps = taps.filter((t) => now - t < 3000).concat(now);
    if (taps.length >= 5) { taps = []; openUnlock(); }
  };

  function openUnlock() {
    $("unlockMsg").textContent = url ? "" : "Tester access isn't available here.";
    $("unlockPass").value = "";
    $("unlockDialog").showModal();
    $("unlockPass").focus();
  }
  $("unlockClose").onclick = () => $("unlockDialog").close();
  $("unlockDialog").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  $("unlockForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!url) return;
    const msg = $("unlockMsg"), button = e.target.querySelector("button[type=submit]");
    button.disabled = true; msg.textContent = "Checking…";
    try {
      const r = await fetch(url + "/unlock", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: $("unlockPass").value }),
      });
      const d = await r.json();
      if (d.ok && d.token) {
        store.set(PASS_KEY, d.token);
        msg.textContent = "Unlocked!";
        if (await loadTesterMode(d.token)) {
          $("unlockDialog").close();
          celebrate();
        } else msg.textContent = "Unlocked, but the game mode didn't load. Try again in a moment.";
      } else {
        msg.textContent = d.error === "slow down" ? "Too many tries. Wait a minute and try again."
          : d.error === "not set up" ? "Tester access isn't set up yet."
          : "That's not the password.";
        $("unlockPass").animate([{ translate: "0" }, { translate: "-8px" }, { translate: "7px" }, { translate: "-4px" }, { translate: "0" }], { duration: 360 });
        $("unlockPass").select();
      }
    } catch {
      msg.textContent = "Couldn't reach the server. Check your connection.";
    }
    button.disabled = false;
  });

  // fetch the mode's styles, code and gender list with the tester pass
  async function loadTesterMode(token) {
    if (window.GenderMode) { setTester(true); return true; }
    try {
      const get = async (file) => {
        const r = await fetch(`${url}/tester/${file}`, { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
        if (r.status === 401) throw new Error("pass");
        if (!r.ok) throw new Error("load");
        return r.text();
      };
      const [css, js, genders] = await Promise.all([get("gender.css"), get("gender.js"), get("genders.json")]);
      const style = document.createElement("style");
      style.textContent = css;
      document.head.append(style);
      const script = document.createElement("script");
      script.textContent = js;
      document.body.append(script);
      window.GenderMode?.init({ genders: JSON.parse(genders), cookies: regular, back: () => show("menu") });
      setTester(!!window.GenderMode);
      return !!window.GenderMode;
    } catch (err) {
      if (err.message === "pass") store.del(PASS_KEY);   // expired, or the password changed
      return false;
    }
  }

  function setTester(on) {
    tester = on;
    genderCard.classList.toggle("soon", !on);
    genderCard.classList.toggle("tester", on);
  }

  function celebrate() {
    genderCard.classList.add("unlocking");
    setTimeout(() => genderCard.classList.remove("unlocking"), 1200);
    fx().burst?.(genderCard, 20, 1.4);
    fx().puff?.(genderCard, true);
    fx().boing?.(genderCard, 0.8);
  }

  // ---------- start ----------
  const params = new URLSearchParams(location.search);
  // a shared board link (or test mode) goes straight into Guess Who
  show(params.has("board") || params.has("demo") ? "who" : "menu");
  const saved = store.get(PASS_KEY);
  if (saved && url) loadTesterMode(saved);
})();
