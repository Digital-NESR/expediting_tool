import { getRrsmBoard } from '@/app/actions/rrsm/cycle';
import RrsmBoardClient from '../../RrsmBoardClient';

export const dynamic = 'force-dynamic';

/** The buyer's half of the cycle: put validated lines on a PR and PO, then close them. */
export default async function RrsmPurchasingPage({
  searchParams,
}: {
  searchParams?: Promise<{ country?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const board = await getRrsmBoard(sp.country ?? null);
  return <RrsmBoardClient board={board} view="buyer" />;
}
