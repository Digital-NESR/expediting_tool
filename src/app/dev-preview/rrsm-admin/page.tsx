/*
 * The RRSM Countries & Team editor, signed out, for development only.
 *
 * /admin is behind SSO and behind a platform-admin check, so this screen could otherwise only
 * ship on the strength of a diff. The questions it answers are the ones a test cannot: whether a
 * country with nobody on it reads as a warning, whether nineteen rows of switches scan, and
 * whether the people chips wrap sensibly when a country has six.
 *
 * Dev-only twice over, the same as the other previews here: `notFound()` removes it from a
 * production build, and the `/dev-preview` entry in src/proxy.ts is only added outside production.
 *
 * The countries are REAL, read straight from rrsm_db so the list is the one the tool will draw.
 * The team is invented, because there is nobody appointed yet and an empty screen shows nothing.
 */
import { notFound } from 'next/navigation';
import type { QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { toCountryOption } from '@/lib/rrsm/access';
import type { RrsmCountryRow, RrsmTeamRow } from '@/app/actions/rrsm/admin';
import RrsmAdminClient from '@/app/admin/RrsmAdminClient';

export const dynamic = 'force-dynamic';

/** Enough shapes to see: a staffed live country, a staffed dark one, and the empty majority. */
const FIXTURE_TEAM: Omit<RrsmTeamRow, 'countryName'>[] = [
  {
    id: 1,
    email: 'a.buyer@nesr.com',
    name: 'Aisha Rahman',
    role: 'buyer',
    countryCode: 'AE',
    addedBy: 'admin@nesr.com',
    createdAt: '2026-11-12',
  },
  {
    id: 2,
    email: 'o.validator@nesr.com',
    name: 'Omar Haddad',
    role: 'ops',
    countryCode: 'AE',
    addedBy: 'admin@nesr.com',
    createdAt: '2026-11-12',
  },
  {
    id: 3,
    email: 'c.admin@nesr.com',
    name: 'Claire Dubois',
    role: 'admin',
    countryCode: 'AE',
    addedBy: 'admin@nesr.com',
    createdAt: '2026-11-12',
  },
  {
    id: 4,
    email: 'k.buyer@nesr.com',
    name: 'Khalid Al Mutairi',
    role: 'buyer',
    countryCode: 'KW',
    addedBy: 'admin@nesr.com',
    createdAt: '2026-11-12',
  },
  {
    id: 5,
    email: 'n.ops@nesr.com',
    name: 'Noura Al Sabah',
    role: 'ops',
    countryCode: 'KW',
    addedBy: 'admin@nesr.com',
    createdAt: '2026-11-12',
  },
  {
    id: 6,
    email: 's.buyer@nesr.com',
    name: 'Said Al Harthy',
    role: 'buyer',
    countryCode: 'OM',
    addedBy: 'admin@nesr.com',
    createdAt: '2026-11-12',
  },
];

export default async function RrsmAdminPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const { rows } = await rrsmPool.query<QueryResultRow>(
    `SELECT code, name, currency, flag, live FROM rrsm_countries ORDER BY sort_order, name`,
  );

  const staffed = new Map<string, number>();
  for (const t of FIXTURE_TEAM) staffed.set(t.countryCode, (staffed.get(t.countryCode) ?? 0) + 1);

  const countries: RrsmCountryRow[] = rows.map((r) => {
    const base = toCountryOption(r);
    return {
      ...base,
      /* AE forced live so the screen shows both states; nothing is written, this is the prop. */
      live: base.code === 'AE' ? true : base.live,
      users: staffed.get(base.code) ?? 0,
    };
  });

  const nameOf = new Map(countries.map((c) => [c.code, c.name]));
  const team: RrsmTeamRow[] = FIXTURE_TEAM.map((t) => ({
    ...t,
    countryName: nameOf.get(t.countryCode) ?? t.countryCode,
  }));

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-700">
            Development preview · not reachable in production
          </p>
          <p className="mt-1 text-[13px] text-amber-900">
            Countries are read from <code>rrsm_db</code>; the people are invented, and the buttons
            do nothing because there is no signed-in admin to act as.
          </p>
        </div>
        <RrsmAdminClient preview={{ countries, team }} />
      </div>
    </main>
  );
}
