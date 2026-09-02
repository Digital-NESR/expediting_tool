import type { Metadata } from 'next';
import { getProcureGuardUser } from '@/lib/auth';
import { getMyWorkData } from '@/app/actions/learning-hub';
import MyWorkClient from './MyWorkClient';

export const metadata: Metadata = { title: 'My Work' };

export default async function MyWorkPage() {
  const user = await getProcureGuardUser();
  const data = await getMyWorkData(user?.email ?? '');
  return <MyWorkClient data={data} />;
}
