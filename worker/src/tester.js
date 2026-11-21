// Testers-only game modes (Guess the Gender), unlocked with a password.
//
//   POST /unlock          { password }  ->  { ok: true, token }   (a signed tester pass, valid 30 days)
//   GET  /tester/<file>   Authorization: Bearer <token>   ->  that file's contents
//
// Nothing secret is in this file or anywhere in the public repo:
//   - the password is a Cloudflare secret (npx wrangler secret put GENDER_PASSWORD), checked here
//   - the mode itself (code, styles, gender list) lives in worker/private/, which git ignores; it is
//     bundled into the Worker when deploying, and only handed to browsers with a valid tester pass
//   - wrong passwords are rate limited per connection, so guessing one isn't practical
// Changing the password signs every tester out (their passes stop working).

import genderJs from "../private/gender.js";
import genderCss from "../private/gender.css";
import genderList from "../private/genders.txt";

const PASS_DAYS = 30;

// "Example Cookie She/Her" lines (under rarity headings) -> { "Example Cookie": "She/Her" }
function parseGenders(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^(.*?)\s+((?:He|She|They|It)\/.*)$/.exec(line);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

const FILES = {
  "gender.js": { type: "text/javascript; charset=utf-8", body: () => genderJs },
  "gender.css": { type: "text/css; charset=utf-8", body: () => genderCss },
  "genders.json": { type: "application/json", body: () => JSON.stringify(parseGenders(genderList)) },
};

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (text) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}

// compares two strings in constant time, so the answer time gives nothing away
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// the pass is tied to the current password, so changing the password ends every pass
async function sign(env, exp) {
  return hmac(env.SALT, `tester:${exp}:${await sha256(env.GENDER_PASSWORD)}`);
}

async function validPass(token, env) {
  if (!env.GENDER_PASSWORD || typeof token !== "string") return false;
  const m = /^(\d{10,13})\.([0-9a-f]{64})$/.exec(token);
  if (!m || +m[1] < Date.now()) return false;
  return same(await sign(env, m[1]), m[2]);
}

export async function handleUnlock(request, env, { json, fromGame, looksLikeBrowser, allowed }) {
  if (!fromGame(request) || !looksLikeBrowser(request)) return json({ ok: false, error: "origin" });
  if (!(await allowed(env.UNLOCK_LIMIT, request))) return json({ ok: false, error: "slow down" });
  if (!env.GENDER_PASSWORD) return json({ ok: false, error: "not set up" });
  let password = "";
  try { password = String((await request.json())?.password ?? "").slice(0, 200); } catch {}
  // hash both sides first, so the comparison is always the same length
  if (!same(await sha256(password), await sha256(env.GENDER_PASSWORD))) return json({ ok: false, error: "wrong" });
  const exp = String(Date.now() + PASS_DAYS * 864e5);
  return json({ ok: true, token: `${exp}.${await sign(env, exp)}` });
}

export async function handleTesterFile(request, env, name, { cors }) {
  const file = FILES[name];
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!file || !(await validPass(token, env))) {
    return new Response("Not found", { status: file ? 401 : 404, headers: cors });
  }
  return new Response(file.body(), {
    headers: { "Content-Type": file.type, "Cache-Control": "private, no-store", ...cors },
  });
}
