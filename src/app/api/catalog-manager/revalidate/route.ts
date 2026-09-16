import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

/**
 * Drops the cached PIR stat cards and facet lists so the catalogue reflects a fresh sync.
 *
 * `loadPirMeta` in the catalogue actions is cached under the tag `pir-catalog` with a one-hour
 * revalidate. Nothing in the codebase ever revalidated that tag, so after the nightly n8n job
 * reloaded `pir_catalog` the totals and dropdowns on screen could stay an hour out of date, and
 * a user watching for their import to appear had no way to tell the difference between a slow
 * sync and a stale cache. The n8n job should call this once its load has committed.
 *
 * Machine endpoint: n8n carries no session cookie, so this is exempted in `src/proxy.ts` and
 * authenticates itself with CRON_SECRET instead. Same contract as the ProcureGuard reminders
 * route, deliberately: `Authorization: Bearer <CRON_SECRET>`, never a query parameter, because
 * Vercel and intermediate proxies log full request URLs and a secret in a URL is a secret in a
 * log. With CRON_SECRET unset it refuses rather than failing open.
 */

export const dynamic = 'force-dynamic';

const TAG = 'pir-catalog';

/** Length-safe constant-time comparison. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    const allowUnauthenticated =
      process.env.NODE_ENV !== 'production' && process.env.ALLOW_UNAUTHENTICATED_CRON === 'true';
    if (!allowUnauthenticated) {
      return NextResponse.json({ error: 'Cron secret not configured.' }, { status: 503 });
    }
  } else {
    const auth = req.headers.get('authorization') ?? '';
    const provided = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
    if (!provided || !secretsMatch(provided, secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  /* `{ expire: 0 }` rather than the generally recommended "max": that would keep serving the
     pre-sync figures while a revalidation ran in the background, which is the opposite of what
     this call is for. The cost is that the first request after a sync blocks on one query, once
     a night. Next 16 requires the second argument; the single-argument form is deprecated. */
  revalidateTag(TAG, { expire: 0 });
  return NextResponse.json({ revalidated: TAG });
}

/* POST is the honest verb for something with a side effect, and it is what n8n's HTTP node
   sends by default. GET is accepted too so the endpoint can be checked from a browser or curl
   during setup; revalidating a cache tag is idempotent, so nothing is at risk either way. */
export const POST = handle;
export const GET = handle;
