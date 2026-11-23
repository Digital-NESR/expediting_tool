'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · Recurrent services.

   Annual (or half-yearly) contracts, subscriptions and AMCs.
   Not billed month by month: renewed. Each service has an
   expiry, a requester-validator who decides whether it is
   renewed, and a buyer who renews it in SAP and records the new
   PO and expiry here.

   Buyers and admins see every service and edit them. A
   requester sees only their own, and decides.
   ───────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  FileText,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import {
  completeRecurrentRenewal,
  decideRecurrentRenewal,
  deleteRecurrentService,
  getRecurrentHistory,
  removeRecurrentDocument,
  saveRecurrentService,
  uploadRecurrentDocument,
  type RecurrentBoard,
  type RecurrentDocKind,
  type RecurrentRow,
} from '@/app/actions/rrsm/recurrent';
import RrsmShell, { RrsmEmpty, RrsmNoCountry } from './components/RrsmShell';
import { PickerPortal, usePickerAnchor } from '@/app/admin/_components/EmployeePicker';
import {
  DECISION_LABEL,
  EMPTY_RECURRENT_DRAFT,
  PERIOD_LABEL,
  RECURRENT_STATUS_LABEL,
  RENEWAL_PERIODS,
  type RecurrentDraft,
  type RecurrentStatus,
  type RenewalDecision,
} from '@/lib/rrsm/recurrent';
import { PO_RELEASE_LABEL, type SapPo } from '@/lib/rrsm/sap';
import { ACCEPT_ATTR, checkDoc } from '@/lib/rrsm/submission';

const BRAND = '#307c4c';

const STATUS_TONE: Record<RecurrentStatus, string> = {
  active: 'bg-[#e6f1ea] text-[#1d4f31]',
  due: 'bg-amber-50 text-amber-800',
  expired: 'bg-red-50 text-red-700',
  awaiting_buyer: 'bg-sky-50 text-sky-800',
  cancelled: 'bg-slate-100 text-slate-500',
  no_expiry: 'bg-slate-100 text-slate-500',
};

type Filter = 'all' | 'attention' | 'due' | 'expired' | 'awaiting_buyer' | 'active' | 'cancelled';

const FILTERS: [Filter, string][] = [
  ['attention', 'Needs attention'],
  ['due', 'Due ≤ 90 days'],
  ['expired', 'Expired'],
  ['awaiting_buyer', 'With buyer'],
  ['active', 'Active'],
  ['cancelled', 'Cancelled'],
  ['all', 'All'],
];

function matches(f: Filter, r: RecurrentRow): boolean {
  if (f === 'all') return true;
  if (f === 'attention')
    return r.status === 'due' || r.status === 'expired' || r.status === 'awaiting_buyer';
  return r.status === f;
}

const DOC_KIND_LABEL: Record<RecurrentDocKind, string> = {
  contract: 'Contract / agreement',
  quotation: 'Quotation',
  other: 'Other',
};

function draftOf(r: RecurrentRow): RecurrentDraft {
  return {
    description: r.description,
    serviceName: r.serviceName,
    status: r.storedStatus,
    renewalPeriod: r.renewalPeriod,
    poRenewalPeriod: r.poRenewalPeriod,
    department: r.department,
    contractExpiry: r.contractExpiry,
    lastPoNumber: r.lastPoNumber,
    lastPoValidTill: r.lastPoValidTill,
    supplierCode: r.supplierCode,
    supplierName: r.supplierName,
    supplierContactName: r.supplierContactName,
    supplierContactEmail: r.supplierContactEmail,
    requesterName: r.requesterName,
    requesterEmail: r.requesterEmail,
    buyerName: r.buyerName,
    buyerEmail: r.buyerEmail,
    approver: r.approver,
    requestType: r.requestType,
    annualValue: r.annualValue === null ? '' : String(r.annualValue),
    currency: r.currency,
    comments: r.comments,
  };
}

function daysText(d: number | null): string {
  if (d === null) return '';
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} ago`;
  if (d === 0) return 'today';
  return `in ${d} day${d === 1 ? '' : 's'}`;
}

export default function RecurrentClient({ board }: { board: RecurrentBoard }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(board.ownOnly ? 'all' : 'attention');
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState('');
  const [open, setOpen] = useState<RecurrentRow | 'new' | null>(null);

  const departments = useMemo(
    () => [...new Set(board.rows.map((r) => r.department).filter(Boolean))].sort(),
    [board.rows],
  );
  const counts = useMemo(() => {
    const n = {} as Record<Filter, number>;
    for (const [f] of FILTERS) n[f] = board.rows.filter((r) => matches(f, r)).length;
    return n;
  }, [board.rows]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return board.rows.filter(
      (r) =>
        matches(filter, r) &&
        (!dept || r.department === dept) &&
        (!q ||
          [
            r.serviceName,
            r.description,
            r.supplierName,
            r.requesterName,
            r.lastPoNumber,
            r.department,
          ]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
  }, [board.rows, filter, query, dept]);

  const title = board.ownOnly ? 'My recurrent services' : 'Recurrent services';
  const subtitle = board.ownOnly
    ? 'The services you are the requester-validator for. When one is coming up for renewal, tell the buyer whether to renew it, change it or cancel it.'
    : 'Annual contracts, subscriptions and AMCs. Requesters are reminded at 90, 60, 30, 14, 7 and 0 days before expiry; once they decide, the buyer renews and records the new PO and expiry.';

  if (!board.country) {
    return (
      <RrsmShell scope={board} title={title}>
        <RrsmNoCountry />
      </RrsmShell>
    );
  }
  if (!board.enabled) {
    return (
      <RrsmShell scope={board} title={title}>
        <RrsmEmpty
          title={`Recurrent services are not switched on for ${board.country.name}`}
          body="An RRSM admin can switch the module on in Admin → RRSM."
        />
      </RrsmShell>
    );
  }

  const current =
    open && open !== 'new' ? (board.rows.find((r) => r.id === open.id) ?? open) : open;

  return (
    <RrsmShell
      scope={board}
      title={title}
      subtitle={subtitle}
      actions={
        board.canEdit ? (
          <button
            onClick={() => setOpen('new')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-[#1d4f31] shadow-sm hover:bg-white/90"
          >
            <Plus className="h-4 w-4" /> Add service
          </button>
        ) : undefined
      }
    >
      {!board.ownOnly && !board.country.recurrentReminders && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Reminders are switched off for {board.country.name}: nobody is emailed yet. Correct the
            expiry dates and POs, then an RRSM admin switches reminders on in Admin → RRSM.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([f, label]) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`whitespace-nowrap rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
              filter === f
                ? 'border-[#307c4c] bg-[#307c4c] text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-[#307c4c]/40'
            }`}
          >
            {label} <span className="opacity-70">{counts[f]}</span>
          </button>
        ))}
        <div className="flex-1" />
        {departments.length > 1 && (
          <select
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12.5px] text-slate-700"
            aria-label="Department"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search service, supplier, PO…"
            className="w-56 text-[12.5px] outline-none"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[62rem] table-fixed text-[13px]">
            <colgroup>
              <col />
              <col className="w-[13rem]" />
              <col className="w-28" />
              <col className="w-36" />
              <col className="w-32" />
              <col className="w-36" />
              <col className="w-40" />
            </colgroup>
            <thead>
              <tr className="bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-400">
                <th className="px-4 py-2.5 text-left font-semibold">Service</th>
                <th className="px-3 py-2.5 text-left font-semibold">Supplier</th>
                <th className="px-3 py-2.5 text-left font-semibold">Department</th>
                <th className="px-3 py-2.5 text-left font-semibold">Requester</th>
                <th className="px-3 py-2.5 text-left font-semibold">Expiry</th>
                <th className="px-3 py-2.5 text-left font-semibold">Last PO</th>
                <th className="px-3 py-2.5 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setOpen(r)}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50/70"
                >
                  <td className="px-4 py-2.5">
                    <div
                      className="truncate font-medium text-slate-800"
                      title={r.serviceName || r.description}
                    >
                      {r.serviceName || r.description}
                    </div>
                    {r.serviceName && r.description && r.description !== r.serviceName && (
                      <div className="truncate text-[11.5px] text-slate-500" title={r.description}>
                        {r.description}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="truncate text-slate-700" title={r.supplierName}>
                      {r.supplierName || '—'}
                    </div>
                    {r.supplierCode && (
                      <div className="font-mono text-[10.5px] text-slate-400">{r.supplierCode}</div>
                    )}
                  </td>
                  <td className="truncate px-3 py-2.5 text-slate-600">{r.department || '—'}</td>
                  <td className="truncate px-3 py-2.5 text-slate-600" title={r.requesterEmail}>
                    {r.requesterName || r.requesterEmail || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-mono text-[12px] text-slate-700">
                      {r.contractExpiry || '—'}
                    </div>
                    {r.daysLeft !== null && r.storedStatus === 'active' && (
                      <div
                        className={`text-[10.5px] ${r.daysLeft < 0 ? 'text-red-600' : r.daysLeft <= 90 ? 'text-amber-700' : 'text-slate-400'}`}
                      >
                        {daysText(r.daysLeft)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-mono text-[12px] text-slate-700">
                      {r.lastPoNumber || '—'}
                    </div>
                    <PoState po={board.sap.pos[r.lastPoNumber]} />
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${STATUS_TONE[r.status]}`}
                    >
                      {RECURRENT_STATUS_LABEL[r.status]}
                    </span>
                    {r.renewal?.decision && r.status === 'awaiting_buyer' && (
                      <div className="mt-0.5 truncate text-[10.5px] text-sky-800">
                        {DECISION_LABEL[r.renewal.decision]}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[13.5px] text-slate-500">
                    {board.rows.length
                      ? 'Nothing matches.'
                      : board.ownOnly
                        ? 'No services are assigned to you.'
                        : 'No recurrent services yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {current && (
        <ServiceDrawer
          key={current === 'new' ? 'new' : current.id}
          row={current === 'new' ? null : current}
          board={board}
          onClose={() => setOpen(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </RrsmShell>
  );
}

function PoState({ po }: { po?: SapPo }) {
  if (!po) return null;
  const tone =
    po.release === 'released'
      ? 'text-[#1d4f31]'
      : po.release === 'deleted'
        ? 'text-red-600'
        : 'text-amber-700';
  return (
    <div
      className={`text-[10.5px] ${tone}`}
      title={po.releasedOn ? `Released ${po.releasedOn}` : undefined}
    >
      SAP: {PO_RELEASE_LABEL[po.release]}
    </div>
  );
}

/* ─── the drawer ─────────────────────────────────────────────────────────────────────────── */

function ServiceDrawer({
  row,
  board,
  onClose,
  onChanged,
}: {
  row: RecurrentRow | null;
  board: RecurrentBoard;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  async function run(
    key: string,
    fn: () => Promise<{ success: boolean; error?: string }>,
    done?: string,
  ) {
    setBusy(key);
    setError('');
    setNotice('');
    const r = await fn();
    if (!r.success) setError(r.error ?? 'That did not work.');
    else {
      if (done) setNotice(done);
      onChanged();
    }
    setBusy(null);
    return r.success;
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end bg-slate-950/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[16px] font-semibold text-slate-900">
              {row ? row.serviceName || row.description : 'Add a recurrent service'}
            </h2>
            {row && (
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-500">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${STATUS_TONE[row.status]}`}
                >
                  {RECURRENT_STATUS_LABEL[row.status]}
                </span>
                {row.contractExpiry && (
                  <span>
                    Expires {row.contractExpiry} ({daysText(row.daysLeft)})
                  </span>
                )}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          {notice && !error && (
            <div className="rounded-lg border border-[#a9d3bb] bg-[#e6f1ea] px-3 py-2 text-[13px] text-[#1d4f31]">
              {notice}
            </div>
          )}

          {row && row.storedStatus === 'active' && (row.canDecide || board.canEdit) && (
            <RenewalPanel row={row} board={board} busy={busy} run={run} />
          )}

          <DetailsForm row={row} board={board} busy={busy} run={run} onClose={onClose} />

          {row && <Documents row={row} board={board} busy={busy} run={run} />}
          {row && <History serviceId={row.id} />}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

type Run = (
  key: string,
  fn: () => Promise<{ success: boolean; error?: string }>,
  done?: string,
) => Promise<boolean>;

/** The requester's decision, and the buyer's renewal once there is one. */
function RenewalPanel({
  row,
  board,
  busy,
  run,
}: {
  row: RecurrentRow;
  board: RecurrentBoard;
  busy: string | null;
  run: Run;
}) {
  const [decision, setDecision] = useState<RenewalDecision>(row.renewal?.decision ?? 'renew');
  const [note, setNote] = useState(row.renewal?.decisionNote ?? '');
  const [po, setPo] = useState('');
  const [expiry, setExpiry] = useState(row.suggestedExpiry);
  const [validTill, setValidTill] = useState('');
  const decided = row.renewal?.decision ?? null;

  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h3 className="text-[13.5px] font-semibold text-slate-900">Renewal</h3>

      {decided ? (
        <div className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-[12.5px] text-sky-900">
          <b>{DECISION_LABEL[decided]}</b> · decided by {row.renewal?.decidedBy} on{' '}
          {row.renewal?.decidedAt}
          {row.renewal?.decisionNote && (
            <div className="mt-1 whitespace-pre-wrap">{row.renewal.decisionNote}</div>
          )}
        </div>
      ) : (
        <p className="mt-1 text-[12.5px] text-slate-500">
          {row.daysLeft !== null && row.daysLeft <= 90
            ? 'This service is due. The requester decides first; the buyer then renews it.'
            : 'Not due yet. The requester is reminded from 90 days before expiry, but can decide now.'}
        </p>
      )}

      {row.canDecide && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {(['renew', 'renew_changes', 'cancel'] as RenewalDecision[]).map((d) => (
              <label
                key={d}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] ${
                  decision === d
                    ? 'border-[#307c4c] bg-[#307c4c]/5 font-semibold text-[#1d4f31]'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                <input
                  type="radio"
                  name={`decision-${row.id}`}
                  checked={decision === d}
                  onChange={() => setDecision(d)}
                  className="accent-[#307c4c]"
                />
                {DECISION_LABEL[d]}
              </label>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={
              decision === 'renew_changes'
                ? 'What should change? (users, modules, scope, value, supplier, period…) The buyer updates the record.'
                : 'Note for the buyer (optional)'
            }
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-[#307c4c]"
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void run(
                'decide',
                () => decideRecurrentRenewal({ serviceId: row.id, decision, note }),
                'Decision sent to the buyer.',
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
            style={{ background: BRAND }}
          >
            {busy === 'decide' && <Loader2 className="h-4 w-4 animate-spin" />}
            {decided ? 'Update decision' : 'Send decision to the buyer'}
          </button>
        </div>
      )}

      {board.canEdit && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h4 className="text-[12.5px] font-semibold text-slate-700">Buyer: record the outcome</h4>
          {decided === 'cancel' ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run(
                  'complete',
                  () => completeRecurrentRenewal({ serviceId: row.id, outcome: 'cancelled' }),
                  'Service cancelled.',
                )
              }
              className="mt-2 rounded-lg bg-red-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              Mark the service cancelled
            </button>
          ) : (
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <Field label="New PO number">
                <input
                  value={po}
                  onChange={(e) => setPo(e.target.value)}
                  inputMode="numeric"
                  placeholder="5160001234"
                  className={INPUT}
                />
              </Field>
              <Field label="New expiry">
                <input
                  type="date"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label="PO valid till (optional)">
                <input
                  type="date"
                  value={validTill}
                  onChange={(e) => setValidTill(e.target.value)}
                  className={INPUT}
                />
              </Field>
              <div className="sm:col-span-3">
                <button
                  type="button"
                  disabled={busy !== null || !expiry}
                  onClick={() =>
                    void run(
                      'complete',
                      () =>
                        completeRecurrentRenewal({
                          serviceId: row.id,
                          outcome: 'renewed',
                          newPoNumber: po,
                          newExpiry: expiry,
                          newPoValidTill: validTill,
                        }),
                      'Renewal recorded. The service runs to its new expiry.',
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                  style={{ background: BRAND }}
                >
                  {busy === 'complete' && <Loader2 className="h-4 w-4 animate-spin" />}
                  Record renewal
                </button>
                {!decided && (
                  <span className="ml-2 text-[11.5px] text-slate-400">
                    The requester has not decided yet.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-[#307c4c] disabled:bg-slate-50 disabled:text-slate-600';

function Field({
  label,
  children,
  wide,
  as = 'label',
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
  /** "div" for a field whose control opens a popover: inside a <label>, a click on the
   *  popover's click-away layer re-activates the label's button and reopens it. */
  as?: 'label' | 'div';
}) {
  const Tag = as;
  return (
    <Tag className={`flex flex-col gap-1 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      {children}
    </Tag>
  );
}

/** Everything on the record. Editable by buyers and admins; read-only for a requester. */
function DetailsForm({
  row,
  board,
  busy,
  run,
  onClose,
}: {
  row: RecurrentRow | null;
  board: RecurrentBoard;
  busy: string | null;
  run: Run;
  onClose: () => void;
}) {
  const [d, setD] = useState<RecurrentDraft>(
    row ? draftOf(row) : { ...EMPTY_RECURRENT_DRAFT, currency: board.country?.currency ?? '' },
  );
  const ro = !board.canEdit;
  const set = (k: keyof RecurrentDraft) => (e: { target: { value: string } }) =>
    setD({ ...d, [k]: e.target.value });
  const text = (
    k: keyof RecurrentDraft,
    label: string,
    opts?: { wide?: boolean; type?: string; placeholder?: string },
  ) => (
    <Field label={label} wide={opts?.wide}>
      <input
        type={opts?.type ?? 'text'}
        value={d[k]}
        onChange={set(k)}
        disabled={ro}
        placeholder={opts?.placeholder}
        className={INPUT}
      />
    </Field>
  );

  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h3 className="text-[13.5px] font-semibold text-slate-900">Details</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {text('serviceName', 'Software / service name')}
        {text('description', 'Service description')}
        <Field label="Status">
          <select value={d.status} onChange={set('status')} disabled={ro} className={INPUT}>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>
        {text('department', 'Department')}
        <Field label="Contract renewal period">
          <select
            value={d.renewalPeriod}
            onChange={set('renewalPeriod')}
            disabled={ro}
            className={INPUT}
          >
            {RENEWAL_PERIODS.map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        {text('poRenewalPeriod', 'PO renewal period')}
        {text('contractExpiry', 'Contract expiry', { type: 'date' })}
        {text('lastPoNumber', 'Last PO number')}
        {text('lastPoValidTill', 'Last PO valid till', { type: 'date' })}
        <Field label="Annual value (optional)">
          <div className="flex gap-1.5">
            <input
              value={d.annualValue}
              onChange={set('annualValue')}
              disabled={ro}
              inputMode="decimal"
              className={INPUT}
            />
            <input
              value={d.currency}
              onChange={set('currency')}
              disabled={ro}
              placeholder="AED"
              className={`${INPUT} w-20`}
            />
          </div>
        </Field>
        {text('supplierCode', 'Vendor code (SAP)')}
        {text('supplierName', 'Vendor name')}
        {text('supplierContactName', 'Supplier contact name')}
        {text('supplierContactEmail', 'Supplier contact email', { type: 'email' })}
        <PersonField
          label="Requester-validator"
          name={d.requesterName}
          email={d.requesterEmail}
          disabled={ro}
          onPick={(name, email) => setD({ ...d, requesterName: name, requesterEmail: email })}
        />
        <PersonField
          label="Buyer"
          name={d.buyerName}
          email={d.buyerEmail}
          disabled={ro}
          onPick={(name, email) => setD({ ...d, buyerName: name, buyerEmail: email })}
        />
        {text('approver', 'Approver')}
        {text('requestType', 'Request type')}
        <Field label="Comments" wide>
          <textarea
            value={d.comments}
            onChange={set('comments')}
            disabled={ro}
            rows={2}
            className={INPUT}
          />
        </Field>
      </div>

      {board.canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              const ok = await run(
                'save',
                () =>
                  saveRecurrentService({ countryCode: board.country!.code, id: row?.id, draft: d }),
                row ? 'Saved.' : 'Service added.',
              );
              if (ok && !row) onClose();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
            style={{ background: BRAND }}
          >
            {busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />}
            {row ? 'Save changes' : 'Add service'}
          </button>
          {row && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                if (
                  !window.confirm(
                    `Remove "${row.serviceName || row.description}"? Its documents go with it. The history keeps a record.`,
                  )
                )
                  return;
                const ok = await run('delete', () => deleteRecurrentService(row.id));
                if (ok) onClose();
              }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-[12.5px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove service
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** A person from the Azure AD directory (name + email). */
function PersonField({
  label,
  name,
  email,
  disabled,
  onPick,
}: {
  label: string;
  name: string;
  email: string;
  disabled: boolean;
  onPick: (name: string, email: string) => void;
}) {
  const picker = usePickerAnchor();
  const { btnRef } = picker;
  return (
    <Field label={label} as="div">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={picker.toggle}
        className={`${INPUT} flex items-center gap-2 text-left`}
      >
        <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="min-w-0 flex-1 truncate">
          {name || email ? (
            <>
              {name || email}
              {email && name && <span className="ml-1 text-[11px] text-slate-400">{email}</span>}
            </>
          ) : (
            <span className="text-slate-400">Search the directory…</span>
          )}
        </span>
      </button>
      <PickerPortal
        open={picker.open}
        pos={picker.pos}
        onPick={(emp) => {
          onPick(emp.name, emp.email);
          picker.close();
        }}
        onClose={picker.close}
      />
    </Field>
  );
}

function Documents({
  row,
  board,
  busy,
  run,
}: {
  row: RecurrentRow;
  board: RecurrentBoard;
  busy: string | null;
  run: Run;
}) {
  const [kind, setKind] = useState<RecurrentDocKind>('contract');
  const input = useRef<HTMLInputElement>(null);
  const canAdd = board.canEdit || row.canDecide;
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h3 className="text-[13.5px] font-semibold text-slate-900">Documents</h3>
      <ul className="mt-2 space-y-1">
        {row.documents.map((doc) => (
          <li key={doc.id} className="flex items-center gap-2 text-[12.5px]">
            <FileText className="h-3.5 w-3.5 shrink-0 text-[#1d4f31]" />
            <a
              href={`/api/rrsm/recurrent-documents/${doc.id}`}
              className="min-w-0 flex-1 truncate text-[#1d4f31] hover:underline"
              title={doc.fileName}
            >
              {doc.fileName}
            </a>
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] text-slate-500">
              {DOC_KIND_LABEL[doc.kind]}
            </span>
            <span className="shrink-0 text-[11px] text-slate-400">{doc.uploadedAt}</span>
            {board.canEdit && (
              <button
                type="button"
                onClick={() => void run('doc', () => removeRecurrentDocument(doc.id))}
                className="shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
                aria-label={`Remove ${doc.fileName}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
        {!row.documents.length && (
          <li className="text-[12.5px] text-slate-400">No documents yet.</li>
        )}
      </ul>
      {canAdd && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as RecurrentDocKind)}
            className={`${INPUT} w-auto`}
          >
            {(Object.keys(DOC_KIND_LABEL) as RecurrentDocKind[]).map((k) => (
              <option key={k} value={k}>
                {DOC_KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => input.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 disabled:opacity-40"
          >
            {busy === 'doc' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Upload
          </button>
          <span className="text-[11px] text-slate-400">
            PDF, image, Excel, Word or CSV, up to 4 MB.
          </span>
          <input
            ref={input}
            type="file"
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const ok = checkDoc({ name: file.name, size: file.size });
              if (!ok.ok) {
                void run('doc', async () => ({ success: false, error: ok.error }));
                return;
              }
              const form = new FormData();
              form.set('serviceId', String(row.id));
              form.set('kind', kind);
              form.set('file', file);
              void run('doc', () => uploadRecurrentDocument(form), 'Document added.');
            }}
          />
        </div>
      )}
    </section>
  );
}

function History({ serviceId }: { serviceId: number }) {
  const [items, setItems] = useState<Awaited<ReturnType<typeof getRecurrentHistory>> | null>(null);
  useEffect(() => {
    let live = true;
    void getRecurrentHistory(serviceId).then((h) => live && setItems(h));
    return () => {
      live = false;
    };
  }, [serviceId]);
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h3 className="text-[13.5px] font-semibold text-slate-900">History</h3>
      {!items ? (
        <p className="mt-2 text-[12.5px] text-slate-400">Loading…</p>
      ) : !items.length ? (
        <p className="mt-2 text-[12.5px] text-slate-400">Nothing recorded yet.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((h, i) => (
            <li key={i} className="text-[12px] text-slate-600">
              <span className="font-mono text-[11px] text-slate-400">{h.at}</span> ·{' '}
              <b>{h.action.replace(/_/g, ' ')}</b> by {h.actor}
              {h.note && <div className="text-slate-500">{h.note}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
