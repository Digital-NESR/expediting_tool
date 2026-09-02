import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getRedBullLeaderboard } from '@/app/actions/learning-game';
import RedBullGameClient from './RedBullGameClient';

export const metadata: Metadata = { title: 'Red Bull Distribution Game | Learning Hub' };
export const dynamic = 'force-dynamic';

export default async function RedBullGamePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  // The Learning Hub layout already gates the whole /learning-hub subtree to ADMIN_EMAILS.
  // We still compute isAdmin here to pass the ?admin=1 flag into the game (it unlocks the
  // "Coming Soon" Team/Trainer modes), so this stays correct if the hub is opened up later.
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = adminEmails.includes(session.user.email.toLowerCase());

  const leaderboard = await getRedBullLeaderboard();

  return <RedBullGameClient isAdmin={isAdmin} initialLeaderboard={leaderboard} />;
}
