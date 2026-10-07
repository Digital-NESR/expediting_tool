/*
 * Whether a module makes its learners take its lessons in order.
 *
 * Until now every track was gated: a lesson carrying a quiz locked everything after it until that
 * quiz was passed. That is right for a curriculum built as a ladder, and wrong for one people come
 * to with a question — a buyer who wants the incoterms video should not have to sit four quizzes
 * to reach it.
 *
 * So the rule becomes a property of the module rather than of the hub. DEFAULT TRUE keeps every
 * existing track exactly as it was; General Supply Chain is opened up below. Turning it on or off
 * for any module is one UPDATE against this column — no deploy.
 *
 * Note what this does NOT change: a lesson with a quiz is still only COMPLETE when the quiz is
 * passed. Gating is about what you may open; completion is about what you have actually done, and
 * ungating a module must not quietly hand out credit for lessons nobody finished.
 */
ALTER TABLE learning_tracks
  ADD COLUMN IF NOT EXISTS sequential_gating BOOLEAN NOT NULL DEFAULT TRUE;

/* General Supply Chain (`supply_chain`) is three levels of reference material that people dip into
   out of order, so it is opened up. The WHERE is by key, not id: ids differ between environments. */
UPDATE learning_tracks SET sequential_gating = FALSE WHERE key = 'supply_chain';
