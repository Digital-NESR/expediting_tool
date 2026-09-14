import type { Metadata } from 'next';
import { getLearningHubDashboardData } from '@/lib/learning-hub-queries';
import LearningHubDashboardClient from './LearningHubDashboardClient';

export const metadata: Metadata = { title: 'Learning Hub' };

export default async function LearningHubDashboardPage() {
  const data = await getLearningHubDashboardData();
  return <LearningHubDashboardClient data={data} />;
}
