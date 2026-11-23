/*
 * The Recurrent services page on fixture data, for development only. `?as=requester` shows the
 * requester's own view. Buttons call real actions, which refuse without a session.
 *
 * Dev-only: notFound() in a production build.
 */
import { notFound } from 'next/navigation';
import RecurrentClient from '@/app/rrsm/RecurrentClient';
import { previewBoard } from './fixture';

export const dynamic = 'force-dynamic';

export default async function RecurrentPreview({
  searchParams,
}: {
  searchParams?: Promise<{ as?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const sp = searchParams ? await searchParams : {};
  return <RecurrentClient board={previewBoard(sp.as === 'requester')} />;
}
