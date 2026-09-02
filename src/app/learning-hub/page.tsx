import type { Metadata } from 'next';
import { getProcureGuardUser } from '@/lib/auth';
import { getLearningHubDashboardData } from '@/app/actions/learning-hub';
import LearningHubDashboardClient from './LearningHubDashboardClient';

export const metadata: Metadata = { title: 'Learning Hub' };

export default async function LearningHubDashboardPage() {
  const user = await getProcureGuardUser();
  const data = await getLearningHubDashboardData(user?.email ?? '');
  return <LearningHubDashboardClient data={data} />;
}
