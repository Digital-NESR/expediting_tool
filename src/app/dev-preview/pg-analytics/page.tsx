/*
 * The ProcureGuard analytics page, for development only.
 *
 * The real one is behind SSO and an analytics-permission check, so this is the only way to see
 * the filter bar actually filter. The rows below are invented; the component is the real one and
 * every card, table and chart on it is computed from them by the same code that runs in
 * production.
 */
import { notFound } from 'next/navigation';
import AnalyticsClient from '@/app/procure-guard/analytics/AnalyticsClient';
import type { ProcureGuardAnalyticsData, ProcureGuardAnalyticsRequest } from '@/types/procureGuard';

const VENDORS = [
  'Stewart & Stevenson Manufacturing',
  'Halliburton Worldwide',
  'Gulf Technical Services',
  'Kuwait Industrial Supplies',
  'SARL SAKER AMN',
  'Aramex Muscat LLC',
];
const COUNTRIES = ['Saudi Arabia (KSA)', 'Oman', 'Kuwait', 'Egypt', 'Algeria'];
const STATUSES = [
  'Submitted',
  'Approved by Country Controller',
  'Approved by Supply Chain Director',
  'Approved by Treasury Director',
  'Approved',
  'Rejected',
];
const PRIORITIES = ['Normal', 'High', 'Urgent'];
const REQUESTERS = [
  ['svijayaraj@nesr.com', 'Senthil Vijayaraj'],
  ['ialmostafa@nesr.com', 'Ibtihal Mostafa'],
  ['jguerrero@nesr.com', 'Joana Guerrero'],
  ['shamed@nesr.com', 'Sultan Hamed'],
];

/* Spread across ~5 months so the date presets have something to bite on, and deterministic so
   two loads of this page show the same numbers. */
const REQUESTS: ProcureGuardAnalyticsRequest[] = Array.from({ length: 48 }, (_, i) => {
  const daysAgo = Math.floor((i * 157) % 150);
  const created = new Date(Date.now() - daysAgo * 86_400_000);
  const amount = [1200, 7421, 31171, 69214, 136850, 211425, 542550, 685000][i % 8];
  const [email, name] = REQUESTERS[i % REQUESTERS.length];
  const status = STATUSES[i % STATUSES.length];
  return {
    id: i + 1,
    request_type: i % 3 === 0 ? 'adhoc' : 'advance',
    reference_number: `${i % 3 === 0 ? 'ADH' : 'ADV'}-${String(i + 1).padStart(6, '0')}`,
    vendor_name: VENDORS[i % VENDORS.length],
    status,
    requested_by_email: email,
    requested_by_name: name,
    amount,
    amount_usd: amount,
    currency: 'USD',
    created_at: created.toISOString(),
    priority: PRIORITIES[i % PRIORITIES.length],
    country: COUNTRIES[i % COUNTRIES.length],
    reviewed_at: i % 4 === 0 ? new Date(created.getTime() + 2 * 86_400_000).toISOString() : null,
    spend_value_usd: null,
  } as ProcureGuardAnalyticsRequest;
});

/* Only the fields the embedded view reads. The rest of ProcureGuardAnalyticsData is computed on
   the client from `requests`, which is the whole point of the change this previews. */
const DATA = {
  requests: REQUESTS,
  generated_at: new Date().toISOString(),
  stats: { pending_review: 12 },
  actor: { permissions: { accessView: 'all' } },
  review_duration_metrics: [],
} as unknown as ProcureGuardAnalyticsData;

export default function ProcureGuardAnalyticsPreview() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-[1320px]">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
          Development preview — invented rows
        </p>
        <AnalyticsClient data={DATA} embedded />
      </div>
    </main>
  );
}
