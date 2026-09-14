import type { Metadata } from 'next';
import { getMyWorkData } from '@/lib/learning-hub-queries';
import MyWorkClient from './MyWorkClient';

export const metadata: Metadata = { title: 'My Work' };

export default async function MyWorkPage() {
  const data = await getMyWorkData();
  return <MyWorkClient data={data} />;
}
