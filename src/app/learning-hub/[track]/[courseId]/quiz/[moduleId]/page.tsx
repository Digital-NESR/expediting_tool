import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getModuleQuizPageData } from '@/app/actions/learning-hub';
import QuizClient from './QuizClient';

type PageProps = { params: Promise<{ track: string; courseId: string; moduleId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { moduleId } = await params;
  return { title: `Knowledge check ${moduleId} | Learning Hub | NESR` };
}

export default async function ModuleQuizPage({ params }: PageProps) {
  const { track, courseId, moduleId } = await params;
  const numericCourseId = Number(courseId);
  const numericModuleId = Number(moduleId);
  if (!Number.isInteger(numericCourseId) || numericCourseId <= 0) notFound();
  if (!Number.isInteger(numericModuleId) || numericModuleId <= 0) notFound();

  const data = await getModuleQuizPageData(track, numericCourseId, numericModuleId);
  if (!data) notFound();

  return <QuizClient data={data} />;
}
