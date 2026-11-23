import { getRecurrentBoard } from '@/app/actions/rrsm/recurrent';
import RecurrentClient from '../../RecurrentClient';

export const dynamic = 'force-dynamic';

/** Recurrent services: annual contracts, subscriptions and AMCs, and their renewals. */
export default async function RrsmRecurrentPage({
  searchParams,
}: {
  searchParams?: Promise<{ country?: string; service?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const board = await getRecurrentBoard(sp.country ?? null);
  const service = Number(sp.service);
  return <RecurrentClient board={board} openId={Number.isInteger(service) ? service : null} />;
}
