#!/usr/bin/env node
/**
 * Load Supply Chain Expert (Level 3) into the Learning Hub.
 *
 *   node --env-file=.env scripts/learning-hub-level3.mjs          report what would change
 *   node --env-file=.env scripts/learning-hub-level3.mjs --apply  write it
 *
 * Four releases, 56 lessons, 48 quizzes, 376 questions, built in database/content/learning-hub-level3.json
 * from three sources that had to be reconciled: the video workbook (the embed links, and the real
 * video name inside each iframe's title attribute), the Level 3 quiz document (the questions and the
 * answer key) and "Who Takes What" (every topic's running time).
 *
 * Why a script and not a seed file. SEED_TRACKS content is rebuilt from code on every cold start
 * whose fingerprint has changed, and that rebuild removes rows the seed no longer mentions. General
 * Supply Chain is deliberately NOT in SEED_TRACKS for exactly that reason: it is CMS content, edited
 * by admins in the hub, and a seed would fight them. So Level 3 is loaded once, here, and is an
 * ordinary admin-editable course afterwards.
 *
 * Idempotent, and deliberately additive:
 *
 *  - Modules and lessons are matched on (parent, order_index), so re-running updates the row that is
 *    already there instead of making a second one. Nothing is ever deleted, so an admin who renames
 *    a lesson in the CMS loses that rename on a re-run but does not lose the lesson.
 *  - A quiz's QUESTIONS are replaced wholesale, because a half-updated question set is worse than a
 *    replaced one. The quiz ROW survives, and `learning_quiz_results` hangs off the quiz rather than
 *    off its questions, so nobody's score is touched.
 *
 * Three lessons ship without a video: the workbook has a neighbour's link pasted into their row
 * rather than their own (R3 "Advanced Planning and Scheduling", R4 "Lean, Waste and Six Sigma" and
 * R4 "Theory of Constraints and Just-in-Time"). A wrong video is worse than none, so the lesson is
 * created with its quiz and its running time and no player. Paste the real links into the CMS, or
 * fix the workbook and re-run.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const TRACK_KEY = 'supply_chain';

const content = JSON.parse(readFileSync(join(ROOT, 'database/content/learning-hub-level3.json'), 'utf8'));

const client = new pg.Client({
  host: process.env.DB_HOST ?? process.env.POSTGRES_HOST,
  port: Number(process.env.DB_PORT ?? process.env.POSTGRES_PORT) || 5432,
  user: process.env.DB_USER ?? process.env.POSTGRES_USER,
  password: process.env.DB_PASSWORD ?? process.env.POSTGRES_PASSWORD,
  database: process.env.LEARNING_HUB_DB_NAME || 'learning_hub_db',
  ssl:
    (process.env.DB_SSL ?? process.env.PGSSL) === 'true' ? { rejectUnauthorized: false } : false,
});

await client.connect();

const log = [];
const note = (line) => {
  log.push(line);
  console.log(line);
};

try {
  if (APPLY) await client.query('BEGIN');

  const { rows: courseRows } = await client.query(
    `SELECT c.id FROM learning_courses c
       JOIN learning_tracks t ON t.id = c.track_id
      WHERE t.key = $1 AND c.title = $2`,
    [TRACK_KEY, content.course],
  );
  const courseId = courseRows[0]?.id;
  if (!courseId) throw new Error(`No course "${content.course}" in track "${TRACK_KEY}".`);
  note(`course "${content.course}" is id ${courseId}`);

  let lessonsWritten = 0;
  let questionsWritten = 0;

  for (const mod of content.modules) {
    const moduleId = await upsert(
      `SELECT id FROM learning_modules WHERE course_id = $1 AND order_index = $2`,
      [courseId, mod.order],
      `INSERT INTO learning_modules (course_id, title, order_index) VALUES ($1, $2, $3) RETURNING id`,
      [courseId, mod.title, mod.order],
      `UPDATE learning_modules SET title = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      (id) => [id, mod.title],
      `module ${mod.order} "${mod.title}"`,
    );

    for (const lesson of mod.lessons) {
      const lessonId = await upsert(
        `SELECT id FROM learning_lessons WHERE module_id = $1 AND order_index = $2`,
        [moduleId, lesson.order],
        `INSERT INTO learning_lessons (module_id, title, body, video_url, duration_minutes, order_index)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [moduleId, lesson.title, lesson.body, lesson.videoUrl, lesson.durationMinutes, lesson.order],
        `UPDATE learning_lessons
            SET title = $2, body = $3, video_url = $4, duration_minutes = $5,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        (id) => [id, lesson.title, lesson.body, lesson.videoUrl, lesson.durationMinutes],
        `  lesson ${lesson.title}${lesson.videoUrl ? '' : '   [NO VIDEO LINK]'}`,
      );
      lessonsWritten += 1;

      if (!lesson.quiz) continue;

      const quizId = await upsert(
        `SELECT id FROM learning_quizzes WHERE lesson_id = $1`,
        [lessonId],
        `INSERT INTO learning_quizzes (lesson_id, title, pass_pct) VALUES ($1, $2, $3) RETURNING id`,
        [lessonId, lesson.quiz.title, lesson.quiz.passPct],
        `UPDATE learning_quizzes SET title = $2, pass_pct = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        (id) => [id, lesson.quiz.title, lesson.quiz.passPct],
        `    quiz "${lesson.quiz.title}" (${lesson.quiz.questions.length} questions)`,
      );

      if (APPLY && quizId) {
        // Replace the question set. Results reference the quiz, not its questions, so scores stand.
        await client.query(`DELETE FROM learning_quiz_questions WHERE quiz_id = $1`, [quizId]);
        for (const [qi, q] of lesson.quiz.questions.entries()) {
          const { rows } = await client.query(
            `INSERT INTO learning_quiz_questions (quiz_id, question_text, order_index)
             VALUES ($1, $2, $3) RETURNING id`,
            [quizId, q.text, qi],
          );
          for (const [oi, o] of q.options.entries()) {
            await client.query(
              `INSERT INTO learning_quiz_options (question_id, option_text, is_correct, order_index)
               VALUES ($1, $2, $3, $4)`,
              [rows[0].id, o.text, o.correct, oi],
            );
          }
        }
      }
      questionsWritten += lesson.quiz.questions.length;
    }
  }

  note('');
  note(
    `${content.modules.length} modules, ${lessonsWritten} lessons, ${questionsWritten} questions`,
  );
  if (content.missingVideos.length) {
    note(`\n${content.missingVideos.length} lessons have no video link yet:`);
    for (const m of content.missingVideos) note(`  Release ${m.release}, video ${m.index} — ${m.title}`);
  }

  if (APPLY) {
    await client.query('COMMIT');
    note('\nCommitted.');
  } else {
    note('\nDry run — nothing written. Re-run with --apply.');
  }
} catch (err) {
  if (APPLY) await client.query('ROLLBACK').catch(() => {});
  console.error('\nFAILED:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

/**
 * Find a row, then create or update it, and report which.
 *
 * On a dry run the insert never happens, so there is no id to hand back; children of a row that
 * does not exist yet are simply reported and not written. That is why every caller tolerates a null.
 */
async function upsert(findSql, findParams, insertSql, insertParams, updateSql, updateParams, label) {
  const { rows } = await client.query(findSql, findParams);
  const existing = rows[0]?.id;
  if (existing) {
    if (APPLY) await client.query(updateSql, updateParams(existing));
    note(`${label}  (update)`);
    return existing;
  }
  if (!APPLY) {
    note(`${label}  (create)`);
    return null;
  }
  const created = await client.query(insertSql, insertParams);
  note(`${label}  (create)`);
  return created.rows[0].id;
}
