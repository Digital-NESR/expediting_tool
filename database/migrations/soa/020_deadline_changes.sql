-- Every time a deadline moves, and why.
--
-- A cycle's two deadlines are dates people were given. The collection one goes into the letter
-- every supplier received, and the cycle one is what a country is judged late against. Moving
-- either after the fact changes what "on time" meant, and a quarter that was extended twice and
-- then reported as delivered on schedule is exactly the thing an auditor is looking for.
--
-- A table of its own rather than an evidence row alone: evidence_log hangs off a country_cycle,
-- so a deadline changed before any country enrolled would have had nowhere to be recorded, which
-- is precisely the moment a date is most likely to be corrected. Evidence rows are written as
-- well, for the countries that do exist, so the change reaches their packs.
CREATE TABLE IF NOT EXISTS cycle_deadline_changes (
  id                        SERIAL PRIMARY KEY,
  cycle_id                  INTEGER NOT NULL REFERENCES cycles(id),
  changed_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by                VARCHAR(200) NOT NULL,
  reason                    TEXT NOT NULL,
  old_submission_deadline   DATE NOT NULL,
  new_submission_deadline   DATE NOT NULL,
  old_cycle_deadline        DATE NOT NULL,
  new_cycle_deadline        DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cycle_deadline_changes_cycle
  ON cycle_deadline_changes (cycle_id, changed_at DESC);

COMMENT ON TABLE cycle_deadline_changes IS
  'Audit of every change to a cycle''s collection and closing deadlines, with the stated reason.';
