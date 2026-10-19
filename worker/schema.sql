-- Only totals and anonymous, hashed player ids are stored. No IPs, no names, no search text.

-- every count, in ONE row ("all") holding a JSON object:
--   {"visits": 812, "rule_out": 52000, "out:Pure Vanilla Cookie": 410, "min:fastest_win_ms": 41000, ...}
-- One row keeps a whole batch of events at 1 row written (the free plan allows 100k per day).
CREATE TABLE IF NOT EXISTS tallies (
  k TEXT PRIMARY KEY,
  j TEXT NOT NULL DEFAULT '{}'
);

-- one row per (hashed) player id, to count different people
CREATE TABLE IF NOT EXISTS players (
  h TEXT PRIMARY KEY,
  first_day TEXT NOT NULL,
  last_day TEXT NOT NULL,
  last_visit INTEGER NOT NULL DEFAULT 0   -- ms; a visit counts at most every 30 minutes
);
