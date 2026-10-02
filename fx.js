// Little bits of life: floating toppings, emoji pops, bursts and idle fidgets.
// Purely decorative — app.js works the same without this file.
(() => {
  const $ = (id) => document.getElementById(id);
  // Full effects for everyone, whatever the system's "reduce motion" setting says.
  // Set this to matchMedia("(prefers-reduced-motion: reduce)").matches to respect it again.
  const calm = false;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const FX = "fx/";
  const TOPPINGS = ["almond", "applejelly", "candy", "caramel", "chocolate", "hazelnut", "kiwi", "peanut", "raspberry", "walnut"]
    .map((t) => `${FX}topping_${t}_3.webp`);
  const EMOJI = {
    question: FX + "question_emoji.webp",
    exclaim: FX + "exclamation_emoji.webp",
    notes: FX + "happy_emoji.webp",
    surprised: FX + "surprised_emoji.webp",
    puff: FX + "pop_1_emoji.webp",
    cloud: FX + "pop_2_emoji.webp",
    sparkle: FX + "emoji-sparkle_loop.webp",
  };

  // A layer above everything for particles, so they can fly over the folder.
  const layer = document.createElement("div");
  layer.className = "fxLayer";
  layer.setAttribute("aria-hidden", "true");
  document.body.append(layer);

  const centre = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  };

  function sprite(src, x, y, size) {
    const img = new Image();
    img.src = src; img.alt = ""; img.className = "fxSprite";
    img.style.cssText = `left:${x}px;top:${y}px;width:${size}px`;
    layer.append(img);
    return img;
  }

  // Animate a particle and always clean it up afterwards, even if the animation never reports finishing.
  function play(el, frames, opts) {
    // hold the last (faded-out) frame until removal, so it can't flash back at full opacity
    el.animate(frames, { ...opts, fill: "forwards" });
    setTimeout(() => el.remove(), opts.duration + 60);
  }

  // Toppings fly out of an element and tumble down with a bit of gravity.
  function burst(el, count = 8, power = 1) {
    if (calm || !el) return;
    const c = centre(el);
    for (let i = 0; i < count; i++) {
      const size = rand(22, 38) * Math.min(1.4, power);
      const s = sprite(pick(TOPPINGS), c.x - size / 2, c.y - size / 2, size);
      const angle = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const dist = rand(70, 150) * power;
      const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist;
      const spin = rand(-260, 260);
      play(s, [
        { transform: "translate(0,0) scale(.3) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx * 0.7}px,${dy}px) scale(1) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px,${dy + 140 * power}px) scale(.8) rotate(${spin}deg)`, opacity: 0 },
      ], { duration: rand(800, 1150), easing: "cubic-bezier(.2,.7,.4,1)" });
    }
  }

  // A soft dust puff, like the game's pop clouds.
  function puff(el, big = false) {
    if (calm || !el) return;
    const c = centre(el);
    const size = Math.max(c.w, c.h) * (big ? 1.5 : 1.1);
    const s = sprite(big ? EMOJI.cloud : EMOJI.puff, c.x - size / 2, c.y - size / 2, size);
    play(s, [
      { transform: "scale(.4)", opacity: 0.95 },
      { transform: "scale(1.05)", opacity: 0.85, offset: 0.4 },
      { transform: "scale(1.25)", opacity: 0 },
    ], { duration: 560, easing: "ease-out" });
  }

  // An emoji bounces in next to an element, hangs around, then floats off.
  function emote(el, src, { size = 54, dx = 0.42, dy = -0.55, hold = 900 } = {}) {
    if (!el) return;
    const c = centre(el);
    const s = sprite(src, c.x + c.w * dx - size / 2, c.y + c.h * dy - size / 2, size);
    play(s, [
      { transform: "translateY(14px) scale(0) rotate(-20deg)", opacity: 0 },
      { transform: "translateY(-6px) scale(1.2) rotate(8deg)", opacity: 1, offset: 0.12 },
      { transform: "translateY(0) scale(1) rotate(0deg)", opacity: 1, offset: 0.2 },
      { transform: "translateY(-4px) scale(1) rotate(-4deg)", opacity: 1, offset: 0.75 },
      { transform: "translateY(-28px) scale(.85) rotate(6deg)", opacity: 0 },
    ], { duration: hold + 900, easing: "ease-out" });
  }

  // Wiggle-bounce an element without fighting its own CSS transform (uses `scale` + extra transform).
  function boing(el, strength = 1) {
    if (!el) return;
    el.animate([
      { scale: "1", transform: "rotate(0)" },
      { scale: `${1 + 0.22 * strength}`, transform: "rotate(-6deg)", offset: 0.25 },
      { scale: `${1 - 0.08 * strength}`, transform: "rotate(5deg)", offset: 0.5 },
      { scale: `${1 + 0.05 * strength}`, transform: "rotate(-2deg)", offset: 0.75 },
      { scale: "1", transform: "rotate(0)" },
    ], { duration: 650, easing: "ease-out", composite: "add" });
  }

  function hop(el) {
    if (!el) return;
    const tilt = rand(-7, 7).toFixed(1);
    el.animate([
      { translate: "0 0", scale: "1 1", rotate: "0deg" },
      { translate: "0 0", scale: "1.1 .88", rotate: "0deg", offset: 0.15 },
      { translate: "0 -18px", scale: ".94 1.08", rotate: `${tilt}deg`, offset: 0.45 },
      { translate: "0 0", scale: "1.08 .92", rotate: "0deg", offset: 0.75 },
      { translate: "0 0", scale: "1 1", rotate: "0deg" },
    ], { duration: 600, easing: "ease-out" });
  }

  // Cookies you can actually see right now (not scrolled away, filtered out or ruled out).
  function visibleCards(includeOut = false) {
    const tray = document.querySelector(".tray");
    if (!tray) return [];
    const box = tray.getBoundingClientRect();
    return [...tray.querySelectorAll(".card:not(.filtered):not(.gone)")].filter((c) => {
      if (!includeOut && c.getAttribute("aria-pressed") === "true") return false;
      const r = c.getBoundingClientRect();
      return r.bottom > box.top + 4 && r.top < box.bottom - 4;
    });
  }

  // A red ✕ stamp slams onto a cookie that's been ruled out.
  function stamp(el) {
    if (!el) return;
    const c = centre(el), size = Math.min(c.w, c.h) * 0.82;
    const d = document.createElement("div");
    d.className = "fxStamp";
    d.textContent = "✕";
    d.style.cssText = `left:${c.x - size / 2}px;top:${c.y - size / 2}px;width:${size}px;height:${size}px;font-size:${size * 0.62}px`;
    layer.append(d);
    play(d, [
      { transform: "scale(2.6) rotate(-35deg)", opacity: 0 },
      { transform: "scale(.88) rotate(-12deg)", opacity: 1, offset: 0.22 },
      { transform: "scale(1.04) rotate(-12deg)", opacity: 1, offset: 0.32 },
      { transform: "scale(1) rotate(-12deg)", opacity: 1, offset: 0.75 },
      { transform: "scale(1.15) rotate(-12deg)", opacity: 0 },
    ], { duration: 950, easing: "ease-out" });
  }

  // Ruling a cookie out: it braces, gets stamped, shudders, and settles into its faded state.
  function ruleOut(card) {
    card.animate([
      { transform: "scale(1)" },
      { transform: "scale(1.1) rotate(-3deg)", offset: 0.14 },
      { transform: "scale(.84, .78) translateY(5px)", offset: 0.3 },
      { transform: "scale(.96) rotate(4deg)", offset: 0.44 },
      { transform: "scale(.93) rotate(-3deg)", offset: 0.58 },
      { transform: "scale(.92) rotate(1deg)", offset: 0.72 },
      { transform: "scale(.92)" },
    ], { duration: 650, easing: "ease-out" });
    setTimeout(() => stamp(card), 110);
    setTimeout(() => { puff(card); burst(card, 3, 0.5); }, 200);
  }

  function flip(el, down) {
    if (calm || !el) return;
    el.animate(down
      ? [{ transform: "perspective(600px) rotateX(0)" }, { transform: "perspective(600px) rotateX(-85deg) scale(.97)", offset: 0.5 }, { transform: "perspective(600px) rotateX(0) scale(.94)" }]
      : [{ transform: "perspective(600px) rotateX(0) scale(.94)" }, { transform: "perspective(600px) rotateX(85deg)", offset: 0.5 }, { transform: "perspective(600px) rotateX(0)" }],
      { duration: 420, easing: "cubic-bezier(.4,0,.3,1)" });
  }

  // ---------- reacting to the game ----------

  // Toppings raining down the whole screen, for a win.
  function rain(count = 60) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const size = rand(26, 54);
        const s = sprite(pick(TOPPINGS), rand(-20, innerWidth - 20), -size - 10, size);
        const drift = rand(-120, 120), spin = rand(-540, 540);
        play(s, [
          { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
          { transform: `translate(${drift}px,${innerHeight + size * 2}px) rotate(${spin}deg)`, opacity: 1 },
        ], { duration: rand(1800, 3200), easing: "cubic-bezier(.4,0,.8,.6)" });
      }, rand(0, 2200));
    }
  }

  document.addEventListener("click", (e) => {
    if (document.body.classList.contains("staging") || document.body.dataset.guessing === "true") return;
    const card = e.target.closest(".card");
    if (card) {
      // app.js has already updated aria-pressed by the time this bubbles up
      const on = card.getAttribute("aria-pressed") === "true";
      if (document.body.dataset.mode === "pick") {
        hop(card); burst(card, 6, 0.8);
      } else {
        if (on) ruleOut(card);
        else {
          // back in the game: flips up with a sparkle
          flip(card, false); puff(card); burst(card, 5, 0.7);
          emote(card, EMOJI.sparkle, { size: 30, dx: 0.3, dy: -0.4, hold: 450 });
        }
        // the portrait reacts to every flip too
        boing($("portrait"), 0.5);
        puff($("portrait"));
      }
      return;
    }
    const id = e.target.closest("button,a,h1")?.id || e.target.closest("button,a,h1")?.className || "";
    if (id === "lock") {
      // board just rendered; celebrate the locked-in cookie
      const p = $("portrait");
      burst(p, 18, 1.5); puff(p, true);
      emote(p, EMOJI.exclaim, { size: 64, dx: 0.5, dy: -0.45 });
      wave();
    } else if (id === "again") {
      puff($("portrait"), true);
      emote($("portrait"), EMOJI.question, { size: 62 });
    } else if (id === "reset") {
      visibleCards(true).forEach((c, i) => setTimeout(() => hop(c), Math.min(i * 18, 900)));
      emote($("portrait"), EMOJI.surprised, { size: 66, dx: -0.45 });
    } else if (id === "peek") {
      puff($("portrait"));
    } else if (String(id).includes("logo")) {
      boing(document.querySelector(".logo"), 0.6); burst(document.querySelector(".logo"), 10, 1.1);
    }
  });

  // The portrait pops whenever the shown cookie changes.
  // Only a real change counts: re-setting the same image must not pop it again.
  let shown = $("choiceImg").hidden ? "" : $("choiceImg").getAttribute("src");
  new MutationObserver(() => {
    const now = $("choiceImg").hidden ? "" : $("choiceImg").getAttribute("src");
    if (now === shown) return;
    shown = now;
    const p = $("portrait");
    boing(p, 0.5);
    if (now) puff(p);
  }).observe($("choiceImg"), { attributes: true, attributeFilter: ["src", "hidden"] });

  // The "N of M cookies still in" line gives a little bump when it changes.
  let lastHint = $("hint").textContent;
  new MutationObserver(() => {
    const t = $("hint").textContent;
    if (t !== lastHint && document.body.dataset.mode === "board") boing($("hint"), 0.5);
    lastHint = t;
  }).observe($("hint"), { childList: true, characterData: true, subtree: true });

  // ---------- "Cookie Choice" letters do the wave ----------

  const title = document.querySelector(".choiceTitle");
  if (title) {
    const text = title.textContent.trim();
    title.innerHTML = [...text].length && text.split(" ").map((word, w, words) => {
      const start = words.slice(0, w).join(" ").length + (w ? 1 : 0);
      return `<span class="word">${[...word].map((ch, i) => `<span style="--n:${start + i}">${ch}</span>`).join("")}</span>`;
    }).join(" ");
    title.setAttribute("aria-label", text);
  }
  function wave() {
    if (!title) return;
    title.classList.remove("wave"); void title.offsetWidth; title.classList.add("wave");
  }

  // ---------- ambient life ----------

  // Toppings drifting up behind the folder.
  const floaters = document.createElement("div");
  floaters.className = "floaters";
  floaters.setAttribute("aria-hidden", "true");
  document.body.prepend(floaters);
  {
    const n = (innerWidth < 700 ? 7 : 14) * (calm ? 0.5 : 1);
    for (let i = 0; i < n; i++) {
      const f = document.createElement("span");
      const depth = Math.random();                     // 0 = far away, 1 = close
      f.style.cssText = [
        `--x:${rand(0, 100)}vw`, `--size:${18 + depth * 34}px`, `--dur:${(rand(26, 44) - depth * 8) * (calm ? 1.6 : 1)}s`,
        `--delay:-${rand(0, 40)}s`, `--sway:${rand(14, 40)}px`, `--spin:${rand(-1, 1) > 0 ? 1 : -1}`,
        `--blur:${(1 - depth) * 1.6}px`, `--alpha:${0.35 + depth * 0.45}`,
      ].join(";");
      f.innerHTML = `<img src="${pick(TOPPINGS)}" alt="">`;
      floaters.append(f);
    }
  }

  // Timers that only tick while the tab is visible.
  function every(min, max, fn) {
    const loop = () => setTimeout(() => { if (!document.hidden) fn(); loop(); }, rand(min, max));
    loop();
  }

  {
    const yt = document.querySelector(".yt");
    // The YouTube badge pops up now and then, with notes and a sparkle.
    every(7000, 12000, () => {
      if (!yt) return;
      boing(yt, 1.1);
      emote(yt, EMOJI.notes, { size: 46, dx: 0.5, dy: -0.9, hold: 700 });
      setTimeout(() => emote(yt, EMOJI.sparkle, { size: 30, dx: -0.45, dy: -0.6, hold: 600 }), 180);
    });

    // Cookies on screen get restless and hop: more of them at once on a big board.
    every(1200, 2600, () => {
      if (document.body.classList.contains("staging")) return;
      const cards = visibleCards();
      if (!cards.length) return;
      const n = Math.min(2, Math.max(1, Math.round(cards.length / 40)));
      for (let i = 0; i < n; i++) {
        const c = cards.splice(Math.floor(Math.random() * cards.length), 1)[0];
        if (!c) break;
        setTimeout(() => {
          hop(c);
          if (Math.random() < 0.25) emote(c, EMOJI.sparkle, { size: 26, dx: 0.32, dy: -0.38, hold: 500 });
        }, i * rand(90, 220));
      }
    });

    // The logo shuffles, and occasionally wonders who it is.
    every(9000, 15000, () => {
      const logo = document.querySelector(".logo");
      boing(logo, 0.35);
      if (Math.random() < 0.5) emote(logo, EMOJI.question, { size: 48, dx: 0.42, dy: -0.35 });
    });

    every(6000, 9000, wave);

    // While nothing is picked, the empty portrait asks the question.
    every(4000, 6500, () => {
      if (!$("choiceImg").hidden) {
        emote($("portrait"), EMOJI.sparkle, { size: 34, dx: rand(-0.4, 0.4), dy: rand(-0.45, -0.25), hold: 500 });
        return;
      }
      emote($("portrait"), EMOJI.question, { size: 50, dx: 0.4, dy: -0.4 });
    });
  }

  window.FX = { burst, puff, emote, boing, hop, rain, stamp };
})();
