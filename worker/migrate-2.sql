-- One-time move from one row per counter ("out:Pure Vanilla Cookie") to one JSON row per list.
-- Run AFTER deploying the new Worker; numbers it already wrote to "tallies" are added to, not replaced.
--   npx wrangler d1 execute guesswho-stats --remote --file migrate-2.sql
CREATE TABLE IF NOT EXISTS tallies (k TEXT PRIMARY KEY, j TEXT NOT NULL DEFAULT '{}');

CREATE VIEW old AS
  SELECT CASE WHEN k = 'fastest_win_ms' THEN 'least'
              WHEN instr(k, ':') = 0 THEN 'totals'
              ELSE substr(k, 1, instr(k, ':') - 1) END AS row,
         CASE WHEN instr(k, ':') = 0 THEN k ELSE substr(k, instr(k, ':') + 1) END AS key,
         v AS value
  FROM counters;

INSERT INTO tallies (k, j) SELECT DISTINCT row, '{}' FROM old WHERE true ON CONFLICT(k) DO NOTHING;

UPDATE tallies SET j = (
  SELECT json_group_object(key, n) FROM (
    SELECT key, CASE WHEN tallies.k = 'least' THEN MIN(value) ELSE SUM(value) END AS n FROM (
      SELECT key, value FROM json_each(tallies.j)
      UNION ALL SELECT key, value FROM old WHERE old.row = tallies.k
    ) GROUP BY key))
WHERE k IN (SELECT row FROM old);

-- the old table is kept as a backup under a new name; the per-minute table isn't needed any more
DROP VIEW old;
ALTER TABLE counters RENAME TO counters_backup;
DROP TABLE IF EXISTS rate;
