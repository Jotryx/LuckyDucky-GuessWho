(() => {
  const KEY = "crk-guess-who-v1";
  const $ = (id) => document.getElementById(id);
  let cookies = (window.COOKIES || []).slice();
  let state = { secret: null, off: [], pending: null, bg: null, hide: false };
  try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  const label = (c) => (/^\d+$/.test(c.name) ? "#" + c.name : c.name);
  const mode = () => (state.secret ? "board" : "pick");

  function card(c, i) {
    const b = document.createElement("button");
    b.className = "card"; b.type = "button"; b.role = "listitem";
    b.title = label(c); b.dataset.name = c.name;
    b.style.setProperty("--i", Math.min(i, 60));
    b.innerHTML = `<img alt=""><span class="tag"></span>`;
    b.querySelector("img").src = c.src;
    b.querySelector(".tag").textContent = label(c);
    b.addEventListener("click", () => onCard(c, b));
    return b;
  }

  function render() {
    const grid = $("grid");
    $("empty").hidden = cookies.length > 0;
    grid.hidden = !cookies.length;
    grid.replaceChildren();
    if (cookies.length) {
      const names = new Set(cookies.map((c) => c.name));
      if (!names.has(state.secret)) Object.assign(state, { secret: null, off: [] });
      if (!names.has(state.pending)) state.pending = null;
      cookies.forEach((c, i) => grid.append(card(c, i)));
    }
    document.body.dataset.mode = mode();
    updateCards(); updateSide();
  }

  function updateCards() {
    const off = new Set(state.off);
    $("grid").querySelectorAll(".card").forEach((b) => {
      const n = b.dataset.name;
      b.setAttribute("aria-pressed", mode() === "pick" ? n === state.pending : off.has(n));
    });
  }

  function updateSide() {
    const pick = mode() === "pick";
    const c = cookies.find((x) => x.name === (pick ? state.pending : state.secret));
    $("choiceImg").hidden = !c; $("choiceEmpty").hidden = !!c;
    if (c) $("choiceImg").src = c.src;
    $("choiceName").textContent = c ? label(c) : "";
    const hidden = !pick && state.hide;
    $("portrait").classList.toggle("hidden", hidden);
    $("choiceName").classList.toggle("hidden", hidden);
    $("peek").setAttribute("aria-pressed", hidden);
    $("peek").textContent = hidden ? "Show my cookie" : "Hide my cookie";
    $("pickCtl").hidden = !cookies.length || !pick;
    $("boardCtl").hidden = !cookies.length || pick;
    $("lock").disabled = !state.pending;
    $("hint").textContent = !cookies.length ? ""
      : pick ? (c ? "Lock it in when you're ready. Keep it secret!" : "Pick the cookie your opponent has to guess.")
      : `${cookies.length - state.off.length} of ${cookies.length} cookies still in`;
  }

  function onCard(c) {
    if (mode() === "pick") state.pending = c.name;
    else {
      const off = new Set(state.off);
      off.has(c.name) ? off.delete(c.name) : off.add(c.name);
      state.off = [...off];
    }
    save(); updateCards(); updateSide();
  }

  $("lock").onclick = () => { Object.assign(state, { secret: state.pending, off: [], pending: null }); save(); render(); };
  $("reset").onclick = () => { state.off = []; save(); updateCards(); updateSide(); };
  $("again").onclick = () => { Object.assign(state, { secret: null, off: [], pending: null }); save(); render(); };
  $("peek").onclick = () => { state.hide = !state.hide; save(); updateSide(); };

  $("files").addEventListener("change", (e) => {
    cookies = [...e.target.files].filter((f) => f.type.startsWith("image/"))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((f) => ({
        name: f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
        src: URL.createObjectURL(f),
      }));
    Object.assign(state, { secret: null, off: [], pending: null }); render();
  });

  // Backgrounds
  const backgrounds = window.BACKGROUNDS || [];
  function applyBg() {
    const bg = backgrounds.find((b) => b.src === state.bg);
    if (!bg) state.bg = null;
    $("scene").style.backgroundImage = bg ? `url("${bg.src}")` : "";
    document.documentElement.style.setProperty("--scene", bg ? `url("${bg.src}")` : "none");
    document.body.classList.toggle("has-bg", !!bg);
    $("bgList").querySelectorAll(".bgOpt").forEach((o) => o.setAttribute("aria-pressed", o.dataset.src === (state.bg || "")));
  }
  function bgOption(name, src, thumb) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "bgOpt"; b.dataset.src = src; b.title = name;
    b.innerHTML = `<span class="thumb"></span><span class="lbl"></span>`;
    if (thumb) { const img = new Image(); img.loading = "lazy"; img.alt = ""; img.src = thumb; b.firstChild.append(img); }
    b.querySelector(".lbl").textContent = name;
    b.addEventListener("click", () => { state.bg = src || null; save(); applyBg(); });
    return b;
  }
  function buildBgList() {
    const list = $("bgList");
    const groups = new Map([["", [bgOption("Default", "", null)]]]);
    backgrounds.forEach((bg) => {
      if (!groups.has(bg.group)) groups.set(bg.group, []);
      groups.get(bg.group).push(bgOption(bg.name, bg.src, bg.src));
    });
    groups.forEach((items, name) => {
      if (name) { const h = document.createElement("h3"); h.textContent = name; list.append(h); }
      const g = document.createElement("div"); g.className = "bgGrid"; g.append(...items); list.append(g);
    });
  }
  buildBgList();
  document.querySelectorAll(".bgBtn").forEach((b) => (b.onclick = () => $("bgDialog").showModal()));
  $("bgClose").onclick = () => $("bgDialog").close();
  $("bgDialog").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  applyBg();

  render();
})();
