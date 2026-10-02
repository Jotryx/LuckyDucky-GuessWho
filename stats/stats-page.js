// Fetches the totals from the stats Worker and lays them out in the game's style.
(() => {
  const $ = (id) => document.getElementById(id);
  const url = (window.STATS_URL || "").replace(/\/+$/, "");
  const nf = new Intl.NumberFormat("en");

  // pictures for the top lists: cookies from cookies.js, backgrounds from backgrounds.js
  const cookiePic = new Map((window.COOKIES || []).map((c) => [c.name, "../" + c.src]));
  const bgPic = new Map((window.BACKGROUNDS || []).map((b) => [b.name, "../" + b.src]));
  bgPic.set("Default blue", "../backgrounds/default-blue.svg");
  bgPic.set("Default red", "../backgrounds/default-red.svg");

  const time = (ms) => {
    if (!ms) return "–";
    const s = Math.round(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  };

  // numbers count up when they appear
  function countUp(el, to, format = (n) => nf.format(Math.round(n))) {
    if (typeof to !== "number") { el.textContent = to; return; }
    const start = performance.now(), dur = 900;
    el.textContent = format(to);   // the final value, in case animation frames never run
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      el.textContent = format(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(() => (el.textContent = format(to)), dur + 100);   // always end on the real number
  }

  function tile(value, what, i, tone = "") {
    const d = document.createElement("div");
    d.className = `tile ${tone}`;
    d.style.setProperty("--i", i);
    d.innerHTML = `<span class="num"></span><span class="what"></span>`;
    d.querySelector(".what").textContent = what;
    countUp(d.querySelector(".num"), value);
    return d;
  }

  function fact(value, what) {
    const d = document.createElement("div");
    d.className = "fact";
    d.innerHTML = `<span class="num"></span><span class="what"></span>`;
    d.querySelector(".what").textContent = what;
    d.querySelector(".num").textContent = value;
    return d;
  }

  function list(title, rows, pics, wide = false) {
    const d = document.createElement("div");
    d.className = "list";
    const h = document.createElement("h3"); h.textContent = title; d.append(h);
    if (!rows || !rows.length) {
      const p = document.createElement("p"); p.className = "none"; p.textContent = "Nothing yet!"; d.append(p);
      return d;
    }
    const ol = document.createElement("ol");
    rows.slice(0, 5).forEach(([name, n], i) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="rank">${i + 1}</span><span class="pic blank"></span><span class="name"></span><span class="count"></span>`;
      const src = pics && pics.get(name);
      if (src) {
        const img = new Image(); img.className = "pic" + (wide ? " wide" : ""); img.alt = ""; img.loading = "lazy"; img.src = src;
        li.querySelector(".pic").replaceWith(img);
      }
      li.querySelector(".name").textContent = name;
      li.querySelector(".count").textContent = `×${nf.format(n)}`;
      ol.append(li);
    });
    d.append(ol);
    return d;
  }

  function render(s) {
    const t = s.totals || {}, p = s.players || {}, top = s.top || {};
    const right = t.guess_right || 0, wrong = t.guess_wrong || 0;

    const tiles = $("tiles");
    [
      [t.visits || 0, "visits"],
      [p.total || 0, "different players", "mint"],
      [p.today || 0, "players today", "mint"],
      [p.week || 0, "players this week", "mint"],
      [t.games || 0, "games started"],
      [right, "cookies guessed right", "pink"],
      [wrong, "wrong guesses", "pink"],
      [t.rule_out || 0, "cookies ruled out"],
      [t.bring_back || 0, "cookies brought back"],
    ].forEach(([v, what, tone], i) => tiles.append(tile(v, what, i, tone)));

    const facts = $("facts");
    const rate = right + wrong ? `${Math.round((100 * right) / (right + wrong))}%` : "–";
    [
      [rate, "of guesses are right on the first try… or the fifth"],
      [time(t.fastest_win_ms), "fastest win ever"],
      [time(t.wins_timed ? t.win_ms_total / t.wins_timed : 0), "average time to win a game"],
      [t.wins_timed ? nf.format(Math.round(t.win_outs_total / t.wins_timed)) : "–", "cookies ruled out per win, on average"],
      [nf.format(t.reset || 0), "times someone flipped every cookie back up"],
      [nf.format(t.new_cookie || 0), "times someone gave up and picked a new cookie"],
      [nf.format(t.peek || 0), "times a cookie was hidden from peeking eyes"],
      [nf.format(t.bring_back || 0), "second thoughts (cookies flipped back up)"],
      [nf.format(t.search || 0), "searches for a cookie"],
      [nf.format(t.background || 0), "background changes"],
      [nf.format(t.play_again || 0), "“play again!” after a win"],
      [nf.format(p.returning || 0), "players who came back another day"],
    ].forEach(([v, what]) => facts.append(fact(v, what)));

    const lists = $("lists");
    lists.append(
      list("Most picked secret cookie", top.picked, cookiePic),
      list("Most ruled out", top.ruledOut, cookiePic),
      list("Hardest to guess (most wrong guesses)", top.wrong, cookiePic),
      list("Most guessed correctly", top.guessed, cookiePic),
      list("Most often brought back", top.broughtBack, cookiePic),
      list("Favourite backgrounds", top.backgrounds, bgPic, true),
      list("Favourite rarity filter", top.rarities, null),
    );

    $("updated").textContent = `Updated ${new Date(s.updated || Date.now()).toLocaleString()}`;
    $("statsMsg").hidden = true;
    $("statsBody").hidden = false;
  }

  if (!url) {
    $("statsMsg").textContent = "Stats aren't switched on yet. Fill in stats-config.js after setting up the Worker (see worker/README.md).";
    return;
  }
  fetch(url + "/stats")
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(render)
    .catch(() => { $("statsMsg").textContent = "Couldn't reach the stats right now. Try again in a bit!"; });
})();
