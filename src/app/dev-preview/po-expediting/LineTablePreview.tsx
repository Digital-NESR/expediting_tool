'use client';

import { ClosedPoBadge, ResponseBadge } from '@/app/po-expediting/analytics/_components';

/**
 * The analytics drill-down line table, at the widths the real modals use.
 *
 * Built because two bugs in it were invisible to every check that runs locally: an 18-character
 * SAP material number painting straight over the Description column, and a goods-received PO
 * rendering as a row of dashes that reads as a rendering fault. Neither tsc nor vitest can see
 * either one. The values below are real shapes — a genuine 18-char material number, a
 * description long enough to need truncating, and a line whose PO has left SAP.
 */
const COLS = [
  { name: 'Line', width: 60 },
  { name: 'Buyer', width: 120 },
  { name: 'SAP MAT ID', width: 165 },
  { name: 'Description', width: undefined },
  { name: 'Open QTY', width: 80 },
  { name: 'Value (USD)', width: 100 },
  { name: 'Original Del. Date', width: 110 },
  { name: 'New Del. Date', width: 110 },
  { name: 'DS Status', width: 90 },
  { name: 'Supplier Comments', width: 150 },
  { name: 'Response', width: 100 },
];

interface Row {
  line: string;
  buyer: string;
  matId: string | null;
  description: string | null;
  qty: string;
  value: string;
  original: string;
  revised: string;
  ds: string;
  comments: string;
  responded: boolean;
}

const LIVE: Row[] = [
  {
    line: '00010',
    buyer: 'Farrah Mostafa',
    matId: '000001100000000108',
    description: 'SEAL POLYPAK MOTOR HR-480 INJECTOR ASSEMBLY, 3IN BORE',
    qty: '5',
    value: '$2,346',
    original: '28 Oct 2026',
    revised: '—',
    ds: 'DS05',
    comments: '—',
    responded: true,
  },
  {
    line: '00020',
    buyer: 'Kenneth Guan',
    matId: '000001100000094412',
    description: 'BEARING ROLLER TAPERED',
    qty: '12',
    value: '$880',
    original: '09 Oct 2026',
    revised: '21 Nov 2026',
    ds: 'DS04',
    comments: 'Shipping week 47',
    responded: true,
  },
];

/* A PO that has left SAP and predates the snapshot: nothing survives but the line number. */
const LOST: Row[] = ['00010', '00040', '00060'].map((line) => ({
  line,
  buyer: 'Kenneth Guan',
  matId: null,
  description: null,
  qty: '—',
  value: '—',
  original: '—',
  revised: '—',
  ds: '—',
  comments: '—',
  responded: false,
}));

/* Closed, but dispatched after the snapshot landed — the detail is still there. */
const CLOSED_WITH_SNAPSHOT: Row[] = [
  {
    line: '00010',
    buyer: 'Yousef Ata',
    matId: '000001100000077310',
    description: 'VALVE GATE 6IN CLASS 1500 FLANGED RF',
    qty: '2',
    value: '$14,200',
    original: '02 Sep 2026',
    revised: '—',
    ds: 'DS12',
    comments: 'Delivered and invoiced',
    responded: true,
  },
];

function PoBlock({
  po,
  rows,
  closed,
  detailLost,
}: {
  po: string;
  rows: Row[];
  closed: boolean;
  detailLost: boolean;
}) {
  const responded = rows.filter((r) => r.responded).length;
  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-slate-200">
      <div className="flex items-center gap-3 bg-slate-50 px-4 py-3">
        <span className="text-sm font-bold text-slate-800">PO {po}</span>
        <span className="text-xs font-medium text-slate-500">
          {rows.length} line{rows.length !== 1 ? 's' : ''}
        </span>
        {closed && <ClosedPoBadge detailLost={detailLost} />}
        <span className="ml-auto text-xs font-medium text-slate-500">
          {responded} / {rows.length} responded
        </span>
      </div>
      <table className="w-full border-collapse text-left" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          {COLS.map((c) => (
            <col key={c.name} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-slate-100 bg-white text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {COLS.map((c) => (
              <th key={c.name} className="whitespace-nowrap px-3 py-2 font-semibold">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.line}
              className={`border-b border-slate-100 ${i % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
            >
              <td className="whitespace-nowrap px-3 py-2.5 text-sm font-medium text-slate-700">
                {r.line}
              </td>
              <td className="truncate overflow-hidden px-3 py-2.5 text-xs text-slate-600">
                {r.buyer}
              </td>
              <td
                className="truncate overflow-hidden px-3 py-2.5 text-xs text-slate-600"
                title={r.matId ?? undefined}
              >
                {r.matId || '—'}
              </td>
              <td
                className="truncate overflow-hidden px-3 py-2.5 text-xs text-slate-700"
                title={r.description ?? undefined}
              >
                {r.description || '—'}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm font-medium tabular-nums text-slate-700">
                {r.qty}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-medium tabular-nums text-slate-700">
                {r.value}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">{r.original}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">{r.revised}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">{r.ds}</td>
              <td className="truncate overflow-hidden px-3 py-2.5 text-xs text-slate-600">
                {r.comments}
              </td>
              <td className="px-3 py-2.5">
                <ResponseBadge state={r.responded ? 'Submitted' : 'Email Sent'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LineTablePreview() {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Live PO — the material number must not touch the description
      </p>
      <PoBlock po="4040004233" rows={LIVE} closed={false} detailLost={false} />

      <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Closed in SAP, detail survived (dispatched after 14 Sep)
      </p>
      <PoBlock po="4040005017" rows={CLOSED_WITH_SNAPSHOT} closed detailLost={false} />

      <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Closed in SAP, dispatched before the snapshot — this is what looked like a bug
      </p>
      <PoBlock po="4040004709" rows={LOST} closed detailLost />
    </div>
  );
}
