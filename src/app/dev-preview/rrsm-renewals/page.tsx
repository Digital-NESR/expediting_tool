/*
 * The annual renewals screen, on fixture data, for development only.
 *
 * It needs contracts with end dates inside the 90-day window, which do not exist until a
 * register is loaded. The fixture covers the cases the screen is shaped around: something
 * overdue, something urgent, a line that has gone unused for a year, and one already decided.
 *
 * Dev-only twice over: notFound() in a production build, and /dev-preview is only in
 * PUBLIC_PATHS outside production.
 */
import { notFound } from 'next/navigation';
import type { RenewalBoard } from '@/app/actions/rrsm/renewals';
import RenewalsPanel from '@/app/rrsm/RenewalsPanel';

export const dynamic = 'force-dynamic';

/* Dates are relative to today so the preview keeps showing the states it is meant to show
   rather than drifting into "all overdue" after a fortnight. */
const day = 86_400_000;
const iso = (offset: number) => new Date(Date.now() + offset * day).toISOString().slice(0, 10);

const BOARD: RenewalBoard = {
  countryName: 'Kuwait',
  currency: 'KWD',
  canDecide: true,
  rows: [
    {
      id: 1,
      serviceLineId: 11,
      description: 'Crane 50T — long term hire',
      assetRef: 'CR-50-01',
      segment: 'CPVEN_CT',
      supplierName: 'SMG Heavy Equipment',
      supplierCode: '1104410',
      uom: 'month',
      rate: 40000,
      currency: '',
      dueOn: iso(-9),
      status: 'pending',
      monthsUsed: 12,
      qtyTotal: 12,
      requesterEmail: 'k.almutairi@nesr.com',
      ownerEmail: 'ops.kw@nesr.com',
      decidedBy: '',
      decidedAt: '',
      note: '',
      extendsTo: '',
      remindersSent: [90, 60, 30, 14, 7],
    },
    {
      id: 2,
      serviceLineId: 12,
      description: 'MUD-STAFF HOUSE RENTAL',
      assetRef: '',
      segment: 'CPVEN MUD',
      supplierName: 'Terrace Hotel Apartments',
      supplierCode: '1103573',
      uom: 'month',
      rate: 390,
      currency: '',
      dueOn: iso(11),
      status: 'pending',
      monthsUsed: 12,
      qtyTotal: 12,
      requesterEmail: 'n.alsabah@nesr.com',
      ownerEmail: '',
      decidedBy: '',
      decidedAt: '',
      note: '',
      extendsTo: '',
      remindersSent: [90, 60, 30],
    },
    {
      id: 3,
      serviceLineId: 13,
      description: 'MUD-GPS TRACKING DEVICE',
      assetRef: '',
      segment: 'CPVEN MUD',
      supplierName: 'KCA Global General Trading',
      supplierCode: '1102721',
      uom: 'unit',
      rate: 14.5,
      currency: '',
      dueOn: iso(47),
      status: 'pending',
      monthsUsed: 0,
      qtyTotal: 0,
      requesterEmail: 'k.almutairi@nesr.com',
      ownerEmail: '',
      decidedBy: '',
      decidedAt: '',
      note: '',
      extendsTo: '',
      remindersSent: [90],
    },
    {
      id: 4,
      serviceLineId: 14,
      description: 'CT-TOYOTA PRADO -23X70474',
      assetRef: '23X70474',
      segment: 'NPS_CMT',
      supplierName: 'Automak Automotive Co. KSC',
      supplierCode: '1101066',
      uom: 'month',
      rate: 305,
      currency: '',
      dueOn: iso(63),
      status: 'extended',
      monthsUsed: 11,
      qtyTotal: 11,
      requesterEmail: '',
      ownerEmail: '',
      decidedBy: 'buyer.kw@nesr.com',
      decidedAt: iso(-3),
      note: 'Rate held at 305. Fleet review in Q2 may replace this with a newer model.',
      extendsTo: iso(63 + 365),
      remindersSent: [90],
    },
  ],
};

export default function RrsmRenewalsPreview() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="bg-amber-50 px-5 py-2.5 text-[12.5px] text-amber-900">
        <b className="font-semibold uppercase tracking-widest">Development preview</b> · fixture
        data, buttons inert.
      </div>
      <div className="mx-auto max-w-[1100px] px-4 py-8">
        <RenewalsPanel countryCode="KW" preview={BOARD} />
      </div>
    </main>
  );
}
