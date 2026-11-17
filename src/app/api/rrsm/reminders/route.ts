import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
// Imported from a plain module, not from the `'use server'` actions file: an action export would
// also be a public POST endpoint, letting any signed-in user trigger the mass send below without
// the CRON_SECRET check. Same note, same reason, as /api/procure-guard/reminders.
import { sendRrsmRenewalReminders } from '@/lib/rrsm/reminders';

export const dynamic = 'force-dynamic';
// A digest per recipient plus a webhook call each; give it room beyond the default.
export const maxDuration = 60;

/** Length-safe constant-time string comparison. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/*
 * RRSM's daily renewal reminders.
 *
 * Secured with CRON_SECRET, supplied ONLY as `Authorization: Bearer <CRON_SECRET>` — exactly
 * what Vercel Cron sends. No `?secret=` form: Vercel and any intermediate proxy log full request
 * URLs, so a query-string secret ends up in plaintext logs. It does not fail open either: with
 * CRON_SECRET unset it refuses (503) unless ALLOW_UNAUTHENTICATED_CRON is explicitly set outside
 * production, which is how it can be exercised locally.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    const allowUnauthenticated =
      process.env.NODE_ENV !== 'production' && process.env.ALLOW_UNAUTHENTICATED_CRON === 'true';
    if (!allowUnauthenticated) {
      console.error('[api/rrsm/reminders] CRON_SECRET is not set; refusing to run.');
      return NextResponse.json({ error: 'Cron secret not configured.' }, { status: 503 });
    }
  } else {
    const auth = req.headers.get('authorization') ?? '';
    const provided = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
    if (!provided || !secretsMatch(provided, secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await sendRrsmRenewalReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[api/rrsm/reminders]', err);
    return NextResponse.json({ ok: false, error: 'Reminder run failed.' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
