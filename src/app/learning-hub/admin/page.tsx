import type { Metadata } from 'next';
import { getLearningHubAdminData } from '@/app/actions/learning-hub';
import AdminClient from './AdminClient';

export const metadata: Metadata = { title: 'Admin | Learning Hub | NESR' };

export default async function LearningHubAdminPage() {
  const data = await getLearningHubAdminData();
  return <AdminClient data={data} />;
}
