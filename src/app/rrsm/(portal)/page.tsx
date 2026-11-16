/*
 * Inside the (portal) route group so that `/rrsm/submit/[token]` can live outside it.
 *
 * The layout beside this file redirects anyone without an RRSM grant, which is right for the
 * staff screens and fatal for the supplier one: a supplier has no NESR account at all and would
 * be bounced to /login by a gate meant to protect the board. A route group keeps the URL the
 * same and the layout off the supplier route.
 */
import { getRrsmBoard } from '@/app/actions/rrsm/cycle';
import RrsmBoardClient from '../RrsmBoardClient';

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
