import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProcureGuardUser } from '@/lib/auth';
import { getCourseDetail, getCourseTabTitle } from '@/app/actions/learning-hub';
import CourseDetailClient from './CourseDetailClient';

type PageProps = { params: Promise<{ track: string; courseId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { track, courseId } = await params;
  const title = await getCourseTabTitle(track, Number(courseId));
  return { title: title ?? 'Course' };
}

export default async function CourseDetailPage({ params }: PageProps) {
  const { track, courseId } = await params;
  const numericId = Number(courseId);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const user = await getProcureGuardUser();
  const data = await getCourseDetail(track, numericId, user?.email ?? '');
  if (!data) notFound();

  return <CourseDetailClient data={data} />;
}
