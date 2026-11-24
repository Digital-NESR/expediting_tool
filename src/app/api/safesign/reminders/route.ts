import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
// From a plain module, not a 'use server' file, so the mass send is reachable only through the
// CRON_SECRET check below. Same arrangement as /api/rrsm/reminders.
import { runScheduledReminders } from '@/lib/safesign/delivery';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/*
 * SafeSign's daily supplier reminders. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 * With CRON_SECRET unset it refuses, unless ALLOW_UNAUTHENTICATED_CRON=true outside production.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    const allow = process.env.NODE_ENV !== 'production' && process.env.ALLOW_UNAUTHENTICATED_CRON === 'true';
    if (!allow) return NextResponse.json({ error: 'Cron secret not configured.' }, { status: 503 });
  } else {
    const auth = req.headers.get('authorization') ?? '';
    const provided = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!provided || !secretsMatch(provided, secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  try {
    return NextResponse.json({ ok: true, ...(await runScheduledReminders()) });
  } catch (err) {
    console.error('[api/safesign/reminders]', err);
    return NextResponse.json({ ok: false, error: 'Reminder run failed.' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
