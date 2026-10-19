// Anonymous stats for Cookie Run Guess Who.
//
//   GET  /hello   hands a new player a signed player pass (needed to send events)
//   POST /event   { id: <pass>, events: [{ t: "rule_out", c: "Pure Vanilla Cookie" }, ...] }
//   GET  /stats   all totals, unique players and top lists, as JSON
//
// Privacy: nothing about the request (IP, browser, location) is stored. The player pass is random;
// it is hashed with a secret SALT before it touches the database, so stored ids can't be matched
// back to a device. Per player only the first and last day played are kept. Only counts are kept,
// never what anyone typed.
//
// Against bots, without bothering real players:
//   - events need a player pass signed by this Worker (made-up ids are ignored)
//   - passes and events are rate limited per connection by Cloudflare's in-memory rate limiter
//     (the IP is only used as a short-lived counter key there and is never written anywhere)
//   - only browsers on the game's own site are accepted
//   - cookie / background / rarity names must exist in the live site's cookies.js and backgrounds.js
//   - each player can send at most a few batches per minute, and a visit counts at most every 30 minutes
//
// Keeping the free plan's 100k rows written per day: every count lives in ONE row holding a JSON object
// ({"rule_out": 52000, "out:Pure Vanilla Cookie": 410, ...}), so a whole batch of up to 100 events writes
// 1 row, plus 1 for a player's visit. The game also only sends a batch about once a minute.

const SITE = "https://luckyducky-guesswho.pages.dev/";
const ALLOWED_ORIGINS = ["https://luckyducky-guesswho.pages.dev", "https://jotryx.github.io"];

const MAX_EVENTS = 100;           // per request
const VISIT_EVERY_MS = 30 * 60e3; // a player's visit counts at most once per 30 minutes
const LEGACY_UNTIL = Date.parse("2026-10-04T12:00:00Z");   // old unsigned ids still work until then

// event type -> counter it adds to; "per" events also count per cookie / background / rarity
const EVENTS = {
  visit:        { key: "visits" },
  start:        { key: "games", per: "pick", names: "cookies" },      // locked in a secret cookie
  rule_out:     { key: "rule_out", per: "out", names: "cookies" },    // flipped a cookie down
  bring_back:   { key: "bring_back", per: "back", names: "cookies" }, // flipped one back up ("unclicked")
  guess_right:  { key: "guess_right", per: "right", names: "cookies" },
  guess_wrong:  { key: "guess_wrong", per: "wrong", names: "cookies" },
  reset:        { key: "reset" },                                     // "Flip all back up"
  new_cookie:   { key: "new_cookie" },                                // gave up / started over
  peek:         { key: "peek" },                                      // "Hide my cookie"
  search:       { key: "search" },                                    // searched (the text is never sent)
  rarity:       { key: "rarity_filter", per: "rarity", names: "rarities" },
  background:   { key: "background", per: "bg", names: "backgrounds" },
  play_again:   { key: "play_again" },
  end_turn:     { key: "questions" },                                 // saved a question ("End turn")
  question_back:{ key: "question_back" },                             // brought back a whole question
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (data, extra = {}) =>
  new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...cors, ...extra } });

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// ---------- who's asking ----------

const isLocal = (o) => o === "null" || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
const fromGame = (req) => {
  const o = req.headers.get("Origin");            // browsers always send this with these requests
  return !!o && (ALLOWED_ORIGINS.includes(o) || isLocal(o));
};
const looksLikeBrowser = (req) => /Mozilla\/5\.0/.test(req.headers.get("User-Agent") || "");

// Cloudflare's rate limiter keeps these counters in memory for a minute; nothing is stored by us.
async function allowed(limiter, req, key = req.headers.get("CF-Connecting-IP") || "local") {
  if (!limiter) return true;   // not configured (e.g. some local setups)
  try { return (await limiter.limit({ key })).success; } catch { return true; }
}

// ---------- signed player passes ----------

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text))).slice(0, 32);
}

// a player who already had an id from before passes keeps it, so they aren't counted twice
async function newPass(env, legacy) {
  const keep = Date.now() < LEGACY_UNTIL && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(legacy || "");
  const id = keep ? legacy : hex(crypto.getRandomValues(new Uint8Array(16)));
  const ts = Date.now().toString(36);
  return `${id}.${ts}.${await hmac(env.SALT, `${id}.${ts}`)}`;
}

// returns the player's random id if the pass is genuine, otherwise null
async function checkPass(pass, env) {
  if (typeof pass !== "string") return null;
  const m = /^([0-9a-f-]{32,36})\.([0-9a-z]{6,12})\.([0-9a-f]{32})$/.exec(pass);
  if (m) return (await hmac(env.SALT, `${m[1]}.${m[2]}`)) === m[3] ? m[1] : null;
  // ids from before passes existed, accepted for a short while so nobody loses a game mid-update
  if (Date.now() < LEGACY_UNTIL && /^[A-Za-z0-9-]{8,64}$/.test(pass)) return pass;
  return null;
}

async function hashId(id, salt) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${id}`))).slice(0, 32);
}

// ---------- real names, read from the live site (refreshed hourly) ----------

let names = null, namesAt = 0;
async function knownNames() {
  if (names && Date.now() - namesAt < 3600e3) return names;
  try {
    const grab = async (file) => {
      const text = await (await fetch(SITE + file, { cf: { cacheTtl: 3600 } })).text();
      return JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
    };
    const [cookies, backgrounds] = await Promise.all([grab("cookies.js"), grab("backgrounds.js")]);
    names = {
      cookies: new Set(cookies.map((c) => c.name)),
      rarities: new Set(cookies.map((c) => c.rarity).filter(Boolean)),
      backgrounds: new Set(["Default blue", "Default red", ...backgrounds.map((b) => b.name)]),
    };
    namesAt = Date.now();
  } catch {
    // site unreachable: fall back to a plain-text check rather than losing real players' stats
  }
  return names;
}

function nameFor(rule, value, list) {
  if (typeof value !== "string") return null;
  const n = value.trim().slice(0, 60);
  if (list) return list[rule.names]?.has(n) ? n : null;
  return /^[\p{L}\p{N} '’().,!&-]+$/u.test(n) ? n : null;
}

// ---------- handlers ----------

async function handleHello(request, env) {
  if (!fromGame(request) || !looksLikeBrowser(request)) return json({ ok: false, error: "origin" });
  if (!(await allowed(env.NEW_PLAYERS, request))) return json({ ok: false, error: "slow down" });
  return json({ ok: true, pass: await newPass(env, new URL(request.url).searchParams.get("keep")) });
}

async function handleEvents(request, env) {
  if (!fromGame(request) || !looksLikeBrowser(request)) return json({ ok: false, error: "origin" });
  if (!(await allowed(env.EVENT_LIMIT, request))) return json({ ok: false, error: "slow down" });

  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ ok: false }); }
  const id = await checkPass(body?.id, env);
  const events = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS) : [];
  if (!id) return json({ ok: false, error: "pass" });
  if (!events.length) return json({ ok: false });

  const db = env.DB;
  const h = await hashId(id, env.SALT);
  const day = today(), now = Date.now();

  // per-player limit (in memory, so it costs no database writes)
  if (!(await allowed(env.PLAYER_LIMIT, request, h))) return json({ ok: false, error: "slow down" });

  // add the batch up first: { "rule_out": 12, "out:Pure Vanilla Cookie": 1, "min:fastest_win_ms": 41000 }
  const list = await knownNames();
  const bump = {};
  const inc = (key, n = 1) => { bump[key] = (bump[key] || 0) + n; };

  for (const e of events) {
    const rule = EVENTS[e?.t];
    if (!rule) continue;

    if (e.t === "visit") {
      // new players are recorded; a returning player's visit counts at most every 30 minutes
      const row = await db.prepare(
        `INSERT INTO players (h, first_day, last_day, last_visit) VALUES (?1, ?2, ?2, ?3)
         ON CONFLICT(h) DO UPDATE SET last_day = ?2, last_visit = ?3 WHERE players.last_visit < ?4
         RETURNING last_visit`
      ).bind(h, day, now, now - VISIT_EVERY_MS).first();
      if (!row) continue;   // visited less than 30 minutes ago
      inc(rule.key);
      continue;
    }

    // events about a cookie / background / rarity only count with a real name
    let name = null;
    if (rule.per) {
      name = nameFor(rule, e.c, list);
      if (!name) continue;
    }
    inc(rule.key);
    if (name) inc(`${rule.per}:${name}`);

    // a win carries how long the game took and how many cookies were ruled out
    if (e.t === "guess_right" && Number.isFinite(e.ms) && e.ms > 2000 && e.ms < 864e5) {
      const ms = Math.round(e.ms);
      inc("win_ms_total", ms); inc("wins_timed");
      bump["min:fastest_win_ms"] = Math.min(bump["min:fastest_win_ms"] ?? ms, ms);
      if (Number.isFinite(e.out) && e.out >= 0 && e.out < 2000) inc("win_outs_total", Math.round(e.out));
      if (Number.isFinite(e.q) && e.q >= 0 && e.q < 500) { inc("win_q_total", Math.round(e.q)); inc("wins_q"); }
    }
  }

  // one write for the whole batch: merge its numbers into the stored JSON object ("min:" keys keep the lowest)
  if (Object.keys(bump).length) await db.prepare(
    `INSERT INTO tallies (k, j) VALUES ('all', ?1) ON CONFLICT(k) DO UPDATE SET j = (
       SELECT json_group_object(key, n) FROM (
         SELECT key, CASE WHEN key LIKE 'min:%' THEN MIN(value) ELSE SUM(value) END AS n FROM (
           SELECT key, value FROM json_each(tallies.j) UNION ALL SELECT key, value FROM json_each(excluded.j)
         ) GROUP BY key))`
  ).bind(JSON.stringify(bump)).run();
  return json({ ok: true });
}

// the stats page answer is kept in memory for a minute, so busy stats pages barely touch the database
let statsCache = null, statsAt = 0;
async function handleStats(env) {
  if (statsCache && Date.now() - statsAt < 60e3) return json(statsCache, { "Cache-Control": "public, max-age=60" });
  const db = env.DB;
  const [rows, total, todayCount, week, returning] = await db.batch([
    db.prepare("SELECT k, j FROM tallies"),
    db.prepare("SELECT COUNT(*) AS n FROM players"),
    db.prepare("SELECT COUNT(*) AS n FROM players WHERE last_day = ?").bind(today()),
    db.prepare("SELECT COUNT(*) AS n FROM players WHERE last_day >= ?").bind(daysAgo(6)),
    db.prepare("SELECT COUNT(*) AS n FROM players WHERE first_day <> last_day"),
  ]);

  // the "all" row; rows from the earlier one-row-per-list layout ("totals", "out", ...) are added in
  const totals = {}, lists = {};
  const put = (key, v) => {
    if (key.startsWith("min:")) { key = key.slice(4); totals[key] = Math.min(totals[key] ?? v, v); return; }
    const i = key.indexOf(":");
    if (i < 0) { totals[key] = (totals[key] || 0) + v; return; }
    const l = (lists[key.slice(0, i)] ||= {}), name = key.slice(i + 1);
    l[name] = (l[name] || 0) + v;
  };
  for (const { k, j } of rows.results) {
    for (const [key, v] of Object.entries(JSON.parse(j))) {
      put(k === "all" ? key : k === "totals" ? key : k === "least" ? `min:${key}` : `${k}:${key}`, v);
    }
  }
  const top = (list, n = 8) => Object.entries(lists[list] || {}).sort((a, b) => b[1] - a[1]).slice(0, n);

  statsCache = {
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
  };
  statsAt = Date.now();
  return json(statsCache, { "Cache-Control": "public, max-age=60" });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    try {
      if (request.method === "GET" && pathname === "/hello") return await handleHello(request, env);
      if (request.method === "POST" && pathname === "/event") return await handleEvents(request, env);
      if (request.method === "GET" && pathname === "/stats") return await handleStats(env);
    } catch (err) {
      console.error("stats error:", err && (err.stack || err.message || String(err)));
      return json({ ok: false, error: "server" });
    }
    return new Response("Cookie Run Guess Who stats", { headers: cors });
  },
};
