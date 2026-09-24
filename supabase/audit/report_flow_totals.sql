BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT
  (SELECT count(*) FROM reports) AS reports_total,
  (SELECT count(*) FROM votes) AS votes_total,
  (SELECT count(*) FROM reports r WHERE r.confirmations IS DISTINCT FROM (SELECT count(*)::integer FROM votes v WHERE v.report_id=r.id)) AS mismatched_counters,
  (SELECT count(*) FROM reports r WHERE r.author_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=r.author_id)) AS orphan_authors,
  (SELECT count(*) FROM votes v WHERE v.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=v.user_id)) AS orphan_voters,
  (SELECT count(*) FROM reports WHERE author_id IS NULL) AS reports_without_author,
  (SELECT count(*) FROM votes WHERE user_id IS NULL) AS anonymous_legacy_votes;
ROLLBACK;
