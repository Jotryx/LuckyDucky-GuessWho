// Anonymous stats for Cookie Run Guess Who.
//
//   POST /event   { id, events: [{ t: "rule_out", c: "Pure Vanilla Cookie" }, ...] }
//   GET  /stats   all totals, unique players and top lists, as JSON
//
// Privacy: nothing about the request (IP, browser, location) is stored. The player id is a random
// value made in the visitor's browser; it is hashed with a secret SALT before it touches the
// database, so even the stored ids can't be matched back to a device. Daily rows are deleted
// after 35 days. Only counts are kept, never what anyone typed.

const MAX_EVENTS = 40;          // per request
const MAX_PER_MINUTE = 120;     // per player: plenty for real play, stops floods of fake events
const KEEP_DAYS = 35;

// event type -> counter it adds to. "name" events also count per cookie / background / rarity.
const EVENTS = {
  visit:        { key: "visits" },
  start:        { key: "games", per: "pick" },          // locked in a secret cookie
  rule_out:     { key: "rule_out", per: "out" },        // flipped a cookie down
  bring_back:   { key: "bring_back", per: "back" },     // flipped one back up ("unclicked")
  guess_right:  { key: "guess_right", per: "right" },
  guess_wrong:  { key: "guess_wrong", per: "wrong" },
  reset:        { key: "reset" },                       // "Flip all back up"
  new_cookie:   { key: "new_cookie" },                  // gave up / started over
  peek:         { key: "peek" },                        // "Hide my cookie"
  search:       { key: "search" },                      // searched (the text itself is never sent)
  rarity:       { key: "rarity_filter", per: "rarity" },
  background:   { key: "background", per: "bg" },
  play_again:   { key: "play_again" },
};

// Only the game itself may send events (plus local testing); anyone may read the totals.
const ALLOWED_ORIGINS = ["https://jotryx.github.io"];
const isLocal = (o) => o === "null" || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
// browsers always send an Origin with these requests, so a missing one means it didn't come from the game
const allowedOrigin = (o) => !!o && (ALLOWED_ORIGINS.includes(o) || isLocal(o));

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (data, extra = {}) =>
  new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...cors, ...extra } });

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

// cookie, background and rarity names: short, plain text only
function cleanName(name) {
  if (typeof name !== "string") return null;
  const n = name.trim().slice(0, 60);
  return /^[\p{L}\p{N} '’().,!&-]+$/u.test(n) ? n : null;
}

async function hashId(id, salt) {
  const data = new TextEncoder().encode(`${salt}:${id}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function handleEvents(request, env) {
  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ ok: false }, {}); }
  const id = typeof body?.id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(body.id) ? body.id : null;
  const events = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS) : [];
  if (!id || !events.length) return json({ ok: false });

  const db = env.DB;
  const add = db.prepare("INSERT INTO counters (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = v + excluded.v");
  const least = db.prepare("INSERT INTO counters (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = MIN(v, excluded.v)");
  const statements = [];
  const h = await hashId(id, env.SALT || "set-a-SALT-secret");
  const day = today();

  // rate limit per (hashed) player per minute
  const minute = Math.floor(Date.now() / 60000);
  const used = await db.prepare(
    "INSERT INTO rate (h, m, n) VALUES (?, ?, ?) ON CONFLICT(h, m) DO UPDATE SET n = n + excluded.n RETURNING n"
  ).bind(h, minute, events.length).first("n");
  if (used > MAX_PER_MINUTE) return json({ ok: false, error: "slow down" });

  for (const e of events) {
    const rule = EVENTS[e?.t];
    if (!rule) continue;
    statements.push(add.bind(rule.key, 1));
    const name = rule.per && cleanName(e.c);
    if (name) statements.push(add.bind(`${rule.per}:${name}`, 1));

    if (e.t === "visit") {
      statements.push(db.prepare(
        "INSERT INTO players (h, first_day, last_day) VALUES (?, ?, ?) ON CONFLICT(h) DO UPDATE SET last_day = excluded.last_day"
      ).bind(h, day, day));
      statements.push(db.prepare("INSERT OR IGNORE INTO seen (day, h) VALUES (?, ?)").bind(day, h));
    }
    // a win carries how long the game took and how many cookies were ruled out
    if (e.t === "guess_right" && Number.isFinite(e.ms) && e.ms > 0 && e.ms < 864e5) {
      const ms = Math.round(e.ms);
      statements.push(add.bind("win_ms_total", ms), add.bind("wins_timed", 1), least.bind("fastest_win_ms", ms));
      if (Number.isFinite(e.out) && e.out >= 0 && e.out < 2000) statements.push(add.bind("win_outs_total", Math.round(e.out)));
    }
  }
  if (Math.random() < 0.02) {
    statements.push(db.prepare("DELETE FROM seen WHERE day < ?").bind(daysAgo(KEEP_DAYS)));
    statements.push(db.prepare("DELETE FROM rate WHERE m < ?").bind(minute - 5));
  }
  if (statements.length) await db.batch(statements);
  return json({ ok: true });
}

async function handleStats(env) {
  const db = env.DB;
  const [counters, total, todayCount, week, returning] = await db.batch([
    db.prepare("SELECT k, v FROM counters"),
    db.prepare("SELECT COUNT(*) AS n FROM players"),
    db.prepare("SELECT COUNT(*) AS n FROM seen WHERE day = ?").bind(today()),
    db.prepare("SELECT COUNT(DISTINCT h) AS n FROM seen WHERE day >= ?").bind(daysAgo(6)),
    db.prepare("SELECT COUNT(*) AS n FROM players WHERE first_day <> last_day"),
  ]);

  const totals = {}, lists = {};
  for (const { k, v } of counters.results) {
    const i = k.indexOf(":");
    if (i < 0) totals[k] = v;
    else (lists[k.slice(0, i)] ||= []).push([k.slice(i + 1), v]);
  }
  const top = (prefix, n = 8) => (lists[prefix] || []).sort((a, b) => b[1] - a[1]).slice(0, n);

  return json({
    updated: new Date().toISOString(),
    players: {
      total: total.results[0].n,
      today: todayCount.results[0].n,
      week: week.results[0].n,
      returning: returning.results[0].n,
    },
    totals,
    top: {
      picked: top("pick"), ruledOut: top("out"), broughtBack: top("back"),
      guessed: top("right"), wrong: top("wrong"), backgrounds: top("bg", 6), rarities: top("rarity", 10),
    },
  }, { "Cache-Control": "public, max-age=30" });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    try {
      if (request.method === "POST" && pathname === "/event") {
        if (!allowedOrigin(request.headers.get("Origin"))) return json({ ok: false, error: "origin" });
        return await handleEvents(request, env);
      }
      if (request.method === "GET" && pathname === "/stats") return await handleStats(env);
    } catch (err) {
      return json({ ok: false, error: "server" }, {});
    }
    return new Response("Cookie Run Guess Who stats", { headers: cors });
  },
};
