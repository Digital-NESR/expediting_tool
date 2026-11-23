/*
 * The Recurrent services dashboard on the same fixture board as /dev-preview/rrsm-recurrent.
 * Dev-only: notFound() in a production build.
 */
import { notFound } from 'next/navigation';
import RecurrentDashboardClient from '@/app/rrsm/RecurrentDashboardClient';
import { previewBoard } from '../rrsm-recurrent/fixture';

export const dynamic = 'force-dynamic';

export default async function RecurrentDashboardPreview() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <RecurrentDashboardClient board={previewBoard(false)} />;
}
