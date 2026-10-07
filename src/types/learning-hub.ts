import type { RedBullGameStats } from '@/app/actions/learning-game';

export type CourseStatus = 'draft' | 'published';

export interface LearningTrack {
  id: number;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  order_index: number;
  /** Short prefix for the browser-tab label ("SC" -> "SC lvl 1"); null keeps the full course title. */
  tab_label_prefix: string | null;
  /**
   * False when learners may take this module's lessons in any order. Optional because the column
   * arrived in migration 003 and rows read by older code paths will not carry it; everywhere it is
   * read, anything but an explicit `false` means gated, which is what every track did before.
   */
  sequential_gating?: boolean;
  created_at: string;
  updated_at: string;
}

/** Minimal track shape the Learning Hub sidebar needs (loaded once in the layout). */
export interface LearningHubNavTrack {
  key: string;
  name: string;
  icon: string | null;
  course_count: number;
  lesson_count: number;
}

export interface LearningCourse {
  id: number;
  track_id: number;
  title: string;
  description: string | null;
  order_index: number;
  status: CourseStatus;
  created_at: string;
  updated_at: string;
}

export interface LearningModule {
  id: number;
  course_id: number;
  title: string;
  order_index: number;
  resource_label: string | null;
  resource_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface LearningLesson {
  id: number;
  module_id: number;
  title: string;
  body: string;
  video_url: string | null;
  duration_minutes: number | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

/* ── Composed view shapes returned by server actions ─────────────────── */

export interface TrackWithProgress extends LearningTrack {
  course_count: number;
  lesson_count: number;
  completed_count: number;
  progress_pct: number;
}

export interface LearningHubDashboardData {
  tracks: TrackWithProgress[];
  continueLesson: {
    track_key: string;
    course_id: number;
    lesson_id: number;
    course_title: string;
    lesson_title: string;
    track_name: string;
  } | null;
  totalLessons: number;
  totalCompleted: number;
}

export interface CourseWithProgress extends LearningCourse {
  lesson_count: number;
  completed_count: number;
  progress_pct: number;
}

export interface TrackDetailData {
  track: LearningTrack;
  courses: CourseWithProgress[];
}

export interface LessonOutline extends LearningLesson {
  completed: boolean;
  has_quiz: boolean;
  quiz_passed: boolean;
  locked: boolean;
}

/** The optional worksheet attached to a release, and where this learner has got to with it. */
export interface ModuleWorksheet {
  key: string;
  title: string;
  status: 'not_started' | 'draft' | 'submitted';
}

export interface ModuleOutline extends LearningModule {
  lessons: LessonOutline[];
  has_quiz: boolean;
  /** Null for a release with no worksheet, which is most of the hub. */
  worksheet: ModuleWorksheet | null;
}

export interface CourseDetailData {
  track: LearningTrack;
  course: LearningCourse;
  modules: ModuleOutline[];
  completed_count: number;
  lesson_count: number;
  progress_pct: number;
  /**
   * Every lesson finished, and every worksheet this course offers submitted.
   *
   * Two tiers on purpose. Worksheets are optional, so finishing the videos and quizzes is still
   * "Completed" and nobody who skips them is shown as unfinished; this is the second badge for
   * people who did the written work as well.
   */
  fully_complete: boolean;
  /** How many of this course's releases offer a worksheet, and how many are submitted. */
  worksheet_count: number;
  worksheets_submitted: number;
}

export interface LessonNavRef {
  lesson_id: number;
  course_id: number;
  title: string;
}

export interface LessonDetailData {
  track: LearningTrack;
  course: LearningCourse;
  lesson: LearningLesson;
  completed: boolean;
  prev: LessonNavRef | null;
  next: LessonNavRef | null;
  // Quiz gating: a lesson with a quiz must be passed (>= pass_pct) before the next unlocks.
  locked: boolean; // this lesson isn't accessible yet (an earlier quiz is unpassed)
  quiz: LessonQuiz | null; // the lesson's quiz (no answer key), when present and unlocked
  quiz_passed: boolean; // the current user has passed this lesson's quiz
  pass_pct: number; // pass threshold for this lesson's quiz
  next_locked: boolean; // the next lesson is currently locked
}

export interface LessonQuizOption {
  id: number;
  text: string;
}
export interface LessonQuizQuestion {
  id: number;
  text: string;
  options: LessonQuizOption[];
}
export interface LessonQuiz {
  id: number;
  title: string;
  pass_pct: number;
  questions: LessonQuizQuestion[];
}
/* ── Quiz attempt results ────────────────────────────────────────────────
   Both knowledge checks are graded server-side and report the same score, so the score and the
   per-question outcome are declared once here and the two attempt shapes add what only they
   have: a pass mark on the lesson gate, and an answer key that only it withholds. ── */

export interface QuizAttemptScore {
  total: number;
  correctCount: number;
  scorePct: number;
}

export interface QuizQuestionOutcome {
  questionId: number;
  selectedOptionId: number | null;
  correct: boolean;
}

export interface LessonQuizQuestionResult extends QuizQuestionOutcome {
  /**
   * Null until the learner passes. This quiz gates the next lesson, so returning the key on a
   * failed attempt let anyone submit blank, read the answers out of the response, and resubmit.
   * `correct` still comes back either way, so a learner always sees WHICH questions they got
   * wrong — just not what the right answer was until they have earned it.
   */
  correctOptionId: number | null;
}

export interface LessonQuizAttemptResult extends QuizAttemptScore {
  passed: boolean;
  pass_pct: number;
  results: LessonQuizQuestionResult[];
}

export interface MyWorkCourse {
  track_key: string;
  track_name: string;
  track_color: string | null;
  course_id: number;
  course_title: string;
  lesson_count: number;
  completed_count: number;
  progress_pct: number;
  last_activity_at: string | null;
}

export interface MyWorkData {
  inProgress: MyWorkCourse[];
  completed: MyWorkCourse[];
  notStarted: MyWorkCourse[];
}

/* ── Knowledge checks (one optional quiz per module) ──────────────────────
   These carry the same data as `LessonQuizOption` / `LessonQuizQuestion` above under different
   names: `option_text` and `question_text` here, `text` on both there. The names are set where
   the rows are shaped, in `src/lib/learning-hub-queries.ts`, so settling on one spelling means
   changing those loaders and every reader at once. ── */

export interface QuizOption {
  id: number;
  option_text: string;
  order_index: number;
}

export interface QuizOptionWithAnswer extends QuizOption {
  is_correct: boolean;
}

export interface QuizQuestion {
  id: number;
  question_text: string;
  order_index: number;
  options: QuizOption[];
}

export interface QuizQuestionWithAnswer {
  id: number;
  question_text: string;
  order_index: number;
  options: QuizOptionWithAnswer[];
}

export interface ModuleQuiz {
  id: number;
  module_id: number;
  title: string;
  questions: QuizQuestion[];
}

export interface ModuleQuizWithAnswers {
  id: number;
  module_id: number;
  title: string;
  questions: QuizQuestionWithAnswer[];
}

export interface QuizAnswerInput {
  questionId: number;
  optionId: number | null;
}

export interface QuizQuestionResult extends QuizQuestionOutcome {
  /** Always present: a module check gates nothing, so the key ships with every attempt. */
  correctOptionId: number;
}

export interface QuizAttemptResult extends QuizAttemptScore {
  results: QuizQuestionResult[];
}

export interface ModuleQuizPageData {
  track: LearningTrack;
  course: LearningCourse;
  module: LearningModule;
  quiz: ModuleQuiz;
}

/* ── Admin CMS shapes ─────────────────────────────────────────────────── */

export interface AdminModuleWithLessons extends LearningModule {
  lessons: LearningLesson[];
  has_quiz: boolean;
}

export interface AdminCourseWithModules extends LearningCourse {
  modules: AdminModuleWithLessons[];
}

export interface AdminTrackWithCourses extends LearningTrack {
  courses: AdminCourseWithModules[];
}

export interface LearningHubAdminData {
  tracks: AdminTrackWithCourses[];
}

/* ── Admin analytics shapes ───────────────────────────────────────────────
   These used to live in `src/app/actions/learning-hub.ts`. A `'use server'`
   module may only export async functions, so every type declared there is a
   footgun waiting for someone to export a value beside it. ── */

/**
 * One lesson's funnel: opened it, finished it, sat the quiz, passed the quiz.
 *
 * `viewers` and `completions` are the two ends of the same step and the gap between them is the
 * point. A lesson forty people open and six finish is a lesson with a problem, and counting only
 * the six hides it.
 */
export interface LhLessonAnalytics {
  id: number;
  title: string;
  moduleTitle: string;
  hasVideo: boolean;
  viewers: number; // distinct people who opened it
  completions: number; // distinct people who finished it
  quizTakers: number; // of its own lesson quiz, if it has one
  quizPassers: number;
  avgBestPct: number | null; // null when nobody has attempted it
}

/** One quiz's performance. `avgAttempts` is how many goes it took, which is the difficulty tell. */
export interface LhQuizAnalytics {
  id: number;
  title: string;
  scope: 'module' | 'lesson';
  questionCount: number;
  takers: number;
  passers: number;
  avgBestPct: number | null;
  avgAttempts: number | null;
}

export interface LhCourseAnalytics {
  id: number;
  title: string;
  status: string;
  lessonCount: number;
  viewers: number; // distinct users who opened any lesson in the course
  learners: number; // distinct users with any progress in the course
  completedLearners: number; // users who completed every lesson in the course
  lessonCompletions: number; // total lesson completions across users
  completionPct: number; // completedLearners / learners
  quizCount: number;
  quizTakers: number; // distinct people who sat any quiz in the course
  quizPassers: number; // distinct people who passed at least one
  avgBestPct: number | null; // mean best score across every result in the course
  lessons: LhLessonAnalytics[];
  quizzes: LhQuizAnalytics[];
}

/**
 * Where one person has got to in a module.
 *
 * `stage` is derived, not stored: it is the shortest honest answer to "where are they", and the
 * thresholds live in `learnerStage()` so the label and the numbers can never disagree.
 */
export interface LhLearnerRow {
  email: string;
  stage: 'Not started' | 'Browsing' | 'In progress' | 'Nearly there' | 'Completed';
  lessonsViewed: number;
  lessonsCompleted: number;
  lessonCount: number; // of the whole module, so the row carries its own denominator
  quizzesTaken: number;
  quizzesPassed: number;
  avgBestPct: number | null;
  lastActiveAt: string | null; // ISO; null for somebody with no recorded activity at all
  /** Per-course progress, in the module's own course order — the "journey" across levels. */
  courses: { id: number; title: string; done: number; total: number }[];
}

export interface LhTrackAnalytics {
  key: string;
  name: string;
  color: string | null;
  viewers: number;
  learners: number;
  lessonCount: number;
  lessonCompletions: number;
  completedLearners: number;
  quizTakers: number;
  quizPassers: number;
  avgBestPct: number | null;
  courses: LhCourseAnalytics[];
  learnerRows: LhLearnerRow[];
}

/** One week of hub-wide activity, for the trend strip. `week` is the Monday, as `YYYY-MM-DD`. */
export interface LhWeekPoint {
  week: string;
  started: number; // lessons opened for the first time
  completed: number;
}

export interface LearningHubAnalytics {
  overview: {
    viewers: number;
    learners: number;
    lessonCompletions: number;
    courseCompletions: number;
    trackCount: number;
    courseCount: number;
    lessonCount: number;
    quizCount: number;
    quizTakers: number;
    quizPassRate: number | null; // passers / takers, null when nobody has attempted one
  };
  /**
   * False when migration `002_lesson_views` has not run against this database. Every `viewers`
   * figure is then 0, which is indistinguishable from "nobody opened anything" — so the screen
   * says so rather than quietly reporting an empty funnel.
   */
  viewTracking: boolean;
  weekly: LhWeekPoint[];
  tracks: LhTrackAnalytics[];
  redBull: RedBullGameStats;
}
