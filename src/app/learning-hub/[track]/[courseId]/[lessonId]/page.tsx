import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProcureGuardUser } from '@/lib/auth';
import { getLessonDetail } from '@/app/actions/learning-hub';
import LessonViewerClient from './LessonViewerClient';

type PageProps = { params: Promise<{ track: string; courseId: string; lessonId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lessonId } = await params;
  return { title: `Lesson ${lessonId} | Learning Hub | NESR` };
}

export default async function LessonViewerPage({ params }: PageProps) {
  const { track, courseId, lessonId } = await params;
  const numericCourseId = Number(courseId);
  const numericLessonId = Number(lessonId);
  if (!Number.isInteger(numericCourseId) || numericCourseId <= 0) notFound();
  if (!Number.isInteger(numericLessonId) || numericLessonId <= 0) notFound();

  const user = await getProcureGuardUser();
  const userEmail = user?.email ?? '';
  const data = await getLessonDetail(track, numericCourseId, numericLessonId, userEmail);
  if (!data) notFound();

  return <LessonViewerClient data={data} userEmail={userEmail} />;
}
