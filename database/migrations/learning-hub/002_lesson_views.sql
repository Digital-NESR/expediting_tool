/*
 * Who opened a lesson, as distinct from who finished it.
 *
 * `learning_lesson_progress` is the only record of a learner touching a lesson, and it is written
 * when they tick the box or pass the quiz. So the hub could say how many people COMPLETED a video
 * and had no idea how many had watched one. Those are the two ends of the same funnel and the
 * interesting number is the gap between them: a lesson a hundred people open and nine finish is a
 * problem with that lesson, and it is invisible if only the nine are counted.
 *
 * One row per learner per lesson, not one per visit. The question is "how many people have seen
 * this", and a row per visit would answer "how many times was it opened", which flatters a lesson
 * somebody left open in a tab. The count is kept alongside for the few places repetition matters.
 */
CREATE TABLE IF NOT EXISTS learning_lesson_views (
  user_email     VARCHAR(200) NOT NULL,
  lesson_id      INTEGER      NOT NULL REFERENCES learning_lessons (id) ON DELETE CASCADE,
  first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  view_count     INTEGER      NOT NULL DEFAULT 1,
  PRIMARY KEY (user_email, lesson_id)
);

/* The analytics read is "every view for the lessons of this course", which arrives as a join on
   lesson_id. Without this it is a sequential scan of the whole table per course. */
CREATE INDEX IF NOT EXISTS idx_learning_lesson_views_lesson
  ON learning_lesson_views (lesson_id);

/*
 * Backfill from completions.
 *
 * Anybody who completed a lesson certainly opened it, so the rows already in
 * `learning_lesson_progress` are views we know happened. Without this the funnel would open with
 * more completions than views for every lesson in the hub's history, which reads as a broken
 * report rather than as missing history.
 *
 * `first_viewed_at` takes the completion time, which is the one thing known to be true about it:
 * it is late by however long they spent on the lesson, and inventing an earlier time would be
 * worse than being honestly late.
 */
INSERT INTO learning_lesson_views (user_email, lesson_id, first_viewed_at, last_viewed_at, view_count)
SELECT p.user_email, p.lesson_id, p.completed_at, p.completed_at, 1
  FROM learning_lesson_progress p
ON CONFLICT (user_email, lesson_id) DO NOTHING;
