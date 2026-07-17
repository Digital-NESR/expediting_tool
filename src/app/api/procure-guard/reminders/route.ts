import { NextResponse } from 'next/server';
import { sendProcureGuardOpenRequestReminders } from '@/app/actions/procureGuard';

export const dynamic = 'force-dynamic';
// Reminders can iterate many requests + send webhooks; give it room beyond the default.
export const maxDuration = 60;

// Triggers the 7-day / 2-week "still awaiting your approval" reminder emails.
// Secured with CRON_SECRET: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically;
// a `?secret=<CRON_SECRET>` query param is also accepted for manual/n8n triggering. If CRON_SECRET
// is unset (e.g. local dev), the endpoint is open.
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get('authorization');
    const provided = new URL(req.url).searchParams.get('secret');
    if (auth !== `Bearer ${secret}` && provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await sendProcureGuardOpenRequestReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[api/procure-guard/reminders]', err);
    return NextResponse.json({ ok: false, error: 'Reminder run failed.' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
