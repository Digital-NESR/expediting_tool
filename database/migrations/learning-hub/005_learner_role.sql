/*
 * The role a learner picked for themselves, so the hub can keep curating for it.
 *
 * "Where to start" could already answer which of three courses and eight releases belong to a
 * buyer rather than a demand planner. It answered it once, in a panel, and then forgot — the
 * learner came back the next week to the same undifferentiated list of everything.
 *
 * One row per learner per module, because the question is per module: the role that decides which
 * Supply Chain releases are yours says nothing about which SAP course is. Only the modules with a
 * guide ever write a row here, which today is one of four.
 *
 * `role_key` is a slug from the guide in code (`src/lib/learning-hub-guide.ts`), not a foreign key.
 * A role that is renamed or dropped from the guide leaves rows pointing at nothing, and that is the
 * intended failure: the learner falls back to the uncurated list and is asked to choose again,
 * which is better than being curated for a role that no longer exists.
 */
CREATE TABLE IF NOT EXISTS learning_learner_roles (
  user_email  VARCHAR(200) NOT NULL,
  track_key   VARCHAR(64)  NOT NULL,
  role_key    VARCHAR(64)  NOT NULL,
  chosen_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_email, track_key)
);

/* The admin side asks "how do our learners describe themselves", which is a scan by role rather
   than by person; the learner side is covered by the primary key. */
CREATE INDEX IF NOT EXISTS idx_learning_learner_roles_role
  ON learning_learner_roles (track_key, role_key);
