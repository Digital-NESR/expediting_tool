import { getRecurrentBoard } from '@/app/actions/rrsm/recurrent';
import RecurrentClient from '../../RecurrentClient';

export const dynamic = 'force-dynamic';

/** Recurrent services: annual contracts, subscriptions and AMCs, and their renewals. */
export default async function RrsmRecurrentPage({
  searchParams,
}: {
  searchParams?: Promise<{ country?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const board = await getRecurrentBoard(sp.country ?? null);
  return <RecurrentClient board={board} />;
}
