import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProcureGuardUser } from '@/lib/auth';
import { getTrackDetail, getTrackName } from '@/app/actions/learning-hub';
import TrackCoursesClient from './TrackCoursesClient';

type PageProps = { params: Promise<{ track: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { track } = await params;
  const name = await getTrackName(track);
  return { title: name ?? track.replace(/_/g, ' ') };
}

export default async function TrackPage({ params }: PageProps) {
  const { track } = await params;
  const user = await getProcureGuardUser();
  const data = await getTrackDetail(track, user?.email ?? '');
  if (!data) notFound();

  return <TrackCoursesClient data={data} />;
}
