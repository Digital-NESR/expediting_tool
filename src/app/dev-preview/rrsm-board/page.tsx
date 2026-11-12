/*
 * The RRSM monthly board, signed out, for development only.
 *
 * /rrsm is behind SSO and behind a per-country grant, and the board needs an open cycle with
 * lines in it — none of which exists yet. So the data here is a fixture, shaped on the Kuwait
 * workbook: one supplier with vehicles on a standing monthly rate, one with a security guard
 * billed by headcount, and lines spread across the stages so every state is on screen at once.
 *
 * `RrsmBoardClient` already takes its board as a prop, so nothing in the component needed a
 * preview-only seam to make this work.
 *
 * Dev-only twice over: `notFound()` removes it from a production build, and the `/dev-preview`
 * entry in src/proxy.ts is only added outside production.
 */
import { notFound } from 'next/navigation';
import type { BoardLine, RrsmBoard } from '@/app/actions/rrsm/cycle';
import RrsmBoardClient from '@/app/rrsm/RrsmBoardClient';

export const dynamic = 'force-dynamic';

function line(partial: Partial<BoardLine> & Pick<BoardLine, 'id' | 'description'>): BoardLine {
  return {
    serviceLineId: partial.id,
    assetRef: '',
    segment: 'NPS_CMT',
    costCenter: 'C501100201',
    serviceNumber: '310000000011',
    uom: 'month',
    onHire: true,
    days: 30,
    qty: 1,
    rate: 250,
    value: 250,
    stage: 'submitted',
    erpStatus: null,
    prNumber: '',
    poNumber: '',
    supplierInvoice: null,
    opsNote: '',
    previous: { qty: 1, rate: 250 },
    ...partial,
  } as BoardLine;
}

const BOARD: RrsmBoard = {
  country: { code: 'KW', name: 'Kuwait', currency: 'KWD', flag: '🇰🇼', live: true },
  /* Two, so the picker is drawn rather than the locked label. Swap to one to see the other. */
  available: [
    { code: 'KW', name: 'Kuwait', currency: 'KWD', flag: '🇰🇼', live: true },
    { code: 'AE', name: 'United Arab Emirates (UAE)', currency: 'AED', flag: '🇦🇪', live: true },
  ],
  canBuy: true,
  canValidate: true,
  isAdmin: true,
  cycle: {
    id: 1,
    period: '2026-11-01',
    opensOn: '2026-10-26',
    closesOn: '2026-11-25',
    status: 'open',
  },
  suggestedPeriod: '2026-12-01',
  suppliers: [
    {
      code: '1101066',
      name: 'Automak Automotive Co. KSC',
      paymentTerms: 'NT30',
      lines: [
        line({ id: 1, description: 'CMT-TOYOTA PRADO-22X51902', assetRef: '22X51902' }),
        line({
          id: 2,
          description: 'NISSAN URVAN HIGH ROOF 2021',
          assetRef: '21X87635',
          rate: 275,
          previous: { qty: 1, rate: 250 },
          opsNote: 'Rate renegotiated from 1 Nov',
        }),
        line({
          id: 3,
          description: 'GMC SIERRA CREW CAB 4X4',
          assetRef: '22X94644',
          rate: 675,
          stage: 'validated',
          prNumber: '1037006021',
          poNumber: '5200008560',
          erpStatus: 'pending_grn',
          supplierInvoice: 675,
        }),
        line({
          id: 4,
          description: 'TOYOTA COASTER 23X64609',
          assetRef: '23X64609',
          rate: 430,
          stage: 'validated',
          prNumber: '1037006053',
          poNumber: '5200008535',
          erpStatus: 'grn_completed',
          supplierInvoice: 455,
        }),
        line({
          id: 5,
          description: 'MITSUBISHI L200 — returned to depot',
          assetRef: '19X38963',
          onHire: false,
          qty: 0,
          days: 12,
          rate: 200,
          stage: 'returned',
          previous: { qty: 1, rate: 200 },
          opsNote: 'Off hire 12 Nov, awaiting buyer confirmation',
        }),
      ],
    },
    {
      code: '1103542',
      name: 'Palisade Security Services',
      paymentTerms: 'NT90',
      lines: [
        line({
          id: 6,
          description: 'MUD-SECURITY GUARD — 2 nos',
          segment: 'CPVEN MUD',
          costCenter: 'C543440101',
          serviceNumber: '330000000004',
          uom: 'headcount',
          qty: 2,
          days: null,
          rate: 410,
          previous: null,
        }),
        line({
          id: 7,
          description: 'MUD-STAFF HOUSE RENTAL',
          segment: 'CPVEN MUD',
          costCenter: 'C543440101',
          serviceNumber: '330000000001',
          qty: 1,
          rate: 390,
          stage: 'closed',
          prNumber: '1038004342',
          poNumber: '5200008499',
          erpStatus: 'grn_completed',
          supplierInvoice: 390,
          previous: { qty: 1, rate: 420 },
        }),
      ],
    },
  ],
};

export default function RrsmBoardPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <>
      <div className="bg-amber-50 px-5 py-2.5 text-[12.5px] text-amber-900">
        <b className="font-semibold uppercase tracking-widest">Development preview</b> · fixture
        data, not reachable in production. Rendered as somebody holding both roles, so both views
        are enabled.
      </div>
      <RrsmBoardClient board={BOARD} />
    </>
  );
}
