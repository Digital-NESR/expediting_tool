import { getRrsmBoard } from '@/app/actions/rrsm/cycle';
import RrsmBoardClient from './RrsmBoardClient';

export const dynamic = 'force-dynamic';

export default async function RrsmPage({
  searchParams,
}: {
  /* `?country=` is what the picker navigates to, and what a bookmark carries. An admin holds
     every country, so without it the board would reopen on whichever one sorts first. */
  searchParams?: Promise<{ country?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const board = await getRrsmBoard(sp.country ?? null);
  return <RrsmBoardClient board={board} />;
}
