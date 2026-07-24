import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProcureGuardUser } from '@/lib/auth';
import { getCourseDetail } from '@/app/actions/learning-hub';
import CourseDetailClient from './CourseDetailClient';

type PageProps = { params: Promise<{ track: string; courseId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { courseId } = await params;
  return { title: `Course ${courseId} | Learning Hub | NESR` };
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
