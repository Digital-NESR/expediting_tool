-- ICSA (Internal Control Self-Assessment), Supply Chain function.
--
-- Who does what:
--   admin       ADMIN_EMAILS / ICSA_ADMIN_EMAILS. Opens cycles, sets the deadline and the
--               completion threshold, appoints champions, decides extension requests.
--   champion    One row per (person, country) in icsa_champions. Enrols their country in an
--               open cycle, nominates respondents from the Azure AD directory, assigns each one
--               the form sections that match their job, chases, reviews, and closes their
--               country once the threshold is met.
--   respondent  Anyone with a row in icsa_assessments. Gets one independent form per
--               nomination, even when a colleague does the same process.
--
-- A cycle is one run (a quarter, a year, a month: the frequency is a label the admin picks,
-- nothing recurs on its own). A country inside a cycle is an enrollment; it carries its own
-- deadline because an extension moves one country's date, not everybody's.

CREATE TABLE IF NOT EXISTS icsa_champions (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT        NOT NULL,
  name        TEXT,
  country     TEXT        NOT NULL,
  created_by  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS icsa_champions_email_country
  ON icsa_champions (LOWER(email), country);

CREATE TABLE IF NOT EXISTS icsa_cycles (
  id             BIGSERIAL PRIMARY KEY,
  label          TEXT        NOT NULL,
  frequency      TEXT        NOT NULL
                 CHECK (frequency IN ('monthly', 'quarterly', 'half-yearly', 'yearly', 'ad-hoc')),
  period_start   DATE        NOT NULL,
  period_end     DATE        NOT NULL,
  deadline       DATE        NOT NULL,
  threshold_pct  INTEGER     NOT NULL CHECK (threshold_pct BETWEEN 1 AND 100),
  status         TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at      TIMESTAMPTZ,
  closed_by      TEXT,
  close_reason   TEXT,
  created_by     TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start)
);
CREATE UNIQUE INDEX IF NOT EXISTS icsa_cycles_label ON icsa_cycles (LOWER(label));

CREATE TABLE IF NOT EXISTS icsa_enrollments (
  id              BIGSERIAL PRIMARY KEY,
  cycle_id        BIGINT      NOT NULL REFERENCES icsa_cycles (id) ON DELETE CASCADE,
  country         TEXT        NOT NULL,
  champion_email  TEXT        NOT NULL,
  champion_name   TEXT,
  deadline        DATE        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'closed', 'force_closed')),
  closed_at       TIMESTAMPTZ,
  closed_by       TEXT,
  close_note      TEXT,
  enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, country)
);

CREATE TABLE IF NOT EXISTS icsa_extension_requests (
  id                  BIGSERIAL PRIMARY KEY,
  enrollment_id       BIGINT      NOT NULL REFERENCES icsa_enrollments (id) ON DELETE CASCADE,
  requested_by        TEXT        NOT NULL,
  requested_deadline  DATE        NOT NULL,
  reason              TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by          TEXT,
  decided_at          TIMESTAMPTZ,
  decision_note       TEXT,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS icsa_extension_one_pending
  ON icsa_extension_requests (enrollment_id) WHERE status = 'pending';

-- One row per nominated respondent: their own form, their own answers.
--   nominated      picked by the champion, request not sent yet (still editable)
--   requested      request sent, nothing answered yet
--   in_progress    at least one answer saved
--   submitted      locked, awaiting review
--   returned       sent back by a reviewer with a note
--   reviewed       accepted by a reviewer
--   not_completed  the country closed before this person submitted
CREATE TABLE IF NOT EXISTS icsa_assessments (
  id                 BIGSERIAL PRIMARY KEY,
  enrollment_id      BIGINT      NOT NULL REFERENCES icsa_enrollments (id) ON DELETE CASCADE,
  respondent_email   TEXT        NOT NULL,
  respondent_name    TEXT,
  job_title          TEXT,
  department         TEXT,
  sections           TEXT[]      NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'nominated'
                     CHECK (status IN ('nominated', 'requested', 'in_progress', 'submitted',
                                       'returned', 'reviewed', 'not_completed')),
  designation        TEXT,
  answers            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  nominated_by       TEXT        NOT NULL,
  nominated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requested_at       TIMESTAMPTZ,
  last_reminded_at   TIMESTAMPTZ,
  reminder_count     INTEGER     NOT NULL DEFAULT 0,
  started_at         TIMESTAMPTZ,
  submitted_at       TIMESTAMPTZ,
  reviewed_by        TEXT,
  reviewed_at        TIMESTAMPTZ,
  reviewer_note      TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cardinality(sections) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS icsa_assessments_one_per_person
  ON icsa_assessments (enrollment_id, LOWER(respondent_email));
CREATE INDEX IF NOT EXISTS icsa_assessments_respondent
  ON icsa_assessments (LOWER(respondent_email));

-- Evidence files attached to a single answer.
CREATE TABLE IF NOT EXISTS icsa_evidence (
  id             BIGSERIAL PRIMARY KEY,
  assessment_id  BIGINT      NOT NULL REFERENCES icsa_assessments (id) ON DELETE CASCADE,
  question_ref   TEXT        NOT NULL,
  file_name      TEXT        NOT NULL,
  content_type   TEXT        NOT NULL,
  size_bytes     INTEGER     NOT NULL,
  data           BYTEA       NOT NULL,
  uploaded_by    TEXT        NOT NULL,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS icsa_evidence_assessment ON icsa_evidence (assessment_id);

-- Append-only trail of who did what.
CREATE TABLE IF NOT EXISTS icsa_events (
  id             BIGSERIAL PRIMARY KEY,
  cycle_id       BIGINT,
  enrollment_id  BIGINT,
  assessment_id  BIGINT,
  actor          TEXT        NOT NULL,
  action         TEXT        NOT NULL,
  detail         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS icsa_events_cycle ON icsa_events (cycle_id, occurred_at DESC);
