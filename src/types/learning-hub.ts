export type CourseStatus = 'draft' | 'published';

export interface LearningTrack {
  id: number;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
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
}

export interface ModuleOutline extends LearningModule {
  lessons: LessonOutline[];
  has_quiz: boolean;
}

export interface CourseDetailData {
  track: LearningTrack;
  course: LearningCourse;
  modules: ModuleOutline[];
  completed_count: number;
  lesson_count: number;
  progress_pct: number;
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

/* ── Knowledge checks (one optional quiz per module) ─────────────────── */

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

export interface QuizQuestionResult {
  questionId: number;
  selectedOptionId: number | null;
  correctOptionId: number;
  correct: boolean;
}

export interface QuizAttemptResult {
  total: number;
  correctCount: number;
  scorePct: number;
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
