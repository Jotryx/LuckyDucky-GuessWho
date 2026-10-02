(() => {
  const KEY = "crk-guess-who-v1";
  const $ = (id) => document.getElementById(id);
  let cookies = (window.COOKIES || []).slice();
  let state = { secret: null, off: [] };
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
    if (!names.has(state.secret)) state = { secret: null, off: [] };
    state.secret ? renderBoard() : renderPick();
  }

  function renderPick() {
    show("pick");
    let chosen = null;
    const grid = $("pickGrid"); grid.replaceChildren();
    cookies.forEach((c, i) => grid.append(card(c, i, false, (b) => {
      grid.querySelectorAll(".card").forEach((x) => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true"); chosen = c.name; $("lock").disabled = false;
    })));
    $("lock").disabled = true;
    $("lock").onclick = () => { state = { secret: chosen, off: [] }; save(); renderBoard(); };
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
    $("again").onclick = () => { state = { secret: null, off: [] }; save(); renderPick(); };
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
    state = { secret: null, off: [] }; start();
  });

  start();
})();
