import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCourseDetail, getCourseTabTitle } from '@/lib/learning-hub-queries';
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

  const data = await getCourseDetail(track, numericId);
  if (!data) notFound();

  return <CourseDetailClient data={data} />;
}
