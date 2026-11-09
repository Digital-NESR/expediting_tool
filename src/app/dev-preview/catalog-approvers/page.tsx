/*
 * The Catalog Repo country approver matrix, for development only.
 *
 * The real screen is behind SSO and behind an admin check, so this is the only way to look at it
 * before it ships. The rows below are made up; the component is the real one.
 */
import { notFound } from 'next/navigation';
import ApproverMatrix from '@/app/admin/CatalogApproverMatrixClient';

const CELLS = [
  {
    countryCode: 'DZ',
    countryName: 'Algeria',
    email: 'someone@nesr.com',
    name: 'A Name',
    seeded: true,
  },
  { countryCode: 'CG', countryName: 'Congo', email: null, name: null, seeded: false },
  {
    countryCode: 'EG',
    countryName: 'Egypt',
    email: 'another@nesr.com',
    name: 'Another Name',
    seeded: false,
  },
  { countryCode: 'OM', countryName: 'Oman', email: null, name: null, seeded: false },
  {
    countryCode: 'SA',
    countryName: 'Saudi Arabia (KSA)',
    email: 'third@nesr.com',
    name: 'A Third Name',
    seeded: true,
  },
  {
    countryCode: 'AE',
    countryName: 'United Arab Emirates',
    email: 'fourth@nesr.com',
    name: 'A Fourth Name',
    seeded: false,
  },
];

export default function CatalogApproverPreview() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-[1000px] rounded-2xl border border-slate-200 bg-white p-6">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
          Development preview — stub rows
        </p>
        <ApproverMatrix initialCells={CELLS} />
      </div>
    </main>
  );
}
