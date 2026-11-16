-- ICSA analytics: the AI gap review per country, and the action plans that close the gaps.
--
-- The completion threshold is retired: a country is complete only when everyone sent the form
-- has submitted it. icsa_cycles.threshold_pct stays (NOT NULL, existing rows keep their value)
-- but the app writes 100 and no longer reads it.

-- Each time someone asks the AI to review a country's gaps. The newest row is the one shown;
-- older ones stay as a record of what was said when.
CREATE TABLE IF NOT EXISTS icsa_ai_reviews (
  id               BIGSERIAL PRIMARY KEY,
  enrollment_id    BIGINT      NOT NULL REFERENCES icsa_enrollments (id) ON DELETE CASCADE,
  -- { summary, rating, themes[], gaps[] }: see src/lib/icsa/ai.ts
  review           JSONB       NOT NULL,
  -- How many submitted forms the review was based on, so a stale review can be flagged.
  responses_count  INTEGER     NOT NULL,
  model            TEXT,
  input_tokens     INTEGER,
  output_tokens    INTEGER,
  created_by       TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS icsa_ai_reviews_enrollment
  ON icsa_ai_reviews (enrollment_id, created_at DESC);

-- What the champion (or an admin) will do about one gap in one country.
CREATE TABLE IF NOT EXISTS icsa_action_plans (
  id             BIGSERIAL PRIMARY KEY,
  enrollment_id  BIGINT      NOT NULL REFERENCES icsa_enrollments (id) ON DELETE CASCADE,
  question_ref   TEXT        NOT NULL,
  action         TEXT        NOT NULL,
  owner          TEXT,
  due_date       DATE,
  status         TEXT        NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'in_progress', 'done')),
  -- True when the text started as an AI suggestion (it may have been edited since).
  from_ai        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by     TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by     TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS icsa_action_plans_enrollment ON icsa_action_plans (enrollment_id);
