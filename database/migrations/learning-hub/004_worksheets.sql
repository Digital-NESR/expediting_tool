/*
 * What a learner wrote on a release's worksheet.
 *
 * The worksheets were eight Word documents a learner downloaded, filled in and kept. That is where
 * they stayed: nothing came back, so nobody could see what people made of the case studies, and the
 * only record that somebody had done the work was their own copy of it.
 *
 * One row per learner per worksheet. The answers are a JSONB map of field id to value rather than a
 * row per field, because nothing is graded and nothing is queried field-by-field: the admin report
 * reads a whole response and prints it beside the question it answers. A table of 144 field rows
 * per learner would buy joins nobody performs.
 *
 * `worksheet_key` is the definition's own key ('l1', 'l3-r2'), not a module id. The definitions are
 * versioned in the repo under src/lib/learning-hub/worksheets and matched to a module by title, so
 * a module renamed or rebuilt in the CMS does not orphan everybody's answers.
 *
 * Draft and submitted are genuinely different states, not a flag for tidiness: a worksheet is saved
 * continuously while it is being written, and only a submission counts toward full completion. The
 * two timestamps are kept apart for the same reason - `updated_at` moves on every autosave, so it
 * cannot answer "when did they finish".
 */
CREATE TABLE IF NOT EXISTS learning_worksheet_responses (
  id             SERIAL PRIMARY KEY,
  user_email     VARCHAR(200) NOT NULL,
  worksheet_key  VARCHAR(40)  NOT NULL,
  answers        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  status         VARCHAR(12)  NOT NULL DEFAULT 'draft',
  started_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  submitted_at   TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_email, worksheet_key),
  CONSTRAINT learning_worksheet_status CHECK (status IN ('draft', 'submitted')),
  /* A submitted row without a time, or a time without the status, would each make the completion
     count disagree with the report that lists who finished and when. */
  CONSTRAINT learning_worksheet_submitted_at
    CHECK ((status = 'submitted') = (submitted_at IS NOT NULL))
);

/* The two reads are "this learner's response to this worksheet" (covered by the unique key) and
   "every response to this worksheet", for the admin report and the completion counts. */
CREATE INDEX IF NOT EXISTS idx_learning_worksheet_responses_key
  ON learning_worksheet_responses (worksheet_key);
