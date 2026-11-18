import { getRrsmBoard } from '@/app/actions/rrsm/cycle';
import RrsmBoardClient from '../../RrsmBoardClient';

export const dynamic = 'force-dynamic';

/** Ops' half of the cycle: confirm what was used. */
export default async function RrsmValidationPage({
  searchParams,
}: {
  searchParams?: Promise<{ country?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const board = await getRrsmBoard(sp.country ?? null);
  return <RrsmBoardClient board={board} view="ops" />;
}
