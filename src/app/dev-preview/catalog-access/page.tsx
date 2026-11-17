/*
 * The Catalog Repo access gate, signed out, for development only.
 *
 * The gate is the one screen in this tool that is, by definition, only ever seen by people who
 * cannot reach the tool — so it cannot be checked by opening the tool. Dev-only twice over:
 * `notFound()` removes it from a production build, and the `/dev-preview` entry in src/proxy.ts
 * is only added outside production.
 */
import { notFound } from 'next/navigation';
import CatalogAccessGateClient from '@/app/catalog-manager/CatalogAccessGateClient';
import type { CatalogAccessRequestRow } from '@/types/catalog-manager';

const COUNTRIES = [
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'DZ', name: 'Algeria', flag: '🇩🇿' },
  { code: 'EG', name: 'Egypt', flag: '🇪🇬' },
  { code: 'IQ', name: 'Iraq', flag: '🇮🇶' },
  { code: 'KW', name: 'Kuwait', flag: '🇰🇼' },
  { code: 'OM', name: 'Oman', flag: '🇴🇲' },
  { code: 'QA', name: 'Qatar', flag: '🇶🇦' },
  { code: 'SA', name: 'Saudi Arabia (KSA)', flag: '🇸🇦' },
];

const REQUEST = (over: Partial<CatalogAccessRequestRow>): CatalogAccessRequestRow => ({
  user_email: 'someone@nesr.com',
  display_name: 'Someone',
  job_title: 'Buyer',
  country_code: 'OM',
  requested_countries: ['OM', 'KW'],
  approved_countries: [],
  status: 'Pending',
  requested_role: 'Contributor',
  approved_role: null,
  reason: null,
  requested_at: '2026-11-09T08:00:00.000Z',
  reviewed_at: null,
  reviewed_by: null,
  ...over,
});

export default async function CatalogAccessPreview({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { state } = await searchParams;

  const myRequest =
    state === 'pending'
      ? REQUEST({ status: 'Pending' })
      : state === 'rejected'
        ? REQUEST({ status: 'Rejected' })
        : state === 'revoked'
          ? REQUEST({ status: 'Revoked' })
          : null;

  return (
    <div>
      <div className="bg-amber-50 px-6 py-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
        Development preview — add ?state=pending | rejected | revoked
      </div>
      <CatalogAccessGateClient countries={COUNTRIES} myRequest={myRequest} />
    </div>
  );
}
