import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getRedBullLeaderboard } from '@/app/actions/learning-game';
import RedBullGameClient from './RedBullGameClient';

export const metadata: Metadata = { title: 'Red Bull Distribution Game | Learning Hub' };
export const dynamic = 'force-dynamic';

export default async function RedBullGamePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  // isAdmin is still passed to the game as ?admin=1 (kept for forward-compat with the mode gating).
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = adminEmails.includes(session.user.email.toLowerCase());

  // An invite link lands here as /learning-hub/red-bull-game?code=XXXXX — pass it into the game
  // so the join box is pre-filled. Sanitised to the game's code alphabet.
  const sp = await searchParams;
  const codeParam = Array.isArray(sp.code) ? sp.code[0] : sp.code;
  const initialCode = codeParam
    ? codeParam.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || undefined
    : undefined;

  const leaderboard = await getRedBullLeaderboard();

  return (
    <RedBullGameClient isAdmin={isAdmin} initialLeaderboard={leaderboard} initialCode={initialCode} />
  );
}
