import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTrackDetail, getTrackName } from '@/lib/learning-hub-queries';
import TrackCoursesClient from './TrackCoursesClient';

type PageProps = { params: Promise<{ track: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { track } = await params;
  const name = await getTrackName(track);
  return { title: name ?? track.replace(/_/g, ' ') };
}

export default async function TrackPage({ params }: PageProps) {
  const { track } = await params;
  const data = await getTrackDetail(track);
  if (!data) notFound();

  return <TrackCoursesClient data={data} />;
}
