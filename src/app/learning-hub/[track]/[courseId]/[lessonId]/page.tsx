import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLessonDetail, getLessonTitle } from '@/lib/learning-hub-queries';
import LessonViewerClient from './LessonViewerClient';

type PageProps = { params: Promise<{ track: string; courseId: string; lessonId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lessonId } = await params;
  const title = await getLessonTitle(Number(lessonId));
  return { title: title ?? 'Lesson' };
}

export default async function LessonViewerPage({ params }: PageProps) {
  const { track, courseId, lessonId } = await params;
  const numericCourseId = Number(courseId);
  const numericLessonId = Number(lessonId);
  if (!Number.isInteger(numericCourseId) || numericCourseId <= 0) notFound();
  if (!Number.isInteger(numericLessonId) || numericLessonId <= 0) notFound();

  const data = await getLessonDetail(track, numericCourseId, numericLessonId);
  if (!data) notFound();

  return <LessonViewerClient data={data} />;
}
