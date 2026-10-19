-- One-time move from one JSON row per list ("totals", "out", ...) to a single "all" row, and the
-- "seen" table goes (players.last_day gives the same daily / weekly counts).
-- Run AFTER deploying the Worker that writes the "all" row; numbers already in it are added to.
--   npx wrangler d1 execute guesswho-stats --remote --file migrate-3.sql
INSERT INTO tallies (k, j) VALUES ('all', '{}') ON CONFLICT(k) DO NOTHING;

UPDATE tallies SET j = (
  SELECT json_group_object(key, n) FROM (
    SELECT key, CASE WHEN key LIKE 'min:%' THEN MIN(value) ELSE SUM(value) END AS n FROM (
      SELECT key, value FROM json_each(tallies.j)
      UNION ALL
      SELECT CASE WHEN t.k = 'totals' THEN e.key WHEN t.k = 'least' THEN 'min:' || e.key ELSE t.k || ':' || e.key END,
             e.value
      FROM tallies AS t, json_each(t.j) AS e WHERE t.k <> 'all'
    ) GROUP BY key))
WHERE k = 'all';

DELETE FROM tallies WHERE k <> 'all';
DROP TABLE IF EXISTS seen;
