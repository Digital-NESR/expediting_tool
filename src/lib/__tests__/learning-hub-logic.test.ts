import { describe, expect, it } from 'vitest';

import {
  DEFAULT_QUIZ_PASS_PCT,
  bucketMyWorkCourses,
  checkVideoUrl,
  foldCourseGating,
  gradeLessonQuizAttempt,
  gradeQuizAttempt,
  hashSeedTrack,
  lessonProgressFlags,
  planOrderSwap,
  type CourseGatingRow,
} from '@/lib/learning-hub-logic';
import type { SeedTrack } from '@/lib/learning-hub-seed-content';
import type { MyWorkCourse } from '@/types/learning-hub';

/**
 * The Learning Hub's rules, as rules.
 *
 * Nothing here talks to Postgres — that is the point of `learning-hub-logic`. What is pinned below
 * is what a learner is allowed to see and whether their progress survives a deploy: the gate that
 * stops someone skipping to lesson five, the pass boundary, the answer key that must not come back
 * on a failed attempt, the fingerprint that decides whether a deploy wipes a track, and the
 * allowlist that stops an admin pasting `javascript:` into an iframe.
 *
 * Companion to `learning-hub-seed-content.test.ts`, which guards the seed CONTENT; this file guards
 * the decisions taken over it.
 */

/* ── Gating ──────────────────────────────────────────────────────────────── */

/** A course's lessons in presentation order, as the gating query returns them. */
function lesson(id: number, quiz?: { id: number; passPct?: number; passed?: boolean | null }) {
  const row: CourseGatingRow = { lesson_id: id };
  if (quiz) {
    row.quiz_id = quiz.id;
    row.pass_pct = quiz.passPct ?? null;
    row.passed = quiz.passed ?? false;
  }
  return row;
}

describe('a course gates its lessons behind the quizzes before them', () => {
  it('locks every lesson after an unpassed quiz', () => {
    const gates = foldCourseGating([lesson(1, { id: 10, passed: false }), lesson(2), lesson(3)]);
    expect(gates.get(2)?.locked).toBe(true);
    expect(gates.get(3)?.locked).toBe(true);
  });

  it('leaves the lesson holding the unpassed quiz open, because that is the one to sit', () => {
    const gates = foldCourseGating([lesson(1, { id: 10, passed: false }), lesson(2)]);
    expect(gates.get(1)?.locked).toBe(false);
  });

  it('unlocks the rest of the course once the blocking quiz is passed', () => {
    const gates = foldCourseGating([
      lesson(1, { id: 10, passed: true }),
      lesson(2),
      lesson(3, { id: 30, passed: false }),
      lesson(4),
    ]);
    expect(gates.get(2)?.locked).toBe(false);
    expect(gates.get(3)?.locked).toBe(false);
    // The second quiz is still unpassed, so it blocks from where it sits.
    expect(gates.get(4)?.locked).toBe(true);
  });

  it('lets a lesson with no quiz pass the learner straight through', () => {
    const gates = foldCourseGating([lesson(1), lesson(2), lesson(3)]);
    expect([...gates.values()].every((g) => !g.locked)).toBe(true);
  });

  /* `passed` is null when the learner has never attempted the quiz, false when they have and
     failed. Neither is a pass, and treating null as "no opinion" would open the gate. */
  it('treats an absent or failed quiz result as not passed', () => {
    const gates = foldCourseGating([
      lesson(1, { id: 10, passed: null }),
      lesson(2),
      lesson(3, { id: 30, passed: false }),
    ]);
    expect(gates.get(1)?.quizPassed).toBe(false);
    expect(gates.get(2)?.locked).toBe(true);
    expect(gates.get(3)?.quizPassed).toBe(false);
  });

  it('applies the default pass mark to a quiz that sets none', () => {
    const gates = foldCourseGating([lesson(1, { id: 10 })]);
    expect(gates.get(1)?.passPct).toBe(DEFAULT_QUIZ_PASS_PCT);
  });
});

describe('a lesson with a quiz is only finished when the quiz is', () => {
  it('ignores a progress row on a lesson whose quiz is unpassed', () => {
    const gate = { hasQuiz: true, quizId: 10, passPct: 70, quizPassed: false, locked: false };
    expect(lessonProgressFlags(gate, true).completed).toBe(false);
  });

  it('counts a quiz lesson as finished on the pass alone', () => {
    const gate = { hasQuiz: true, quizId: 10, passPct: 70, quizPassed: true, locked: false };
    expect(lessonProgressFlags(gate, false).completed).toBe(true);
  });

  it('counts a lesson with no quiz as finished when it has a progress row', () => {
    const gate = { hasQuiz: false, quizId: null, passPct: 70, quizPassed: false, locked: false };
    expect(lessonProgressFlags(gate, true).completed).toBe(true);
    expect(lessonProgressFlags(gate, false).completed).toBe(false);
  });

  /* A lesson the gating query never returned (deleted mid-render, or a stale id) must not read as
     complete or as unlocked-with-a-quiz. */
  it('reports nothing for a lesson the gating query did not return', () => {
    expect(lessonProgressFlags(undefined, false)).toEqual({
      completed: false,
      has_quiz: false,
      quiz_passed: false,
      locked: false,
    });
  });
});

/* ── Grading ─────────────────────────────────────────────────────────────── */

/** Answer key: question id -> the id of its correct option. */
const KEY = new Map([
  [1, 101],
  [2, 201],
  [3, 301],
  [4, 401],
]);

/** Three of four right — 75%, the number both boundary tests hinge on. */
const THREE_OF_FOUR = [
  { questionId: 1, optionId: 101 },
  { questionId: 2, optionId: 201 },
  { questionId: 3, optionId: 301 },
  { questionId: 4, optionId: 402 },
];

describe('a quiz attempt is graded against the whole question set', () => {
  it('counts a question the learner skipped as wrong', () => {
    const attempt = gradeQuizAttempt(KEY, [{ questionId: 1, optionId: 101 }]);
    expect(attempt.total).toBe(4);
    expect(attempt.correctCount).toBe(1);
    expect(attempt.scorePct).toBe(25);
    expect(attempt.results.find((r) => r.questionId === 2)).toMatchObject({
      selectedOptionId: null,
      correct: false,
    });
  });

  it('ignores an answer for a question that is not on the quiz', () => {
    const attempt = gradeQuizAttempt(new Map([[1, 101]]), [
      { questionId: 1, optionId: 101 },
      { questionId: 99, optionId: 999 },
    ]);
    expect(attempt.total).toBe(1);
    expect(attempt.scorePct).toBe(100);
  });
});

describe('the pass mark is a floor, not a bar to clear', () => {
  it('passes an attempt that scores exactly pass_pct', () => {
    const attempt = gradeLessonQuizAttempt(KEY, THREE_OF_FOUR, 75);
    expect(attempt.scorePct).toBe(75);
    expect(attempt.passed).toBe(true);
  });

  it('fails an attempt one point short of pass_pct', () => {
    const attempt = gradeLessonQuizAttempt(KEY, THREE_OF_FOUR, 76);
    expect(attempt.scorePct).toBe(75);
    expect(attempt.passed).toBe(false);
  });

  it('reports back the pass mark it was graded against', () => {
    expect(gradeLessonQuizAttempt(KEY, THREE_OF_FOUR, 90).pass_pct).toBe(90);
  });
});

describe('a failed gating quiz does not hand back the answer key', () => {
  /* The gate is only real while this holds: returning correctOptionId on a failure let anyone
     submit blank, read the answers out of the response and resubmit. */
  it('returns no correct option on any question of a failed attempt', () => {
    const attempt = gradeLessonQuizAttempt(KEY, [{ questionId: 1, optionId: 999 }], 70);
    expect(attempt.passed).toBe(false);
    expect(attempt.results.map((r) => r.correctOptionId)).toEqual([null, null, null, null]);
  });

  it('leaks nothing through a blank submission either', () => {
    const attempt = gradeLessonQuizAttempt(KEY, [], 70);
    expect(attempt.scorePct).toBe(0);
    expect(JSON.stringify(attempt)).not.toContain('101');
  });

  it('still tells the learner which questions they got wrong', () => {
    const attempt = gradeLessonQuizAttempt(KEY, THREE_OF_FOUR, 90);
    expect(attempt.results.filter((r) => !r.correct).map((r) => r.questionId)).toEqual([4]);
  });

  it('releases the key once the attempt passes', () => {
    const attempt = gradeLessonQuizAttempt(KEY, THREE_OF_FOUR, 75);
    expect(attempt.passed).toBe(true);
    expect(attempt.results.map((r) => r.correctOptionId)).toEqual([101, 201, 301, 401]);
  });
});

/* ── Seed fingerprint ────────────────────────────────────────────────────── */

function seedTrack(): SeedTrack {
  return {
    key: 'sap',
    name: 'SAP',
    description: 'Training videos.',
    icon: 'layout-grid',
    color: '#1e6bb8',
    courses: [
      {
        title: 'SAP Training Videos',
        description: 'Walkthroughs.',
        status: 'published',
        modules: [
          {
            title: 'Master Data',
            lessons: [{ title: 'Create a vendor', body: 'Open XK01.' }],
          },
        ],
      },
    ],
  };
}

describe('the seed fingerprint decides whether a deploy rebuilds a track', () => {
  /* A rebuild deletes the track's courses, which cascades to every learner's progress in it. So a
     deploy that did not touch the content must produce the same hash, or it silently wipes people. */
  it('is unchanged by a deploy that did not touch the content', () => {
    expect(hashSeedTrack(seedTrack())).toBe(hashSeedTrack(seedTrack()));
  });

  it('changes when a lesson body is edited', () => {
    const edited = seedTrack();
    edited.courses[0].modules[0].lessons[0].body = 'Open XK01, then save.';
    expect(hashSeedTrack(edited)).not.toBe(hashSeedTrack(seedTrack()));
  });

  it('changes when a lesson video is pointed somewhere else', () => {
    const edited = seedTrack();
    edited.courses[0].modules[0].lessons[0].videoUrl = 'https://nesrcorp.sharepoint.com/a.mp4';
    expect(hashSeedTrack(edited)).not.toBe(hashSeedTrack(seedTrack()));
  });

  it('changes when a course is published', () => {
    const edited = seedTrack();
    edited.courses[0].status = 'draft';
    expect(hashSeedTrack(edited)).not.toBe(hashSeedTrack(seedTrack()));
  });

  it('changes when a lesson is added', () => {
    const edited = seedTrack();
    edited.courses[0].modules[0].lessons.push({ title: 'Block a vendor', body: 'Open XK05.' });
    expect(hashSeedTrack(edited)).not.toBe(hashSeedTrack(seedTrack()));
  });

  /* An optional field left off and the same field written as undefined are the same content, and
     JSON.stringify drops both — so this one incidental difference costs nobody their progress. */
  it('is unchanged by an optional field written as undefined', () => {
    const withUndefined = seedTrack();
    withUndefined.courses[0].modules[0].lessons[0].videoUrl = undefined;
    expect(hashSeedTrack(withUndefined)).toBe(hashSeedTrack(seedTrack()));
  });

  /* Documents a hazard rather than a nicety: the fingerprint is JSON.stringify, which is key-order
     sensitive, so re-typing a seed object's fields in a different order is a content change as far
     as the sync is concerned and rebuilds the track. Reorder seed fields only when you mean to. */
  it('changes when a track object is merely rewritten with its fields in another order', () => {
    const original = seedTrack();
    const sameFieldsDifferentOrder: SeedTrack = {
      name: original.name,
      key: original.key,
      icon: original.icon,
      color: original.color,
      description: original.description,
      courses: original.courses,
    };
    expect(hashSeedTrack(sameFieldsDifferentOrder)).not.toBe(hashSeedTrack(original));
  });
});

/* ── Video embeds ────────────────────────────────────────────────────────── */

describe('a lesson video may only come from an approved embed host', () => {
  it('rejects a javascript: URL', () => {
    expect(checkVideoUrl('javascript:alert(document.cookie)')).toEqual({
      ok: false,
      message: 'Video URL must use https.',
    });
  });

  it('rejects every other non-https scheme', () => {
    for (const url of [
      'http://nesrcorp.sharepoint.com/sites/x/video.mp4',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'vbscript:msgbox(1)',
    ]) {
      expect(checkVideoUrl(url).ok, url).toBe(false);
    }
  });

  it('rejects a host that only looks like an approved one', () => {
    for (const url of [
      'https://nesrcorp.sharepoint.com.attacker.example/v',
      'https://evil-sharepoint.com/v',
      'https://sharepoint.com.co/v',
    ]) {
      expect(checkVideoUrl(url).ok, url).toBe(false);
    }
  });

  it('accepts the corporate hosts the training videos actually live on', () => {
    expect(checkVideoUrl('https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/v.mp4')).toEqual({
      ok: true,
      value: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/v.mp4',
    });
    expect(checkVideoUrl('https://othertenant.microsoftstream.com/embed/x').ok).toBe(true);
  });

  /* A same-origin path is fine; `//host/...` is protocol-relative, i.e. off-origin, and must not
     be mistaken for one. */
  it('accepts a same-origin path but not a protocol-relative one', () => {
    expect(checkVideoUrl('/videos/intro.mp4')).toEqual({ ok: true, value: '/videos/intro.mp4' });
    expect(checkVideoUrl('//attacker.example/videos/intro.mp4').ok).toBe(false);
  });

  it('reads a blank value as no video rather than as an error', () => {
    expect(checkVideoUrl('   ')).toEqual({ ok: true, value: null });
    expect(checkVideoUrl(null)).toEqual({ ok: true, value: null });
    expect(checkVideoUrl(undefined)).toEqual({ ok: true, value: null });
  });

  it('stores the trimmed URL, so a stray space cannot break the embed', () => {
    expect(checkVideoUrl('  https://nesrcorp.sharepoint.com/v.mp4  ')).toEqual({
      ok: true,
      value: 'https://nesrcorp.sharepoint.com/v.mp4',
    });
  });
});

/* ── Reorder ─────────────────────────────────────────────────────────────── */

/** Siblings in display order, with the gapped order_index values a real table accumulates. */
const SIBLINGS = [
  { id: 7, order_index: 0 },
  { id: 3, order_index: 5 },
  { id: 9, order_index: 6 },
];

describe('reordering swaps two siblings and nothing else', () => {
  it('exchanges the two rows order_index values, gaps and all', () => {
    expect(planOrderSwap(SIBLINGS, 9, 'up')).toEqual({
      moved: { id: 9, order_index: 5 },
      displaced: { id: 3, order_index: 6 },
    });
  });

  it('does nothing when the first item is moved up', () => {
    expect(planOrderSwap(SIBLINGS, 7, 'up')).toBeNull();
  });

  it('does nothing when the last item is moved down', () => {
    expect(planOrderSwap(SIBLINGS, 9, 'down')).toBeNull();
  });

  it('does nothing when the id is not one of the siblings', () => {
    expect(planOrderSwap(SIBLINGS, 404, 'down')).toBeNull();
  });
});

/* ── My Work bucketing ───────────────────────────────────────────────────── */

function myWorkCourse(partial: Partial<MyWorkCourse>): MyWorkCourse {
  return {
    track_key: 'sap',
    track_name: 'SAP',
    track_color: null,
    course_id: 1,
    course_title: 'Course',
    lesson_count: 0,
    completed_count: 0,
    progress_pct: 0,
    last_activity_at: null,
    ...partial,
  };
}

describe('My Work sorts every course into one of three columns', () => {
  const started = myWorkCourse({ course_id: 1, lesson_count: 4, completed_count: 2 });
  const finished = myWorkCourse({ course_id: 2, lesson_count: 4, completed_count: 4 });
  const untouched = myWorkCourse({ course_id: 3, lesson_count: 4, completed_count: 0 });
  const empty = myWorkCourse({ course_id: 4, lesson_count: 0, completed_count: 0 });

  const buckets = bucketMyWorkCourses([started, finished, untouched, empty]);

  it('puts a partly finished course in progress', () => {
    expect(buckets.inProgress.map((c) => c.course_id)).toEqual([1]);
  });

  it('puts a course with every lesson done in completed', () => {
    expect(buckets.completed.map((c) => c.course_id)).toEqual([2]);
  });

  /* An empty course has nothing to complete, so calling it done would report a hollow 100%. */
  it('does not call an empty course completed', () => {
    expect(buckets.completed.map((c) => c.course_id)).not.toContain(4);
    expect(buckets.notStarted.map((c) => c.course_id)).toEqual([3, 4]);
  });
});
