import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, Circle, PlayCircle } from 'lucide-react';
import { getMyWorkData } from '@/lib/learning-hub-queries';
import LearningHubShell from '../components/LearningHubShell';
import LearningHubHero from '../components/LearningHubHero';
import type { MyWorkCourse } from '@/types/learning-hub';
import { DEFAULT_TRACK_COLOR } from '@/lib/learning-hub-display';

export const metadata: Metadata = { title: 'My Work' };

function CourseRow({ course }: { course: MyWorkCourse }) {
  const color = course.track_color || DEFAULT_TRACK_COLOR;
  return (
    <Link
      href={`/learning-hub/${course.track_key}/${course.course_id}`}
      className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>
          {course.track_name}
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
          {course.course_title}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {course.completed_count} / {course.lesson_count} lessons
        </p>
      </div>
      <div className="w-28 shrink-0">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full"
            style={{ width: `${course.progress_pct}%`, background: color }}
          />
        </div>
        <p className="mt-1 text-right text-xs font-semibold" style={{ color }}>
          {course.progress_pct}%
        </p>
      </div>
    </Link>
  );
}

function Section({
  title,
  icon,
  courses,
  emptyLabel,
}: {
  title: string;
  icon: React.ReactNode;
  courses: MyWorkCourse[];
  emptyLabel: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
        {icon}
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        <span className="ml-auto text-xs font-medium text-slate-400">{courses.length}</span>
      </div>
      {courses.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {courses.map((c) => (
            <CourseRow key={`${c.track_key}-${c.course_id}`} course={c} />
          ))}
        </div>
      )}
    </div>
  );
}

export default async function MyWorkPage() {
  const data = await getMyWorkData();

  return (
    <LearningHubShell
      backHref="/learning-hub"
      title={<span className="text-sm font-semibold text-slate-900">My Work</span>}
      mainClassName="max-w-[900px] py-6"
    >
      <LearningHubHero
        title="My Work"
        subtitle="Track your progress across every course, in every track."
      />

      <div className="space-y-5">
        <Section
          title="In Progress"
          icon={<PlayCircle className="h-4 w-4 text-[#307c4c]" />}
          courses={data.inProgress}
          emptyLabel="Nothing in progress right now."
        />
        <Section
          title="Completed"
          icon={<CheckCircle2 className="h-4 w-4 text-[#307c4c]" />}
          courses={data.completed}
          emptyLabel="No courses completed yet."
        />
        <Section
          title="Not Started"
          icon={<Circle className="h-4 w-4 text-slate-300" />}
          courses={data.notStarted}
          emptyLabel="You've started every available course."
        />
      </div>
    </LearningHubShell>
  );
}
