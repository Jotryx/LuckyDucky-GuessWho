# Stats Worker

A tiny Cloudflare Worker that counts anonymous game stats for Cookie Run Guess Who and serves
them to the `/stats` page. It runs on Cloudflare's free plan.

**What it stores:** only totals ("Angel Cookie ruled out 52 times") and, to count different
players, a random id made in each browser. That id is hashed with your secret `SALT` before it's
saved, so it can't be traced back to anyone. No IP addresses, browser details, locations or
search text are ever stored. Day-by-day records (for "players today / this week") are deleted
after 35 days. Visitors with "Do Not Track" or "Global Privacy Control" switched on aren't
counted, and demo boards (`?demo`) never count.

## Setting it up (one time, about 5 minutes)

You need a free Cloudflare account and Node.js. In this `worker` folder, run:

1. **Log in to Cloudflare** (opens your browser):
   ```
   npx wrangler login
   ```
2. **Create the database:**
   ```
   npx wrangler d1 create guesswho-stats
   ```
   Copy the `database_id` it prints into `wrangler.toml` (replace `PASTE-YOUR-DATABASE-ID-HERE`).
3. **Create the tables:**
   ```
   npx wrangler d1 execute guesswho-stats --remote --file=schema.sql
   ```
4. **Set a secret salt** (type any long random text when asked, and keep it private):
   ```
   npx wrangler secret put SALT
   ```
5. **Deploy:**
   ```
   npx wrangler deploy
   ```
   It prints your Worker's address, like `https://guesswho-stats.yourname.workers.dev`.
6. **Switch stats on in the site:** put that address in `../stats-config.js`:
   ```js
   window.STATS_URL = "https://guesswho-stats.yourname.workers.dev";
   ```
   Commit and push. A **Stats** button appears next to the search bar, and the stats page is at
   `/stats/` on your site.

## Trying it locally

```
npx wrangler d1 execute guesswho-stats --local --file=schema.sql
npx wrangler dev --local --var SALT:test
```
Then set `window.STATS_URL = "http://127.0.0.1:8787"` while testing (and set it back afterwards).

## Starting the counts over

```
npx wrangler d1 execute guesswho-stats --remote --command "DELETE FROM tallies; DELETE FROM players;"
```

## Testers-only game mode (Guess the Gender)

The site's menu shows "Guess the Gender" as *coming soon*. Testers tap that card 5 times quickly and
enter the tester password. The password and the mode itself never appear in this public repo:

- **The password** is a Cloudflare secret. Set or change it (changing it signs every tester out):
  ```
  npx wrangler secret put GENDER_PASSWORD
  ```
- **The mode** (code, styles and the gender list) lives in `worker/private/`, which git ignores:
  `gender.js`, `gender.css` and `genders.txt` (lines like `Example Cookie She/Her`). It is
  bundled into the Worker by `npx wrangler deploy` and served only with a valid tester pass, so keep a
  backup of that folder somewhere safe: it is not on GitHub.
