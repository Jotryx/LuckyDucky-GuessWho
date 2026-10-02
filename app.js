(() => {
  const KEY = "crk-guess-who-v1";
  const $ = (id) => document.getElementById(id);
  let cookies = (window.COOKIES || []).slice();
  let state = { secret: null, off: [], pending: null, bg: null };
  try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  const show = (id) => ["empty", "pick", "board"].forEach((s) => ($(s).hidden = s !== id));

  function card(c, i, pressed, onClick) {
    const b = document.createElement("button");
    b.className = "card"; b.type = "button"; b.role = "listitem";
    b.style.setProperty("--i", Math.min(i, 40));
    b.setAttribute("aria-pressed", pressed);
    b.innerHTML = `<img alt=""><span></span>`;
    b.querySelector("img").src = c.src;
    b.querySelector("span").textContent = /^\d+$/.test(c.name) ? "#" + c.name : c.name;
    b.addEventListener("click", () => onClick(b));
    return b;
  }

  function start() {
    if (!cookies.length) return show("empty");
    const names = new Set(cookies.map((c) => c.name));
    if (!names.has(state.secret)) Object.assign(state, { secret: null, off: [] });
    if (!names.has(state.pending)) state.pending = null;
    state.secret ? renderBoard() : renderPick();
  }

  function renderPick() {
    show("pick");
    const grid = $("pickGrid"); grid.replaceChildren();
    cookies.forEach((c, i) => grid.append(card(c, i, c.name === state.pending, (b) => {
      grid.querySelectorAll(".card").forEach((x) => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true"); state.pending = c.name; save(); $("lock").disabled = false;
    })));
    $("lock").disabled = !state.pending;
    $("lock").onclick = () => { Object.assign(state, { secret: state.pending, off: [], pending: null }); save(); renderBoard(); };
  }

  function renderBoard() {
    show("board");
    const me = cookies.find((c) => c.name === state.secret);
    $("mineImg").src = me.src; $("mineName").textContent = /^\d+$/.test(me.name) ? "#" + me.name : me.name;
    const grid = $("boardGrid"); grid.replaceChildren();
    const off = new Set(state.off);
    const count = () => ($("count").textContent = `${cookies.length - off.size} of ${cookies.length} cookies still in`);
    cookies.forEach((c, i) => grid.append(card(c, i, off.has(c.name), (b) => {
      off.has(c.name) ? off.delete(c.name) : off.add(c.name);
      b.setAttribute("aria-pressed", off.has(c.name));
      state.off = [...off]; save(); count();
    })));
    count();
    $("reset").onclick = () => { off.clear(); state.off = []; save(); renderBoard(); };
    $("again").onclick = () => { Object.assign(state, { secret: null, off: [], pending: null }); save(); renderPick(); };
    $("peek").onclick = (e) => {
      const hide = $("peek").getAttribute("aria-pressed") !== "true";
      e.target.setAttribute("aria-pressed", hide);
      e.target.textContent = hide ? "Show" : "Hide";
      document.querySelector(".mine").classList.toggle("hidden", hide);
    };
  }

  $("files").addEventListener("change", (e) => {
    cookies = [...e.target.files].filter((f) => f.type.startsWith("image/"))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((f) => ({
        name: f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
        src: URL.createObjectURL(f),
      }));
    Object.assign(state, { secret: null, off: [], pending: null }); start();
  });

  // Backgrounds
  const backgrounds = window.BACKGROUNDS || [];
  function applyBg() {
    const bg = backgrounds.find((b) => b.src === state.bg);
    if (!bg) state.bg = null;
    $("scene").style.backgroundImage = bg ? `url("${bg.src}")` : "";
    document.body.classList.toggle("has-bg", !!bg);
    $("bgList").querySelectorAll(".bgOpt").forEach((o) => o.setAttribute("aria-pressed", o.dataset.src === (state.bg || "")));
  }
  function bgOption(label, src, thumb) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "bgOpt"; b.dataset.src = src; b.title = label;
    b.innerHTML = `<span class="thumb"></span><span class="lbl"></span>`;
    if (thumb) { const img = new Image(); img.loading = "lazy"; img.alt = ""; img.src = thumb; b.firstChild.append(img); }
    b.querySelector(".lbl").textContent = label;
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

  start();
})();
