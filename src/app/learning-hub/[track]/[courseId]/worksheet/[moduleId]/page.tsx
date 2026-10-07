import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCourseDetail } from '@/lib/learning-hub-queries';
import { getWorksheetForModule } from '@/app/actions/learning-hub-worksheets';
import WorksheetClient from '../../../../components/WorksheetClient';

type PageProps = { params: Promise<{ track: string; courseId: string; moduleId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { moduleId } = await params;
  const view = await getWorksheetForModule(Number(moduleId));
  return { title: view ? `${view.worksheet.title} — worksheet` : 'Worksheet' };
}

/**
 * One release's worksheet.
 *
 * Addressed by module id rather than by worksheet key, because a release IS a module and the
 * learner arrives from the course outline. `getWorksheetForModule` resolves the module to a
 * definition by title, and returns null for a module with no worksheet — most of them.
 *
 * The course is loaded as well, and not only for the breadcrumb: `getCourseDetail` is what enforces
 * that a draft course is not readable by guessing an id, and the module has to belong to the course
 * in the URL or the page would happily render any module's worksheet under any course.
 */
export default async function WorksheetPage({ params }: PageProps) {
  const { track: trackKey, courseId, moduleId } = await params;
  const numericCourse = Number(courseId);
  const numericModule = Number(moduleId);
  if (!Number.isInteger(numericCourse) || !Number.isInteger(numericModule)) notFound();

  const [course, view] = await Promise.all([
    getCourseDetail(trackKey, numericCourse),
    getWorksheetForModule(numericModule),
  ]);
  if (!course || !view) notFound();
  if (!course.modules.some((m) => Number(m.id) === numericModule)) notFound();

  return (
    <WorksheetClient
      view={view}
      trackKey={course.track.key}
      trackName={course.track.name}
      courseId={course.course.id}
      courseTitle={course.course.title}
      color={course.track.color}
    />
  );
}
