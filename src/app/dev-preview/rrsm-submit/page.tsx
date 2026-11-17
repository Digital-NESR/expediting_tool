/*
 * The supplier submission page, on fixture data, for development only.
 *
 * The real page needs a live link token, an open cycle and a code in somebody's inbox, so it
 * cannot be opened by hand until all three exist. This renders the two states that matter:
 * before verification, where a stranger holding a forwarded link must learn almost nothing, and
 * after it, where the supplier confirms the month.
 *
 * `?step=lines` shows the verified state. Nothing here touches the database, and the buttons do
 * nothing because there is no real link behind them.
 *
 * Dev-only twice over: notFound() in a production build, and /dev-preview is only in
 * PUBLIC_PATHS outside production.
 */
import { notFound } from 'next/navigation';
import type { SupplierView } from '@/app/actions/rrsm/supplier';
import SubmitClient from '@/app/rrsm/submit/[token]/SubmitClient';

export const dynamic = 'force-dynamic';

const BASE: SupplierView = {
  ok: true,
  supplierName: 'Automak Automotive Co. KSC',
  countryName: 'Kuwait',
  period: '2026-11-01',
  closesOn: '2026-11-25',
  accepting: true,
  alreadySubmitted: false,
  /* Already masked, as the real action returns them. Two that share a first letter, which is
     the case the mask was widened to three characters to handle. */
  contacts: ['ahm•••••@aut•••••.com', 'acc•••••@aut•••••.com'],
  verifiedAs: null,
  lines: [],
  codeTtlSeconds: 120,
};

const VERIFIED: SupplierView = {
  ...BASE,
  verifiedAs: 'ahmed@automak.com',
  lines: [
    {
      id: 1,
      description: 'CMT-TOYOTA PRADO-22X51902',
      assetRef: '22X51902',
      uom: 'month',
      onHire: true,
      days: 30,
      qty: 1,
      previousQty: 1,
      stage: 'awaiting_supplier',
      remarks: '',
    },
    {
      id: 2,
      description: 'NISSAN URVAN HIGH ROOF 2021',
      assetRef: '21X87635',
      uom: 'month',
      onHire: true,
      days: 30,
      qty: 1,
      previousQty: 1,
      stage: 'awaiting_supplier',
      remarks: '',
    },
    {
      id: 3,
      description: 'MITSUBISHI L200 — returned to depot',
      assetRef: '19X38963',
      uom: 'month',
      onHire: false,
      days: 12,
      qty: 0,
      previousQty: 1,
      stage: 'returned',
      remarks: 'Off hire on 12 November',
    },
    {
      id: 4,
      description: 'MUD-SECURITY GUARD — 2 nos',
      assetRef: '',
      uom: 'headcount',
      onHire: true,
      days: null,
      qty: 2,
      previousQty: null,
      stage: 'awaiting_supplier',
      remarks: '',
    },
  ],
};

export default async function RrsmSubmitPreview({
  searchParams,
}: {
  searchParams?: Promise<{ step?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const sp = searchParams ? await searchParams : {};
  const verified = sp.step === 'lines';

  return (
    <>
      <div className="bg-amber-50 px-5 py-2.5 text-[12.5px] text-amber-900">
        <b className="font-semibold uppercase tracking-widest">Development preview</b> · fixture
        data, buttons inert.{' '}
        <a className="underline" href={verified ? '?' : '?step=lines'}>
          {verified ? 'Show the sign-in step' : 'Show the verified step'}
        </a>
      </div>
      <SubmitClient
        token="00000000-0000-0000-0000-000000000000"
        initial={verified ? VERIFIED : BASE}
      />
    </>
  );
}
