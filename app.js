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
  $("find").addEventListener("input", () => { $("tray").scrollTop = 0; filter(true); });

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
  $("rarity").addEventListener("change", () => { $("tray").scrollTop = 0; filter("redeal"); });
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
      off.has(c.name) ? off.delete(c.name) : off.add(c.name);
      state.off = [...off];
    }
    save(); updateCards(); updateSide();
  }

  $("lock").onclick = () => { Object.assign(state, { secret: state.pending, off: [], pending: null }); save(); render(); };
  $("reset").onclick = () => { state.off = []; save(); updateCards(); updateSide(); };
  $("again").onclick = () => { guessing = false; Object.assign(state, { secret: null, off: [], pending: null }); save(); render(); };
  $("guess").onclick = () => { guessing = !guessing; updateSide(); };
  $("peek").onclick = () => { state.hide = !state.hide; save(); updateSide(); };

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
    save(); updateCards(); updateSide();
    if (b) { FX().puff?.(b); b.animate([{ scale: "1.15" }, { scale: "1" }], { duration: 350, easing: "ease-out" }); }
  };

  $("guessYes").onclick = async () => {
    if (!guessed) return;
    const card = $("stageCard");
    $("stageAsk").hidden = true;
    $("stage").classList.add("win");
    const title = $("winTitle"), text = "Congratulations, you win!";
    title.setAttribute("aria-label", text);
    title.innerHTML = [...text].map((ch, i) => `<span style="--n:${i}">${ch === " " ? "&nbsp;" : ch}</span>`).join("");
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
    await closeStage();
    guessing = false;
    Object.assign(state, { secret: null, off: [], pending: null }); save(); render();
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
