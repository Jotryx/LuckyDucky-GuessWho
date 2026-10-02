-- Only totals and anonymous, hashed player ids are stored. No IPs, no names, no search text.

-- every counter: "visits", "guess_wrong", "out:Pure Vanilla Cookie", ...
CREATE TABLE IF NOT EXISTS counters (
  k TEXT PRIMARY KEY,
  v INTEGER NOT NULL DEFAULT 0
);

-- one row per (hashed) player id, to count different people
CREATE TABLE IF NOT EXISTS players (
  h TEXT PRIMARY KEY,
  first_day TEXT NOT NULL,
  last_day TEXT NOT NULL
);

-- which (hashed) players were around on which day; rows older than 35 days are deleted
CREATE TABLE IF NOT EXISTS seen (
  day TEXT NOT NULL,
  h TEXT NOT NULL,
  PRIMARY KEY (day, h)
);

-- events per (hashed) player per minute, for rate limiting; rows older than 5 minutes are deleted
CREATE TABLE IF NOT EXISTS rate (
  h TEXT NOT NULL,
  m INTEGER NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (h, m)
);
