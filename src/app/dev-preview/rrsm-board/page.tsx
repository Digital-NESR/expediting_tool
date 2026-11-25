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
import PreviewPrLink from './PreviewPrLink';

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
    grNumber: '',
    opsNote: '',
    previous: { qty: 1, rate: 250 },
    supplierRate: null,
    supplierUom: null,
    changeStatus: null,
    prAuto: null,
    opsValidator: null,
    opsSentAt: null,
    returnedTo: null,
    returnReason: '',
    returnedBy: '',
    ...partial,
  } as BoardLine;
}

const SARA = { email: 'sara.ops@example.invalid', name: 'Sara Ops' };
const OMAR = { email: 'omar.field@example.invalid', name: 'Omar Field' };

const BOARD: RrsmBoard = {
  country: {
    code: 'KW',
    name: 'Kuwait',
    currency: 'KWD',
    flag: '🇰🇼',
    live: true,
    supplierValidation: true,
    opsValidation: true,
    rentalsEnabled: true,
    recurrentEnabled: false,
    recurrentReminders: false,
  },
  /* Two, so the picker is drawn rather than the locked label. Swap to one to see the other. */
  available: [
    {
      code: 'KW',
      name: 'Kuwait',
      currency: 'KWD',
      flag: '🇰🇼',
      live: true,
      supplierValidation: true,
      opsValidation: true,
      rentalsEnabled: true,
      recurrentEnabled: false,
      recurrentReminders: false,
    },
    {
      code: 'AE',
      name: 'United Arab Emirates (UAE)',
      currency: 'AED',
      flag: '🇦🇪',
      live: true,
      supplierValidation: true,
      opsValidation: true,
      rentalsEnabled: true,
      recurrentEnabled: false,
      recurrentReminders: false,
    },
  ],
  canBuy: true,
  canValidate: true,
  isAdmin: true,
  viewerEmail: SARA.email,
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
      requires: { deliveryNote: true, timesheet: true, invoice: true },
      documents: [{ id: 1, kind: 'delivery_note', fileName: 'DN-Nov.pdf' }],
      lines: [
        line({
          id: 1,
          description: 'CMT-TOYOTA PRADO-22X51902',
          assetRef: '22X51902',
          prNumber: '1037006100',
          prAuto: 'only',
          opsValidator: SARA,
          opsSentAt: '2026-11-24T08:00:00Z',
        }),
        line({
          id: 2,
          description: 'NISSAN URVAN HIGH ROOF 2021',
          assetRef: '21X87635',
          prNumber: '1037006101',
          prAuto: 'exact',
          rate: 275,
          previous: { qty: 1, rate: 250 },
          opsNote: 'Rate renegotiated from 1 Nov',
          supplierRate: 290,
          supplierUom: 'day',
          changeStatus: 'pending',
          opsValidator: SARA,
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
          opsValidator: OMAR,
          returnedTo: 'buyer',
          returnReason: 'Went back to the depot on 12 Nov. Supplier still charges the full month.',
          returnedBy: OMAR.email,
        }),
      ],
    },
    {
      code: '1103542',
      name: 'Palisade Security Services',
      paymentTerms: 'NT90',
      requires: { deliveryNote: false, timesheet: false, invoice: false },
      documents: [],
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
  /* One PO of each kind the live status can show; 5200008535 is left out to draw "not in SAP". */
  sap: {
    ok: true,
    loadedAt: '2026-11-18T11:17',
    pos: {
      '5200008560': {
        po: '5200008560',
        release: 'under_release',
        waitingWith: 'MKHATTAB',
        daysWaiting: 4,
        receipt: 'unapproved',
        value: 675,
        currency: 'KWD',
        createdOn: '2026-11-12',
        releasedOn: '',
        lastReceiptOn: '',
      },
      '5200008499': {
        po: '5200008499',
        release: 'released',
        waitingWith: null,
        daysWaiting: null,
        receipt: 'service_posted',
        value: 390,
        currency: 'KWD',
        createdOn: '2026-10-28',
        releasedOn: '2026-10-29',
        lastReceiptOn: '2026-11-14',
        grDocs: ['5300008200'],
      },
    },
    prs: {
      '1037006021': {
        pr: '1037006021',
        release: 'released',
        converted: true,
        waitingWith: null,
        daysWaiting: null,
        convertedOn: '2026-11-10',
        pos: ['5200008560'],
      },
      '1037006053': {
        pr: '1037006053',
        release: 'under_release',
        converted: false,
        waitingWith: 'MSALAH1',
        daysWaiting: 2,
        convertedOn: '',
        pos: [],
      },
      '1037006100': {
        pr: '1037006100',
        release: 'released',
        converted: true,
        waitingWith: null,
        daysWaiting: null,
        convertedOn: '2026-11-17',
        pos: [],
      },
      '1037006101': {
        pr: '1037006101',
        release: 'released',
        converted: false,
        waitingWith: null,
        daysWaiting: null,
        convertedOn: '',
        pos: [],
      },
    },
  },
};

export default async function RrsmBoardPreviewPage({
  searchParams,
}: {
  /* `?view=buyer` renders /rrsm/purchasing; anything else renders /rrsm/validation.
     `?as=validator` shows Ops validation as Sara sees it: only the lines sent to her.
     `?empty=1` is PR & PO before the month is opened; `?link=1` has the PR link dialog open. */
  searchParams?: Promise<{ view?: string; as?: string; empty?: string; link?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const sp = searchParams ? await searchParams : {};

  if (sp.empty) {
    return (
      <RrsmBoardClient
        board={{
          ...BOARD,
          available: [BOARD.available[0]],
          cycle: null,
          suppliers: [],
          suggestedPeriod: '2026-11-01',
        }}
        view="buyer"
      />
    );
  }

  if (sp.link) {
    const line = BOARD.suppliers[1].lines[0];
    return (
      <>
        <RrsmBoardClient board={BOARD} view="buyer" />
        <PreviewPrLink
          line={line}
          supplierName={BOARD.suppliers[1].name}
          suggestions={{
            candidates: [
              {
                pr: '1038004391',
                pos: ['5200008611'],
                value: 820,
                currency: 'KWD',
                createdOn: '2026-11-03',
                description: 'SECURITY GUARD SERVICES NOV-26',
              },
              {
                pr: '1038004372',
                pos: ['5200008590'],
                value: 410,
                currency: 'KWD',
                createdOn: '2026-10-29',
                description: 'SECURITY GUARD - 1 NOS',
              },
              {
                pr: '1038004342',
                pos: ['5200008499'],
                value: 390,
                currency: 'KWD',
                createdOn: '2026-10-28',
                description: 'STAFF HOUSE RENTAL NOV-26',
              },
            ],
            usedOnLines: { '1038004342': 1 },
          }}
        />
      </>
    );
  }

  if (sp.as === 'validator') {
    const mine: RrsmBoard = {
      ...BOARD,
      available: [BOARD.available[0]],
      canBuy: false,
      isAdmin: false,
      suppliers: BOARD.suppliers
        .map((s) => ({
          ...s,
          lines: s.lines.filter((l) => l.opsSentAt && l.opsValidator?.email === SARA.email),
        }))
        .filter((s) => s.lines.length),
    };
    return <RrsmBoardClient board={mine} view="ops" />;
  }

  /* No banner above the board: the shell's sticky header and pinned sidebar are what is being
     checked, and a strip above them would offset both. The fixture data says what this is. */
  return <RrsmBoardClient board={BOARD} view={sp.view === 'buyer' ? 'buyer' : 'ops'} />;
}
