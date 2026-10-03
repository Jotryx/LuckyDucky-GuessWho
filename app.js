(() => {
  const $ = (id) => document.getElementById(id);
  let cookies = (window.COOKIES || []).slice();

  // Test mode: open the page with ?demo (or ?demo=120) to fill the board with copies of the
  // current cookie images. It keeps its own save, so the real game isn't touched.
  const demo = new URLSearchParams(location.search).get("demo");
  if (demo !== null && cookies.length) {
    const count = Math.min(Math.max(parseInt(demo, 10) || 80, 1), 500);
    cookies = Array.from({ length: count }, (_, i) => {
      const c = cookies[i % cookies.length];
      return { name: `Demo ${i + 1}`, src: c.src, rarity: c.rarity };
    });
  }
  const KEY = demo !== null ? "crk-guess-who-demo" : "crk-guess-who-v1";
  let state = { secret: null, off: [], pending: null, bg: null, hide: false, hideOut: false };
  try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  // question log: cookies ruled out this turn, and earlier turns ({ q, out: [names], back })
  if (!Array.isArray(state.turn)) state.turn = [];
  if (!Array.isArray(state.turns)) state.turns = [];
  const freshLog = { turn: [], turns: [] };
  const track = (t, c, extra) => window.track?.(t, c, extra);   // anonymous stats (stats.js); no-op when off

  // ---------- board codes: the same random board on every device ----------
  // A code like "7Q4M-40" is a seed plus a board size. The seed always shuffles the full cookie list
  // the same way, so two players who enter the same code get exactly the same cookies (no server needed).
  const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";   // no 0/O, 1/I/L mix-ups
  const allCookies = cookies.slice();

  // any size works: "7Q4M-25", "7Q4M-37", "7Q4M-ALL"
  function parseBoard(text) {
    const m = /^([A-Z2-9]{4})[-\s]*(\d{1,3}|ALL)$/.exec(String(text || "").toUpperCase().replace(/\s+/g, " ").trim());
    if (!m || ![...m[1]].every((ch) => CODE_CHARS.includes(ch))) return null;
    if (m[2] === "ALL") return `${m[1]}-ALL`;
    const n = parseInt(m[2], 10);
    return n >= 2 ? `${m[1]}-${n}` : null;
  }
  function newBoardCode(size) {
    const r = crypto.getRandomValues(new Uint32Array(4));
    return [...r].map((n) => CODE_CHARS[n % CODE_CHARS.length]).join("") + "-" + size;
  }
  function boardCookies(list, code) {
    if (!code) return list;
    const [seed, size] = code.split("-");
    if (size === "ALL") return list;
    let h = 2166136261;                                    // FNV-1a hash of the seed
    for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    const rand = () => {                                   // mulberry32: small, fast, repeatable
      h = (h + 0x6D2B79F5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const idx = list.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    return idx.slice(0, Math.min(+size, list.length)).sort((a, b) => a - b).map((i) => list[i]);   // keep the usual order
  }
  const applyBoard = () => { cookies = boardCookies(allCookies, state.board); };

  // a shared link (?board=7Q4M-40) opens straight onto that board
  {
    const params = new URLSearchParams(location.search), fromLink = parseBoard(params.get("board"));
    if (fromLink && fromLink !== state.board) Object.assign(state, { board: fromLink, secret: null, off: [], pending: null });
    if (params.has("board")) {
      params.delete("board");
      history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash);
    }
    if (state.board && !parseBoard(state.board)) state.board = null;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  }
  applyBoard();
  if (window.STATS_URL) document.getElementById("statsLink").hidden = false;   // the Stats link only shows once stats are set up
  const label = (c) => (/^\d+$/.test(c.name) ? "#" + c.name : c.name);
  const mode = () => (state.secret ? "board" : "pick");
  let guessing = false;   // "GUESS A COOKIE!" pressed, waiting for a tap on the board

  function card(c, i) {
    const b = document.createElement("button");
    b.className = "card"; b.type = "button"; b.role = "listitem";
    b.title = label(c); b.dataset.name = c.name;
    b.dataset.rarity = c.rarity || "";
    b.style.setProperty("--i", Math.min(i, 60));
    b.innerHTML = `<img alt="" loading="lazy" decoding="async"><span class="tag"></span>`;
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
      // the cards pop in once; after that the grid is "settled" so the entrance can never replay
      // (and a stalled entrance can't leave them invisible)
      grid.classList.remove("settled");
      const settle = 200 + Math.min(cookies.length, 60) * 14 + 400 + 100;
      setTimeout(() => grid.classList.add("settled"), settle);
    }
    buildRarities();
    document.body.dataset.mode = mode();
    $("tray").scrollTop = 0;
    updateCards(); updateSide();
    setTimeout(updateHints, 900);
  }

  function updateCards() {
    const off = new Set(state.off);
    const board = mode() === "board";
    $("grid").querySelectorAll(".card").forEach((b) => {
      const n = b.dataset.name;
      b.setAttribute("aria-pressed", board ? off.has(n) : n === state.pending);
      // "Hide ruled out": flipped cookies leave the board, after their flip animation has played
      const gone = board && state.hideOut && off.has(n);
      clearTimeout(b._goneTimer);
      if (!gone) b.classList.remove("gone");
      else if (!b.classList.contains("gone")) b._goneTimer = setTimeout(() => {
        // after the stamp, the card shrinks and spins away before it leaves the board
        run(b, [{ transform: "scale(.92)", opacity: 1 }, { transform: "scale(0) rotate(25deg)", opacity: 0 }],
          { duration: 320, easing: "cubic-bezier(.5,0,.8,.4)", fill: "forwards" });
        b._goneTimer = setTimeout(() => { b.classList.add("gone"); updateHints(); }, 330);
      }, 720);
    });
    $("hideOut").hidden = !board;
    $("hideOut").setAttribute("aria-pressed", state.hideOut);
    $("hideOut").textContent = state.hideOut ? "Show ruled out" : "Hide ruled out";
    filter();
  }

  // ---------- finding your way around a big board ----------

  function filter(typing = false) {
    const q = $("find").value.trim().toLowerCase();
    const rarity = $("rarity").value;
    const appeared = [], matches = [];
    $("grid").querySelectorAll(".card").forEach((b) => {
      const match = (!rarity || b.dataset.rarity === rarity)
        && (!q || b.title.toLowerCase().includes(q) || b.dataset.name.toLowerCase().includes(q));
      if (match && b.classList.contains("filtered")) appeared.push(b);
      b.classList.toggle("filtered", !match);
      if (match && !b.classList.contains("gone")) matches.push(b);
    });
    $("noMatch").hidden = !cookies.length || matches.length > 0;
    updateHints();
    if (typing) searchFx(q, appeared, matches, typing === "redeal");
  }

  // Typing in the search box: the box pulses, newly shown cookies pop in one after another,
  // a lone match hops with a sparkle, and no match at all makes the box shake.
  function searchFx(q, appeared, matches, redeal) {
    const box = $("find");
    if (q && !matches.length) {
      run(box, [{ translate: "0" }, { translate: "-8px" }, { translate: "7px" }, { translate: "-5px" }, { translate: "3px" }, { translate: "0" }],
        { duration: 380, easing: "ease-in-out" });
      return;
    }
    run(box, [{ scale: "1" }, { scale: "1.035" }, { scale: "1" }], { duration: 180, easing: "ease-out" });
    // Changing the rarity re-deals every cookie on screen together; typing only pops in the new ones.
    // Either way, only cookies you can actually see animate, in reading order.
    const tray = $("tray").getBoundingClientRect();
    const onScreen = (redeal ? matches : appeared).filter((b) => {
      const r = b.getBoundingClientRect();
      return r.bottom > tray.top && r.top < tray.bottom;
    });
    onScreen.forEach((b, i) => {
      b.getAnimations().forEach((an) => an.id === "dealIn" && an.cancel());   // restart cleanly if mid-deal
      const an = run(b, [
        { transform: "scale(.3) rotate(-8deg)", opacity: 0 },
        { transform: "scale(1.1) rotate(3deg)", opacity: 1, offset: 0.7 },
        { transform: "none", opacity: 1 },
      ], { duration: 340, delay: Math.min(i * 16, 640), easing: "ease-out", fill: "backwards" });
      an.id = "dealIn";
    });
    if (q && matches.length === 1) {
      const only = matches[0];
      setTimeout(() => {
        FX().hop?.(only); FX().burst?.(only, 8, 0.9);
        FX().emote?.(only, "fx/emoji-sparkle_loop.webp", { size: 34, dx: 0.35, dy: -0.45, hold: 600 });
      }, 120);
    }
  }
  // a search counts once, after the typing settles (the text itself is never sent)
  let searchTimer, searchCounted = false;
  $("find").addEventListener("input", () => {
    $("tray").scrollTop = 0; filter(true);
    clearTimeout(searchTimer);
    if (!$("find").value.trim()) { searchCounted = false; return; }
    searchTimer = setTimeout(() => { if (!searchCounted) { searchCounted = true; track("search"); } }, 1200);
  });

  // Rarity filter: options come from the cookies themselves, in board order, with a count each.
  function buildRarities() {
    const counts = new Map();
    cookies.forEach((c) => c.rarity && counts.set(c.rarity, (counts.get(c.rarity) || 0) + 1));
    const sel = $("rarity"), keep = sel.value;
    sel.replaceChildren(new Option(`All rarities (${cookies.length})`, ""));
    counts.forEach((n, r) => sel.add(new Option(`${r} (${n})`, r)));
    sel.value = counts.has(keep) ? keep : "";
    sel.hidden = counts.size < 2;
  }
  $("rarity").addEventListener("change", () => {
    $("tray").scrollTop = 0; filter("redeal");
    if ($("rarity").value) track("rarity", $("rarity").value);
  });
  $("find").addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); $("find").value = ""; filter(); } });
  $("hideOut").onclick = () => { state.hideOut = !state.hideOut; save(); updateCards(); };

  // The tray's scrollbar is hidden, so show little "more" pills when there's more to see.
  function updateHints() {
    const t = $("tray");
    const below = t.scrollHeight - t.clientHeight - t.scrollTop;
    $("moreDown").hidden = below < 12;
    $("moreUp").hidden = t.scrollTop < 40;
  }
  $("tray").addEventListener("scroll", updateHints, { passive: true });
  addEventListener("resize", updateHints);
  $("moreDown").onclick = () => $("tray").scrollBy({ top: $("tray").clientHeight * 0.8, behavior: "smooth" });
  $("moreUp").onclick = () => $("tray").scrollTo({ top: 0, behavior: "smooth" });

  function updateSide() {
    const pick = mode() === "pick";
    const c = cookies.find((x) => x.name === (pick ? state.pending : state.secret));
    $("choiceImg").hidden = !c; $("choiceEmpty").hidden = !!c;
    if (c && $("choiceImg").getAttribute("src") !== c.src) $("choiceImg").src = c.src;   // only when the cookie really changes
    $("choiceName").textContent = c ? label(c) : "";
    const hidden = !pick && state.hide;
    $("portrait").classList.toggle("hidden", hidden);
    $("choiceName").classList.toggle("hidden", hidden);
    $("peek").setAttribute("aria-pressed", hidden);
    $("peek").textContent = hidden ? "Show my cookie" : "Hide my cookie";
    const now = state.turn.filter((n) => state.off.includes(n)).length;
    $("endTurn").textContent = now ? `End turn · ${now}` : state.turns.length ? `Questions (${state.turns.length})` : "End turn";
    $("endTurn").classList.toggle("ready", now > 0);
    $("pickCtl").hidden = !cookies.length || !pick;
    $("boardCtl").hidden = !cookies.length || pick;
    $("lock").disabled = !state.pending;
    $("guess").setAttribute("aria-pressed", guessing);
    $("guess").textContent = guessing ? "Cancel guess" : "GUESS A COOKIE!";
    document.body.dataset.guessing = guessing;
    $("hint").textContent = !cookies.length ? ""
      : guessing ? "Tap the cookie you think it is!"
      : pick ? (c ? "Lock it in when you're ready. Keep it secret!" : "Pick the cookie your opponent has to guess.")
      : `${cookies.length - state.off.length} of ${cookies.length} cookies still in`;
  }

  function onCard(c, b) {
    if (guessing) {
      if (!state.off.includes(c.name)) startGuess(c, b);
      return;
    }
    if (mode() === "pick") state.pending = c.name;
    else {
      const off = new Set(state.off);
      if (off.has(c.name)) { off.delete(c.name); track("bring_back", c.name); state.turn = state.turn.filter((n) => n !== c.name); }
      else { off.add(c.name); track("rule_out", c.name); if (!state.turn.includes(c.name)) state.turn.push(c.name); }
      state.off = [...off];
    }
    save(); updateCards(); updateSide();
  }

  $("lock").onclick = () => {
    track("start", state.pending);
    Object.assign(state, { secret: state.pending, off: [], pending: null, started: Date.now() }, freshLog); save(); render();
  };
  $("reset").onclick = () => {
    if (state.off.length) track("reset");
    state.off = []; state.turn = []; state.turns.forEach((t) => (t.back = true));   // everything is back on the board
    save(); updateCards(); updateSide();
  };
  $("again").onclick = () => { track("new_cookie"); guessing = false; Object.assign(state, { secret: null, off: [], pending: null }, freshLog); save(); render(); };
  $("guess").onclick = () => { guessing = !guessing; updateSide(); };
  $("peek").onclick = () => { state.hide = !state.hide; if (state.hide) track("peek"); save(); updateSide(); };

  // ---------- the big guess ----------

  const FX = () => window.FX || {};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // wait until something that was just un-hidden has actually been drawn
  // (with a timeout, since frames aren't drawn at all in a background tab)
  const nextFrame = () => Promise.race([
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    wait(60),
  ]);
  // play an animation, and cancel it once its time is up so the element always lands in its real place
  function run(el, frames, opts) {
    const a = el.animate(frames, opts);
    setTimeout(() => a.cancel(), (opts.delay || 0) + opts.duration + 30);
    return a;
  }
  let guessed = null;   // { c, b } while the stage is open

  async function startGuess(c, b) {
    guessing = false; updateSide();
    guessed = { c, b };
    const stage = $("stage"), card = $("stageCard");
    $("stageImg").src = c.src;
    $("stageName").textContent = label(c);
    $("stageAsk").hidden = true; $("stageWin").hidden = true;
    stage.classList.remove("win", "wrong", "leaving");
    document.body.classList.add("staging");
    stage.hidden = false;
    await nextFrame();
    run(stage, [{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: "ease-out" });

    // fly the card from its spot on the board to the middle of the screen
    const from = b.getBoundingClientRect(), to = card.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const k = from.width / to.width;
    run(card, [
      { transform: `translate(${dx}px,${dy}px) scale(${k})`, opacity: 0.6 },
      { transform: "translate(0,-30px) scale(1.12) rotate(-5deg)", opacity: 1, offset: 0.65 },
      { transform: "none", opacity: 1 },
    ], { duration: 750, easing: "cubic-bezier(.3,1.2,.4,1)" });
    await wait(750);

    // drumroll... then BOOM
    card.classList.add("drumroll");
    await wait(950);
    card.classList.remove("drumroll");
    FX().burst?.(card, 26, 1.9);
    FX().puff?.(card, true);
    FX().emote?.(card, "fx/exclamation_emoji.webp", { size: 80, dx: 0.55, dy: -0.5 });
    run(card, [{ scale: "1" }, { scale: "1.18" }, { scale: "0.96" }, { scale: "1" }], { duration: 500, easing: "ease-out" });
    $("stageAsk").hidden = false;
    popIn($("stageAsk"));
    $("guessYes").focus();
  }

  function popIn(el) {
    run(el, [
      { transform: "translateY(30px) scale(.6)", opacity: 0 },
      { transform: "translateY(-6px) scale(1.05)", opacity: 1, offset: 0.7 },
      { transform: "none", opacity: 1 },
    ], { duration: 500, easing: "ease-out" });
  }

  async function closeStage() {
    const stage = $("stage");
    stage.classList.add("leaving");
    await wait(380);
    stage.hidden = true;
    stage.classList.remove("leaving", "win", "wrong");
    document.body.classList.remove("staging");
    guessed = null;
  }

  $("guessNo").onclick = async () => {
    if (!guessed) return;
    const { c } = guessed, card = $("stageCard");
    track("guess_wrong", c.name);
    $("stageAsk").hidden = true;
    $("stage").classList.add("wrong");
    FX().emote?.(card, "fx/surprised_emoji.webp", { size: 80, dx: -0.55, dy: -0.45 });
    run(card, [
      { transform: "none" }, { transform: "translateX(-26px) rotate(-6deg)" }, { transform: "translateX(22px) rotate(5deg)" },
      { transform: "translateX(-14px) rotate(-3deg)" }, { transform: "translateX(8px)" }, { transform: "none" },
    ], { duration: 650, easing: "ease-in-out" });
    await wait(650);

    // fly back to the board and flip it down: it isn't their cookie
    const b = $("grid").querySelector(`.card[data-name="${CSS.escape(c.name)}"]`);
    if (b) {
      const from = card.getBoundingClientRect(), to = b.getBoundingClientRect();
      card.animate([
        { transform: "none", opacity: 1 },
        { transform: `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px,${to.top + to.height / 2 - (from.top + from.height / 2)}px) scale(${to.width / from.width})`, opacity: 0.4 },
      ], { duration: 550, easing: "cubic-bezier(.5,0,.6,1)", fill: "forwards" });
    }
    await closeStage();
    $("stageCard").getAnimations().forEach((a) => a.cancel());
    if (!state.off.includes(c.name)) state.off = [...state.off, c.name];
    if (!state.turn.includes(c.name)) state.turn.push(c.name);
    save(); updateCards(); updateSide();
    if (b) { FX().puff?.(b); b.animate([{ scale: "1.15" }, { scale: "1" }], { duration: 350, easing: "ease-out" }); }
  };

  $("guessYes").onclick = async () => {
    if (!guessed) return;
    const card = $("stageCard");
    track("guess_right", guessed.c.name, { ms: state.started ? Date.now() - state.started : undefined, out: state.off.length, q: state.turns.length });
    $("stageAsk").hidden = true;
    $("stage").classList.add("win");
    const title = $("winTitle"), text = "Congratulations, you win!";
    title.setAttribute("aria-label", text);
    title.innerHTML = [...text].length && text.split(" ").map((word, w, words) => {
      const start = words.slice(0, w).join(" ").length + (w ? 1 : 0);
      return `<span class="word">${[...word].map((ch, i) => `<span style="--n:${start + i}">${ch}</span>`).join("")}</span>`;
    }).join(" ");
    title.classList.remove("done");
    setTimeout(() => title.classList.add("done"), 1800);
    $("stageWin").hidden = false;
    popIn($("stageWin"));
    $("playAgain").focus();
    FX().rain?.(70);
    FX().burst?.(card, 30, 2.2);
    for (let i = 0; i < 5; i++) {
      await wait(650);
      if (!$("stage").classList.contains("win")) return;
      FX().burst?.(card, 14, 1.6);
      FX().emote?.(card, i % 2 ? "fx/happy_emoji.webp" : "fx/emoji-sparkle_loop.webp",
        { size: 64, dx: i % 2 ? 0.6 : -0.6, dy: -0.4 + i * 0.15 });
    }
  };

  $("playAgain").onclick = async () => {
    track("play_again");
    await closeStage();
    guessing = false;
    Object.assign(state, { secret: null, off: [], pending: null }, freshLog); save(); render();
  };
  $("winBack").onclick = () => closeStage();

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (guessed && !$("stageAsk").hidden) closeStage();      // changed their mind
    else if (guessed && !$("stageWin").hidden) closeStage();
    else if (guessing) { guessing = false; updateSide(); }
  });

  $("files").addEventListener("change", (e) => {
    cookies = [...e.target.files].filter((f) => f.type.startsWith("image/"))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((f) => ({
        name: f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
        src: URL.createObjectURL(f),
      }));
    allCookies.splice(0, allCookies.length, ...cookies);
    Object.assign(state, { secret: null, off: [], pending: null, board: null }); applyBoard(); render(); updateBoardUi();
  });

  // Backgrounds
  const backgrounds = window.BACKGROUNDS || [];
  // The two default backgrounds are crisp SVG tiles (sharp at any size); cutscenes are photos.
  const TILE = 340;   // on-screen size of one pattern tile, in px
  const DEFAULTS = [
    { name: "Default blue", src: "backgrounds/default-blue.svg", shade: "rgba(12, 8, 45, 0.22)", tint: "rgba(14, 8, 40, 0.4)" },
    { name: "Default red", src: "backgrounds/default-red.svg", shade: "rgba(50, 0, 5, 0.12)", tint: "rgba(45, 4, 8, 0.38)" },
  ];
  function applyBg() {
    const bg = DEFAULTS.find((b) => b.src === state.bg) || backgrounds.find((b) => b.src === state.bg) || DEFAULTS[0];
    if (bg === DEFAULTS[0]) state.bg = null;          // null = the standard blue
    const tile = DEFAULTS.includes(bg), scene = $("scene").style, root = document.documentElement.style;
    if (tile) {
      // a soft darkening towards the bottom right, over the repeating pattern
      scene.backgroundImage = `linear-gradient(160deg, transparent 35%, ${bg.shade}), url("${bg.src}")`;
      scene.backgroundSize = `100% 100%, ${TILE}px ${TILE}px`;
      scene.backgroundRepeat = "no-repeat, repeat";
      scene.backgroundPosition = "0 0, 0 0";
    } else {
      scene.backgroundImage = `url("${bg.src}")`;
      scene.backgroundSize = "cover"; scene.backgroundRepeat = "no-repeat"; scene.backgroundPosition = "center";
    }
    // the tray shows the same background, darker
    root.setProperty("--scene", `url("${bg.src}")`);
    root.setProperty("--scene-size", tile ? `${TILE}px ${TILE}px` : "cover");
    root.setProperty("--scene-repeat", tile ? "repeat" : "no-repeat");
    root.setProperty("--scene-pos", tile ? "0 0" : "center");
    root.setProperty("--tray-tint", tile ? bg.tint : "rgba(14, 8, 40, 0.4)");
    document.body.classList.toggle("has-bg", !tile);   // photos get a light overlay
    $("bgList").querySelectorAll(".bgOpt").forEach((o) => o.setAttribute("aria-pressed", o.dataset.src === bg.src));
  }
  function bgOption(name, src, tiled) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "bgOpt"; b.dataset.src = src;
    b.setAttribute("aria-label", name);   // no visible name, just the picture
    b.innerHTML = `<span class="thumb"></span>`;
    if (tiled) b.firstChild.style.background = `url("${src}") 0 0 / 80px 80px repeat`;
    else { const img = new Image(); img.loading = "lazy"; img.alt = ""; img.src = src; b.firstChild.append(img); }
    b.addEventListener("click", () => {
      if ((state.bg || DEFAULTS[0].src) !== src) track("background", name);
      state.bg = src === DEFAULTS[0].src ? null : src; save(); applyBg();
    });
    return b;
  }
  function buildBgList() {
    const list = $("bgList");
    const groups = new Map([["", DEFAULTS.map((d) => bgOption(d.name, d.src, true))]]);
    backgrounds.forEach((bg) => {
      if (!groups.has(bg.group)) groups.set(bg.group, []);
      groups.get(bg.group).push(bgOption(bg.name, bg.src, false));
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

  // ---------- the Board window ----------
  const boardLink = (code) => location.origin + location.pathname + "?board=" + code;
  function updateBoardUi() {
    const code = state.board && !state.board.endsWith("-ALL") ? state.board : null;
    $("boardTag").hidden = !code;   // small "Board 7Q4M-40" tag under the cookie name
    $("boardTag").textContent = code ? `Board ${code}` : "";
    $("boardCode").textContent = code || "All cookies";
    $("boardCount").textContent = `${cookies.length} cookie${cookies.length === 1 ? "" : "s"}`;
    $("copyCode").hidden = $("copyLink").hidden = !code;
    $("allBoard").hidden = !code;
    $("sizeAll").textContent = `All ${allCookies.length}`;
    $("boardWarn").hidden = !(state.secret || state.off.length);
  }
  function setBoard(code) {
    if ((code || null) === (state.board || null)) return;
    guessing = false;
    Object.assign(state, { board: code, secret: null, off: [], pending: null }, freshLog);
    save(); applyBoard(); render(); updateBoardUi();
    window.FX?.boing?.($("boardCode"), 0.6);
  }
  function copy(text, button) {
    const done = () => { const t = button.textContent; button.textContent = "Copied!"; setTimeout(() => (button.textContent = t), 1500); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => prompt("Copy this:", text));
    else prompt("Copy this:", text);
  }

  const openBoard = () => {
    // preselect the current board's size (anything other than 25/50/75/All is "Custom")
    const size = (state.board || "").split("-")[1] || "50";
    const preset = ["25", "50", "75", "ALL"].includes(size);
    document.querySelector(`input[name="boardSize"][value="${preset ? size : "CUSTOM"}"]`).checked = true;
    if (!preset) $("customSize").value = size;
    showCustom();
    $("joinMsg").textContent = ""; $("joinCode").value = "";
    updateBoardUi(); $("boardDialog").showModal();
  };
  $("boardBtn").onclick = openBoard;
  $("boardTag").onclick = openBoard;
  // the number field only shows when "Custom" is picked
  function showCustom() {
    const custom = document.querySelector('input[name="boardSize"]:checked')?.value === "CUSTOM";
    $("customRow").hidden = !custom;
    $("customSize").max = allCookies.length;
  }
  document.querySelectorAll('input[name="boardSize"]').forEach((r) => r.addEventListener("change", () => {
    showCustom();
    if (!$("customRow").hidden) $("customSize").select();
  }));
  $("customSize").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("makeBoard").click(); } });
  $("boardClose").onclick = () => $("boardDialog").close();
  $("boardDialog").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  $("makeBoard").onclick = () => {
    let size = document.querySelector('input[name="boardSize"]:checked')?.value || "50";
    if (size === "CUSTOM") {
      const n = Math.round(Number($("customSize").value));
      if (!Number.isFinite(n) || n < 2) {
        $("customSize").animate([{ translate: "0" }, { translate: "-6px" }, { translate: "5px" }, { translate: "0" }], { duration: 300 });
        $("customSize").focus();
        return;
      }
      size = n >= allCookies.length ? "ALL" : String(n);
    } else if (size !== "ALL" && +size >= allCookies.length) size = "ALL";
    setBoard(size === "ALL" ? null : newBoardCode(size));
  };
  $("allBoard").onclick = () => setBoard(null);
  $("joinForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const code = parseBoard($("joinCode").value);
    if (!code) {
      $("joinMsg").textContent = "That doesn't look like a board code. It should look like 7Q4M-40.";
      $("joinCode").animate([{ translate: "0" }, { translate: "-8px" }, { translate: "7px" }, { translate: "-4px" }, { translate: "0" }], { duration: 360 });
      return;
    }
    setBoard(code.endsWith("-ALL") ? null : code);
    $("joinMsg").textContent = `Joined board ${code}!`;
  });
  $("copyCode").onclick = (e) => copy(state.board, e.currentTarget);
  $("copyLink").onclick = (e) => copy(boardLink(state.board), e.currentTarget);

  // ---------- question log: End turn, earlier questions, bring back ----------
  const picOf = (name) => allCookies.find((c) => c.name === name)?.src;
  function pics(names, max = 12, title = "Cookies") {
    const wrap = document.createDocumentFragment();
    names.slice(0, max).forEach((n) => {
      const src = picOf(n);
      if (!src) return;
      const img = new Image(); img.src = src; img.alt = ""; img.title = n; img.loading = "lazy";
      wrap.append(img);
    });
    if (names.length > max) {
      const more = document.createElement("button");
      more.type = "button"; more.className = "turnMore";
      more.textContent = `+${names.length - max} · View all`;
      more.setAttribute("aria-label", `View all ${names.length} cookies`);
      more.onclick = () => showAllPics(names, title);
      wrap.append(more);
    }
    return wrap;
  }

  // The "+7 · View all" pill opens every cookie of that list, bigger and with names.
  function showAllPics(names, title) {
    $("allPicsTitle").textContent = title;
    $("allPicsText").textContent = `${names.length} cookie${names.length > 1 ? "s" : ""}`;
    $("allPicsGrid").replaceChildren(...names.filter(picOf).map((n) => {
      const fig = document.createElement("figure");
      const img = new Image(); img.src = picOf(n); img.alt = ""; img.loading = "lazy";
      const cap = document.createElement("figcaption"); cap.textContent = n;
      fig.append(img, cap);
      return fig;
    }));
    $("allPicsDialog").showModal();
    $("allPicsGrid").parentElement.scrollTop = 0;
  }
  $("allPicsClose").onclick = () => $("allPicsDialog").close();
  $("allPicsDialog").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  function renderTurns() {
    const now = state.turn.filter((n) => state.off.includes(n));
    $("turnNowText").textContent = now.length
      ? `You ruled out ${now.length} cookie${now.length > 1 ? "s" : ""} this turn.`
      : "You haven't ruled out any cookies since your last question.";
    $("turnNowPics").replaceChildren(pics(now, 12, "Ruled out this turn"));
    $("turnForm").hidden = !now.length;

    const log = $("turnLog");
    log.replaceChildren();
    $("turnEmpty").hidden = state.turns.length > 0;
    state.turns.forEach((t, i) => {
      const li = document.createElement("li");
      li.className = "turnItem" + (t.back ? " isBack" : "");
      li.innerHTML = `<div class="turnHead"><span class="turnNum"></span><span class="turnQText"></span></div><div class="turnPics"></div>` +
        `<div class="turnActions"><button class="ghost bringBack" type="button"></button><button class="ghost removeQ" type="button">Remove</button></div>`;
      li.querySelector(".turnNum").textContent = `Q${state.turns.length - i}`;
      li.querySelector(".turnQText").textContent = t.q || "(no question written)";
      li.querySelector(".turnPics").append(pics(t.out, 10, `Q${state.turns.length - i}: ruled out`));
      const still = t.out.filter((n) => state.off.includes(n));
      const btn = li.querySelector(".bringBack");
      btn.textContent = still.length ? `Bring back ${still.length}` : "All back on the board";
      btn.disabled = !still.length;
      btn.onclick = () => bringBack(i);
      li.querySelector(".removeQ").onclick = () => removeQuestion(i, li);
      log.append(li);
    });
  }

  function endTurn(e) {
    e?.preventDefault();
    const now = state.turn.filter((n) => state.off.includes(n));
    if (!now.length) return;
    state.turns.unshift({ q: $("turnQ").value.trim().slice(0, 120), out: now, back: false });
    state.turn = [];
    $("turnQ").value = "";
    save(); renderTurns(); updateSide();
    track("end_turn");
    window.FX?.boing?.($("turnLog").firstElementChild, 0.4);
  }

  // removes a question from the log only; its cookies stay as they are on the board
  function removeQuestion(i, li) {
    if (!state.turns[i]) return;
    const done = () => { state.turns.splice(i, 1); save(); renderTurns(); updateSide(); };
    li.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(40px) scale(.95)" }], { duration: 220, easing: "ease-in" });
    setTimeout(done, 210);
  }

  function bringBack(i) {
    const t = state.turns[i];
    if (!t) return;
    const back = new Set(t.out);
    state.off = state.off.filter((n) => !back.has(n));
    state.turn = state.turn.filter((n) => !back.has(n));
    t.back = true;
    t.out.forEach((n) => track("bring_back", n));
    track("question_back");
    save(); updateCards(); updateSide(); renderTurns();
    // the cookies that came back give a little hop
    t.out.forEach((n, k) => {
      const card = $("grid").querySelector(`.card[data-name="${CSS.escape(n)}"]`);
      if (card) setTimeout(() => window.FX?.hop?.(card), k * 40);
    });
  }

  $("endTurn").onclick = () => {
    renderTurns();
    $("turnDialog").showModal();
    if (!$("turnForm").hidden) $("turnQ").focus();
  };
  $("turnForm").addEventListener("submit", endTurn);
  $("turnClose").onclick = () => $("turnDialog").close();
  $("turnDialog").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  render();
  updateBoardUi();
})();
