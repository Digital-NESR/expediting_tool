/*
 * learning-hub — 001 baseline
 *
 * The schema as it stood on the day migrations were adopted for this database. Every statement
 * below is lifted verbatim from the runtime DDL that used to run on the request path, behind
 * hand-rolled `let xEnsured: Promise<void> | null` memos that re-ran on the first request every
 * serverless instance served:
 *
 *   - `ensureLearningHubSchema()` in src/lib/learning-hub-queries.ts      (learning hub core)
 *   - `ensureGameSchema()`        in src/app/actions/learning-game.ts     (game leaderboard)
 *   - `ensureSchema()`            in src/app/api/red-bull/session/route.ts (multiplayer sessions)
 *
 * All three share one database (learning_hub_db), so they share one baseline. Statements are
 * ordered so a table precedes its indexes and its ALTERs, and the sections below follow the three
 * features rather than the order the three files happened to run in.
 *
 * It is idempotent by construction. Every statement is `IF NOT EXISTS` / `ADD COLUMN IF NOT
 * EXISTS`, and the `DROP NOT NULL` / `DROP DEFAULT` statements are no-ops once applied — exactly
 * as they were when they ran on every cold start. That is what makes this safe to apply to the
 * already-live database, where all of it is already in place: applying this baseline there
 * records the version and changes nothing.
 *
 * The SQL is deliberately NOT tidied. The CREATE TABLEs still carry the columns that the ALTERs
 * below them later add or relax, because that is how the live database was actually built and a
 * "cleaner" rewrite would no longer be a guaranteed no-op against it.
 *
 * Data is not part of this file. The one-time `tab_label_prefix` backfill and the SEED_TRACKS
 * content sync stay in src/lib/learning-hub-queries.ts: they write rows, not structure, and the
 * seed sync is content that admins then edit through the CMS.
 *
 * Runs inside a transaction: nothing here is one of the statements Postgres refuses to run in one.
 */

/* ═══════════════════════════════════════════════════════════════════════════════
   Learning hub core — tracks, courses, modules, lessons, progress, quizzes
   (from ensureLearningHubSchema() in src/lib/learning-hub-queries.ts)
   ═══════════════════════════════════════════════════════════════════════════════ */

CREATE TABLE IF NOT EXISTS learning_tracks (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    color TEXT,
    order_index INT NOT NULL DEFAULT 0,
    seed_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

ALTER TABLE learning_tracks ADD COLUMN IF NOT EXISTS seed_version TEXT;

-- Browser-tab label rule as DATA instead of a track-key literal in the query layer: a track with a
-- prefix set shows the compact "<prefix> lvl N" form in the tight tab space (see getCourseTabTitle).
ALTER TABLE learning_tracks ADD COLUMN IF NOT EXISTS tab_label_prefix TEXT;

CREATE TABLE IF NOT EXISTS learning_courses (
    id SERIAL PRIMARY KEY,
    track_id INT NOT NULL REFERENCES learning_tracks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    order_index INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

CREATE INDEX IF NOT EXISTS idx_learning_courses_track ON learning_courses(track_id);

CREATE TABLE IF NOT EXISTS learning_modules (
    id SERIAL PRIMARY KEY,
    course_id INT NOT NULL REFERENCES learning_courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    order_index INT NOT NULL DEFAULT 0,
    resource_label TEXT,
    resource_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

ALTER TABLE learning_modules ADD COLUMN IF NOT EXISTS resource_label TEXT;
ALTER TABLE learning_modules ADD COLUMN IF NOT EXISTS resource_url TEXT;

CREATE INDEX IF NOT EXISTS idx_learning_modules_course ON learning_modules(course_id);

CREATE TABLE IF NOT EXISTS learning_lessons (
    id SERIAL PRIMARY KEY,
    module_id INT NOT NULL REFERENCES learning_modules(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    video_url TEXT,
    duration_minutes INT,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

ALTER TABLE learning_lessons ADD COLUMN IF NOT EXISTS video_url TEXT;

-- No fabricated default: a lesson only shows a duration if someone actually set one. These two undo
-- an earlier decision (duration_minutes was once mandatory with a default), so they are no-ops on a
-- database built from the CREATE TABLE above and load-bearing on one that predates it.
ALTER TABLE learning_lessons ALTER COLUMN duration_minutes DROP NOT NULL;
ALTER TABLE learning_lessons ALTER COLUMN duration_minutes DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_learning_lessons_module ON learning_lessons(module_id);

CREATE TABLE IF NOT EXISTS learning_lesson_progress (
    id SERIAL PRIMARY KEY,
    user_email TEXT NOT NULL,
    lesson_id INT NOT NULL REFERENCES learning_lessons(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_email, lesson_id)
  );

CREATE INDEX IF NOT EXISTS idx_learning_progress_user ON learning_lesson_progress(user_email);

-- Knowledge checks: one optional quiz per module, feedback-only (not a completion gate).
CREATE TABLE IF NOT EXISTS learning_quizzes (
    id SERIAL PRIMARY KEY,
    module_id INT NOT NULL UNIQUE REFERENCES learning_modules(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Knowledge check',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE IF NOT EXISTS learning_quiz_questions (
    id SERIAL PRIMARY KEY,
    quiz_id INT NOT NULL REFERENCES learning_quizzes(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

CREATE INDEX IF NOT EXISTS idx_learning_quiz_questions_quiz ON learning_quiz_questions(quiz_id);

CREATE TABLE IF NOT EXISTS learning_quiz_options (
    id SERIAL PRIMARY KEY,
    question_id INT NOT NULL REFERENCES learning_quiz_questions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT false,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

CREATE INDEX IF NOT EXISTS idx_learning_quiz_options_question ON learning_quiz_options(question_id);

/* Lesson-level quizzes (attach a quiz to a lesson/video) + per-user pass tracking for gating.
   The DROP NOT NULL is what made this possible: learning_quizzes started life as strictly
   one-quiz-per-module, so module_id was mandatory. A quiz that hangs off a lesson instead has no
   module, so the column had to be relaxed rather than a second table added. The partial unique
   index below is the lesson-side replacement for the UNIQUE that module_id still carries — it has
   to skip NULLs, or every module-level quiz would collide with every other one on lesson_id. */
ALTER TABLE learning_quizzes ALTER COLUMN module_id DROP NOT NULL;
ALTER TABLE learning_quizzes ADD COLUMN IF NOT EXISTS lesson_id INT REFERENCES learning_lessons(id) ON DELETE CASCADE;
ALTER TABLE learning_quizzes ADD COLUMN IF NOT EXISTS pass_pct INT NOT NULL DEFAULT 70;
CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_quizzes_lesson ON learning_quizzes(lesson_id) WHERE lesson_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS learning_quiz_results (
    id SERIAL PRIMARY KEY,
    user_email TEXT NOT NULL,
    quiz_id INT NOT NULL REFERENCES learning_quizzes(id) ON DELETE CASCADE,
    best_pct INT NOT NULL DEFAULT 0,
    passed BOOLEAN NOT NULL DEFAULT false,
    attempts INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_email, quiz_id)
  );

/* There is deliberately no access_requests table here. One was created to mirror the other
   tools and was briefly used — two people were approved through it on 8 Sep 2026 — before the
   Learning Hub became open to every signed-in employee, after which nothing read or wrote it.
   It was retired on 15 Sep 2026 by renaming it to access_requests_bak_lhretire rather than
   dropping it, so those two approval rows survive. Drop that backup once nobody wants them. */

/* ═══════════════════════════════════════════════════════════════════════════════
   Game tables — Red Bull Distribution Game leaderboard
   (from ensureGameSchema() in src/app/actions/learning-game.ts)
   ═══════════════════════════════════════════════════════════════════════════════ */

CREATE TABLE IF NOT EXISTS learning_game_scores (
          id SERIAL PRIMARY KEY,
          game_key TEXT NOT NULL DEFAULT 'red_bull_distribution',
          user_email TEXT NOT NULL,
          player_name TEXT,
          score INTEGER NOT NULL,
          chain_cost INTEGER,
          grade TEXT,
          role TEXT,
          pattern TEXT,
          weeks INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

CREATE INDEX IF NOT EXISTS idx_lgs_game_score ON learning_game_scores (game_key, score DESC);

-- Solo vs team runs (added later; existing rows default to 'solo').
ALTER TABLE learning_game_scores ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'solo';

CREATE INDEX IF NOT EXISTS idx_lgs_user ON learning_game_scores (game_key, user_email, created_at DESC);

/* ═══════════════════════════════════════════════════════════════════════════════
   Red-bull session tables — shared multiplayer game state
   (from ensureSchema() in src/app/api/red-bull/session/route.ts)
   ═══════════════════════════════════════════════════════════════════════════════ */

CREATE TABLE IF NOT EXISTS learning_game_sessions (
          code TEXT PRIMARY KEY,
          game_key TEXT NOT NULL DEFAULT 'red_bull_distribution',
          host_email TEXT,
          state JSONB NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

CREATE INDEX IF NOT EXISTS idx_lgsess_updated ON learning_game_sessions (updated_at);

/*
 * Who may write to a room. Added after rooms already existed, so a NULL here means "nobody has
 * been recorded yet" and the first writers are admitted and remembered — a game that was live
 * when this shipped keeps working instead of locking its own players out mid-run.
 */
ALTER TABLE learning_game_sessions ADD COLUMN IF NOT EXISTS participant_emails TEXT[];
