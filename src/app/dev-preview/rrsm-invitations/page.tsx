/*
 * The supplier invitation screen, on fixture data, for development only.
 *
 * It needs an open cycle with lines and links on it, which does not exist until a country goes
 * live. The fixture covers the four states that matter and that a chase turns on: never asked,
 * asked and waiting, already submitted, and a supplier with no address on file whose link Ops
 * have to pass on by hand.
 *
 * Dev-only twice over: notFound() in a production build, and /dev-preview is only in
 * PUBLIC_PATHS outside production.
 */
import { notFound } from 'next/navigation';
import type { InvitationBoard } from '@/app/actions/rrsm/invitations';
import InvitationsPanel from '@/app/rrsm/InvitationsPanel';

export const dynamic = 'force-dynamic';

const BOARD: InvitationBoard = {
  cycleId: 1,
  period: '2026-11-01',
  closesOn: '2026-11-25',
  countryName: 'Kuwait',
  canSend: true,
  configError: null,
  rows: [
    {
      supplierCode: '1101066',
      supplierName: 'Automak Automotive Co. KSC',
      contacts: ['ahmed@automak.com', 'accounts@automak.com'],
      lines: 5,
      awaiting: 5,
      url: 'https://sc.nesr.com/rrsm/submit/6f1a2b7c-1111-4a2b-9c3d-000000000001',
      sentAt: '2026-10-26',
      sentTo: ['ahmed@automak.com', 'accounts@automak.com'],
      submittedAt: null,
      requires: { deliveryNote: true, timesheet: true },
      documents: [{ id: 1, kind: 'delivery_note', fileName: 'DN-Nov.pdf' }],
      remindedAt: '2026-11-21',
      reminders: 2,
    },
    {
      supplierCode: '1103542',
      supplierName: 'Palisade Security Services',
      contacts: ['ops@palisade.com.kw'],
      lines: 2,
      awaiting: 0,
      url: 'https://sc.nesr.com/rrsm/submit/6f1a2b7c-2222-4a2b-9c3d-000000000002',
      sentAt: '2026-10-26',
      sentTo: ['ops@palisade.com.kw'],
      submittedAt: '2026-11-03',
      requires: { deliveryNote: true, timesheet: false },
      documents: [{ id: 2, kind: 'delivery_note', fileName: 'Palisade-DN.pdf' }],
      remindedAt: null,
      reminders: 0,
    },
    {
      supplierCode: '1102721',
      supplierName: 'KCA Global General Trading',
      contacts: ['invoices@kcaglobal.com'],
      lines: 4,
      awaiting: 4,
      url: null,
      sentAt: null,
      sentTo: [],
      submittedAt: null,
      requires: { deliveryNote: false, timesheet: false },
      documents: [],
      remindedAt: null,
      reminders: 0,
    },
    {
      supplierCode: '1103573',
      supplierName: 'Terrace Hotel Apartments',
      contacts: [],
      lines: 1,
      awaiting: 1,
      url: 'https://sc.nesr.com/rrsm/submit/6f1a2b7c-4444-4a2b-9c3d-000000000004',
      sentAt: null,
      sentTo: [],
      submittedAt: null,
      requires: { deliveryNote: true, timesheet: true },
      documents: [],
      remindedAt: null,
      reminders: 0,
    },
  ],
};

export default function RrsmInvitationsPreview() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="bg-amber-50 px-5 py-2.5 text-[12.5px] text-amber-900">
        <b className="font-semibold uppercase tracking-widest">Development preview</b> · fixture
        data, buttons inert.
      </div>
      <div className="mx-auto max-w-[1100px] px-4 py-8">
        <InvitationsPanel countryCode="KW" preview={BOARD} />
      </div>
    </main>
  );
}
