'use client';

import { Fragment, useMemo, useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { useExpediteStore } from '@/store/useExpediteStore';
import type { PurchaseOrder } from '@/types/po';
import { addAdditionalSupplierEmail, getSupplierContacts } from '@/app/actions/supplier-actions';
import EmployeeSearchInput from '@/components/EmployeeSearchInput';
import type { Employee } from '@/components/EmployeeSearchInput';

/* ─── Helpers ─────────────────────────────────────────────── */
function formatCurrency(val: number | string | undefined | null) {
  if (val == null) return '—';
  const num = Number(val);
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function formatDate(dateStr: string | undefined | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.valueOf())) return dateStr;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

const formatMatId = (id: string | null | undefined) =>
  id?.trim() ? id : <span className="text-gray-400 italic">Service</span>;

/* ─── Email Pills ─────────────────────────────────────────── */

/** Solid pill — supplier_emails sourced from Power BI sync (default contacts) */
function DefaultEmailPill({ email, onRemove }: { email: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#307c4c] text-white text-xs font-medium rounded-md max-w-full">
      <span className="truncate">{email}</span>
      <button
        type="button"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onRemove();
        }}
        className="shrink-0 text-white/70 hover:text-green-200 transition-colors ml-0.5"
        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
        aria-label={`Remove ${email}`}
      >
        <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </span>
  );
}

/** Outlined pill — additional_supplier_emails and manually-added emails */
function RemovableEmailPill({ email, onRemove }: { email: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-[#307c4c] text-[#307c4c] text-xs font-medium rounded-md max-w-full">
      <span className="truncate">{email}</span>
      <button
        type="button"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onRemove();
        }}
        className="shrink-0 text-[#307c4c]/70 hover:text-green-900 transition-colors ml-0.5"
        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
        aria-label={`Remove ${email}`}
      >
        <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </span>
  );
}

/** CC recipient shape — tracks display name for employee-sourced entries */
type CcRecipient = { email: string; displayName?: string };

/** CC pill — employee-sourced: solid green with name; plain: slate with email */
function CcEmailPill({ recipient, onRemove }: { recipient: CcRecipient; onRemove: () => void }) {
  const isEmployee = !!recipient.displayName;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md max-w-full ${
        isEmployee
          ? 'bg-[#307c4c] text-white'
          : 'bg-slate-100 border border-slate-200 text-slate-700'
      }`}
      title={recipient.email}
    >
      <span className="truncate">{isEmployee ? recipient.displayName : recipient.email}</span>
      <button
        type="button"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onRemove();
        }}
        className={`shrink-0 transition-colors ml-0.5 ${
          isEmployee
            ? 'text-white/70 hover:text-green-200'
            : 'text-slate-400 hover:text-red-500'
        }`}
        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
        aria-label={`Remove ${recipient.email}`}
      >
        <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </span>
  );
}

/** Locked CC pill — green filled, no remove button, lock icon */
function LockedCcPill({ email }: { email: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#307c4c] text-white text-xs font-medium rounded-md max-w-full">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 opacity-80">
        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
      </svg>
      <span className="truncate">{email}</span>
    </span>
  );
}

/* ─── Toast ───────────────────────────────────────────────── */
function Toast({
  message,
  type,
  onDismiss,
}: {
  message: string;
  type: 'success' | 'error';
  onDismiss: () => void;
}) {
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    const t = setTimeout(() => dismissRef.current(), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`fixed bottom-24 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-xs font-medium text-white ${
        type === 'success' ? 'bg-[#307c4c]' : 'bg-red-600'
      }`}
    >
      {type === 'success' ? (
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      )}
      {message}
    </div>
  );
}

/* ─── ToEmail shape ──────────────────────────────────────── */
type ToEmail = { email: string; source: 'default' | 'additional' };

/* ─── Supplier Email Configuration Card ───────────────────── */
function SupplierEmailCard({
  supplierId,
  items,
  cardError,
}: {
  supplierId: string;
  items: PurchaseOrder[];
  cardError?: { to: boolean; cc: boolean };
}) {
  // Single tagged array: source='default' for supplier_emails, source='additional' for everything else
  const [toEmails, setToEmails] = useState<ToEmail[]>([]);
  const [ccEmails, setCcEmails] = useState<CcRecipient[]>([]);
  const [toInput, setToInput] = useState('');
  const [toError, setToError] = useState('');
  const [isLoadingContacts, setIsLoadingContacts] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { setSupplierEmails } = useExpediteStore();

  /* Logged-in user's email — always CC'd and non-removable */
  const { data: session } = useSession();
  const lockedCcEmail = session?.user?.email ?? null;

  /* Load both email fields from supplier_contacts, tag each entry with its source */
  useEffect(() => {
    if (!supplierId) { setIsLoadingContacts(false); return; }
    getSupplierContacts(supplierId).then(({ defaultEmails: def, additionalEmails: add }) => {
      setToEmails([
        ...def.map((email): ToEmail => ({ email, source: 'default' })),
        ...add.map((email): ToEmail => ({ email, source: 'additional' })),
      ]);
      setIsLoadingContacts(false);
    });
  }, [supplierId]);

  /* Sync To + CC into Zustand — locked email is always included in cc */
  useEffect(() => {
    if (isLoadingContacts) return;
    const allCc = lockedCcEmail ? [lockedCcEmail, ...ccEmails.map(c => c.email)] : ccEmails.map(c => c.email);
    setSupplierEmails(supplierId, {
      to: toEmails.map((t) => t.email),
      cc: allCc,
    });
  }, [toEmails, ccEmails, isLoadingContacts, supplierId, setSupplierEmails, lockedCcEmail]);

  /* Populate CC from buyer emails — exclude the locked user to avoid duplicates */
  useEffect(() => {
    const uniqueBuyerEmails = [
      ...new Set(
        items
          .map((i) => i['Buyer Email'])
          .filter((e): e is string => Boolean(e))
          .filter((e) => e.toLowerCase() !== (lockedCcEmail ?? '').toLowerCase())
      ),
    ];
    setCcEmails(uniqueBuyerEmails.map(email => ({ email })));
  }, [items, lockedCcEmail]);

  /* Add To email — optimistic UI, persists to DB via server action */
  function handleAddTo() {
    const email = toInput.trim();
    if (!isValidEmail(email)) { setToError('Enter a valid email.'); return; }
    if (toEmails.some((t) => t.email === email)) {
      setToError('Already in list.');
      return;
    }
    setToError('');
    setToEmails((prev) => [...prev, { email, source: 'additional' }]);
    setToInput('');
    startTransition(async () => {
      const res = await addAdditionalSupplierEmail(supplierId, email);
      if (res.success) {
        setToast({ message: 'Email saved.', type: 'success' });
      } else {
        setToError('Saved locally, but DB update failed.');
        setToast({ message: 'DB update failed — changes are session-only.', type: 'error' });
      }
    });
  }

  /* Add CC via employee search */
  function handleAddCcEmployee(emp: Employee) {
    if (ccEmails.some(c => c.email.toLowerCase() === emp.mail.toLowerCase())) return;
    if (emp.mail.toLowerCase() === (lockedCcEmail ?? '').toLowerCase()) return;
    setCcEmails(prev => [...prev, { email: emp.mail, displayName: emp.display_name }]);
  }

  const hasToRecipients = toEmails.length > 0;

  return (
    <div className="flex flex-col h-full border-l border-slate-100 bg-slate-50/40">

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}

      {/* Card header */}
      <div className="px-4 py-3 border-b border-slate-100 bg-white">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Email Recipients
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* ── To Section ── */}
        <section>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">To</p>
          <p className="text-[11px] text-gray-400 mb-1">Add or remove supplier emails</p>

          {isLoadingContacts ? (
            <div className="space-y-1.5">
              <div className="h-5 w-36 bg-slate-200 rounded animate-pulse" />
              <div className="h-5 w-28 bg-slate-200 rounded animate-pulse" />
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[24px]">
              {!hasToRecipients ? (
                <p className="text-xs text-slate-400 italic">No recipients yet.</p>
              ) : (
                <>
                  {toEmails.map((entry) => {
                    const Pill = entry.source === 'default' ? DefaultEmailPill : RemovableEmailPill;
                    return (
                      <Pill
                        key={entry.email}
                        email={entry.email}
                        onRemove={() =>
                          setToEmails((prev) => prev.filter((t) => t.email !== entry.email))
                        }
                      />
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* Add To input */}
          <div className="flex gap-1.5 mt-1">
            <input
              type="email"
              placeholder="add@email.com"
              value={toInput}
              onChange={(e) => { setToInput(e.target.value); setToError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTo()}
              className="flex-1 min-w-0 text-xs bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#307c4c] focus:border-[#307c4c] transition-colors"
            />
            <button
              onClick={handleAddTo}
              disabled={isPending}
              className="shrink-0 px-2.5 py-1.5 text-xs font-semibold bg-[#307c4c] hover:bg-[#26663e] text-white rounded-md transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPending ? '…' : 'Add'}
            </button>
          </div>
          {toError && <p className="mt-1 text-[10px] text-red-500">{toError}</p>}
          {cardError?.to && !hasToRecipients && (
            <p className="mt-1 text-[10px] text-red-500 font-medium">TO email required before proceeding.</p>
          )}
        </section>

        <div className="border-t border-slate-100" />

        {/* ── CC Section ── */}
        <section>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">CC</p>
          <p className="text-[11px] text-gray-400 mb-1">Add relevant buyers or team members</p>

          <div className="flex flex-wrap gap-1.5 mb-2 min-h-[24px]">
            {!lockedCcEmail && ccEmails.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No CC recipients.</p>
            ) : (
              <>
                {lockedCcEmail && <LockedCcPill email={lockedCcEmail} />}
                {ccEmails.map((r) => (
                  <CcEmailPill
                    key={r.email}
                    recipient={r}
                    onRemove={() => setCcEmails((prev) => prev.filter((e) => e.email !== r.email))}
                  />
                ))}
              </>
            )}
          </div>

          {/* Add CC via employee search */}
          <EmployeeSearchInput
            placeholder="Search NESR employees to CC…"
            onSelect={handleAddCcEmployee}
            excludeEmails={[
              ...(lockedCcEmail ? [lockedCcEmail] : []),
              ...ccEmails.map(c => c.email),
            ]}
          />
          {cardError?.cc && ccEmails.length === 0 && !lockedCcEmail && (
            <p className="mt-1 text-[10px] text-red-500 font-medium">CC email required before proceeding.</p>
          )}
          <p className="mt-1.5 text-[10px] text-slate-400 leading-snug">
            CC changes are local to this session only.
          </p>
        </section>

      </div>
    </div>
  );
}

/* ─── PO Grouped Table ────────────────────────────────────── */
function PoGroupedTable({
  items,
  onRemove,
}: {
  items: PurchaseOrder[];
  onRemove: (item: PurchaseOrder) => void;
}) {
  const poGroups = useMemo(() => {
    const map = new Map<string, PurchaseOrder[]>();
    for (const item of items) {
      const po = item['PO Number'] ?? '';
      if (!map.has(po)) map.set(po, []);
      map.get(po)!.push(item);
    }
    return Array.from(map.entries()).map(([po, lines]) => ({
      po,
      lines,
      total: lines.reduce((s, l) => s + Number(l['Open PO Value USD'] ?? 0), 0),
    }));
  }, [items]);

  const [expandedPos, setExpandedPos] = useState<Set<string>>(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const po = item['PO Number'] ?? '';
      map.set(po, (map.get(po) ?? 0) + 1);
    }
    const initial = new Set<string>();
    for (const [po, count] of map) {
      if (count < 5) initial.add(po);
    }
    return initial;
  });

  function toggle(po: string) {
    setExpandedPos((prev) => {
      const next = new Set(prev);
      if (next.has(po)) next.delete(po);
      else next.add(po);
      return next;
    });
  }

  return (
    <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
      <thead>
        <tr className="bg-white border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          <th className="py-3 px-4" style={{ width: '44px' }} />
          <th className="py-3 px-4 whitespace-nowrap" style={{ width: '180px' }}>SAP MAT ID</th>
          <th className="py-3 px-4">Description</th>
          <th className="py-3 px-4 whitespace-nowrap text-right" style={{ width: '90px' }}>Open QTY</th>
          <th className="py-3 px-4 whitespace-nowrap text-right" style={{ width: '100px' }}>Value (USD)</th>
          <th className="py-3 px-4 whitespace-nowrap" style={{ width: '120px' }}>Current Delivery</th>
          <th className="py-3 px-4" style={{ width: '44px' }} />
        </tr>
      </thead>
      <tbody>
        {poGroups.map(({ po, lines, total }) => {
          const isExpanded = expandedPos.has(po);
          return (
            <Fragment key={po}>
              {/* PO parent row */}
              <tr
                onClick={() => toggle(po)}
                className="cursor-pointer border-b border-slate-200 hover:bg-slate-100/70 transition-colors"
                style={{ background: '#f8fafc' }}
              >
                <td colSpan={7} className="py-2.5 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg
                        className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="font-mono text-sm font-bold text-slate-800">{po}</span>
                      <span className="bg-slate-200 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                        {lines.length} line{lines.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-slate-700 tabular-nums pr-2">
                      {formatCurrency(total)}
                    </span>
                  </div>
                </td>
              </tr>

              {/* Line item sub-rows */}
              {isExpanded && lines.map((item, idx) => (
                <tr
                  key={`${item['PO Number']}-${item['SAP MAT ID']}-${idx}`}
                  className="hover:bg-slate-50/50 transition-colors group/row"
                  style={{ borderBottom: '1px solid #f1f5f9' }}
                >
                  <td className="py-3 px-4" />
                  <td className="py-3 font-mono text-xs text-gray-500 truncate" style={{ paddingLeft: '32px', paddingRight: '16px' }}>
                    {formatMatId(item['SAP MAT ID'])}
                  </td>
                  <td className="py-3 px-4 text-[13px] text-gray-500 truncate" title={item['Item Description'] ?? undefined}>
                    {item['Item Description'] || '—'}
                  </td>
                  <td className="py-3 px-4 text-[13px] text-right font-medium text-gray-500 tabular-nums">
                    {Number(item['Open QTY'] || 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-[13px] text-right font-semibold text-gray-500 tabular-nums">
                    {formatCurrency(item['Open PO Value USD'])}
                  </td>
                  <td className="py-3 px-4 text-[13px] font-medium text-gray-500 truncate">
                    {formatDate(item['Delivery Date'])}
                  </td>
                  <td className="py-3 px-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemove(item); }}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all opacity-0 group-hover/row:opacity-100"
                      title="Remove from selection"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/* ─── Main Page ───────────────────────────────────────────── */
export default function ExpediteReviewPage() {
  const { selectedItems, toggleSelection, supplierEmails } = useExpediteStore();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [cardErrors, setCardErrors] = useState<Record<string, { to: boolean; cc: boolean }>>({});
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  /* Auto-clear card errors as emails are added via the store */
  useEffect(() => {
    setCardErrors((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next: typeof prev = {};
      let changed = false;
      for (const [id, errs] of Object.entries(prev)) {
        const stored = supplierEmails[id];
        const toNow = errs.to && (!stored || stored.to.length === 0);
        const ccNow = errs.cc && (!stored || stored.cc.length === 0);
        if (toNow || ccNow) next[id] = { to: toNow, cc: ccNow };
        if (toNow !== errs.to || ccNow !== errs.cc) changed = true;
      }
      return changed ? next : prev;
    });
  }, [supplierEmails]);

  /* ─── Grouping Logic ────────────────────────────────────── */
  const groupedBySupplier = useMemo(() => {
    const map = new Map<string, PurchaseOrder[]>();
    for (const item of selectedItems) {
      const supplier = item['Supplier Name'] || 'Unknown Supplier';
      if (!map.has(supplier)) map.set(supplier, []);
      map.get(supplier)!.push(item);
    }
    return Array.from(map.entries())
      .map(([supplierName, items]) => ({
        supplierName,
        supplierId: items[0]?.['Supplier ID'] ?? '',
        items,
        totalValue: items.reduce((sum, i) => sum + Number(i['Open PO Value USD'] ?? 0), 0),
      }))
      .sort((a, b) => a.supplierName.localeCompare(b.supplierName));
  }, [selectedItems]);

  /* ─── Proceed validation ────────────────────────────────── */
  function handleProceed() {
    const errors: Record<string, { to: boolean; cc: boolean }> = {};
    let firstErrorId: string | null = null;

    for (const group of groupedBySupplier) {
      const stored = supplierEmails[group.supplierId];
      const toMissing = !stored || stored.to.length === 0;
      const ccMissing = !stored || stored.cc.length === 0;
      if (toMissing || ccMissing) {
        errors[group.supplierId] = { to: toMissing, cc: ccMissing };
        if (!firstErrorId) firstErrorId = group.supplierId;
      }
    }

    if (Object.keys(errors).length > 0) {
      setCardErrors(errors);
      if (firstErrorId) {
        const el = cardRefs.current.get(firstErrorId);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    router.push('/po-expediting/confirm');
  }

  /* ─── Empty State ───────────────────────────────────────── */
  if (selectedItems.length === 0) {
    return (
      <div className="min-h-[100dvh] w-full bg-slate-50 flex flex-col items-center justify-center text-slate-900 font-sans p-6 relative overflow-hidden">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <header className="absolute top-0 left-0 right-0 h-14 md:h-16 px-4 md:px-8 flex items-center border-b border-gray-100 bg-white/80 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="mr-2 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors focus:ring-2 focus:ring-[#307c4c]/50 focus:outline-none"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#307c4c]">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M15 3h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4" />
                <line x1="12" y1="3" x2="12" y2="21" />
              </svg>
            </span>
            <span className="text-sm font-bold text-slate-900 tracking-tight hidden sm:block">NESR</span>
          </div>
        </header>

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-12 max-w-md w-full text-center flex flex-col items-center animate-in fade-in zoom-in-95 duration-500 mt-16">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">Expedite Queue is empty</h2>
          <p className="text-slate-500 mb-8 max-w-[250px]">
            You haven&apos;t selected any line items to expedite yet.
          </p>
          <Link
            href="/po-expediting"
            className="w-full inline-flex items-center justify-center h-12 bg-[#307c4c] hover:bg-[#26663e] text-white font-semibold rounded-xl transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-[#307c4c]/20"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  /* ─── Main Render ───────────────────────────────────────── */
  return (
    <div className="min-h-[100dvh] w-full bg-slate-50 font-sans text-slate-900 pt-16 pb-32 relative">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* ── Sticky top nav ── */}
      <header className="fixed top-0 left-0 right-0 h-14 md:h-16 px-4 md:px-8 flex items-center border-b border-gray-100 bg-white/80 backdrop-blur-md z-30 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="mr-2 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors focus:ring-2 focus:ring-[#307c4c]/50 focus:outline-none"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#307c4c]">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M15 3h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4" />
              <line x1="12" y1="3" x2="12" y2="21" />
            </svg>
          </span>
          <span className="text-sm font-bold text-slate-900 tracking-tight hidden sm:block">NESR</span>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* Page Header */}
        <header className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <Link href="/po-expediting" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-[#307c4c] mb-4 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Review Expedite Request</h1>
            <p className="text-slate-500 mt-1">
              {selectedItems.length} line item{selectedItems.length !== 1 ? 's' : ''} across {groupedBySupplier.length} distinct supplier{groupedBySupplier.length !== 1 ? 's' : ''}.
            </p>
          </div>
        </header>

        {/* ── Supplier Cards ── */}
        <div className="space-y-6">
          {groupedBySupplier.map((group) => {
            const buyerNames = [...new Set(
              group.items.map(i => i['Buyer Name']).filter((b): b is string => Boolean(b))
            )];
            return (
            <div
              key={group.supplierName}
              ref={(el) => {
                if (el) cardRefs.current.set(group.supplierId, el);
                else cardRefs.current.delete(group.supplierId);
              }}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
            >

              {/* Card header strip */}
              <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                      <line x1="9" y1="21" x2="9" y2="9" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">{group.supplierName}</h2>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-0.5">
                      {group.supplierId && <span className="mr-2 text-slate-400">{group.supplierId}</span>}
                      {group.items.length} Item{group.items.length !== 1 ? 's' : ''}
                      {buyerNames.length > 0 && (
                        <span className="text-slate-400 normal-case tracking-normal font-medium ml-1">
                          · {buyerNames.length === 1 ? 'Buyer' : 'Buyers'}: {buyerNames.join(', ')}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-500">Total Value</p>
                  <p className="text-lg font-bold text-[#307c4c] tabular-nums">{formatCurrency(group.totalValue)}</p>
                </div>
              </div>

              {/* ── 2-column body: PO table (70%) + Email card (30%) ── */}
              <div className="flex flex-col lg:flex-row">

                {/* Left — PO table */}
                <div className="flex-1 min-w-0">
                  <PoGroupedTable items={group.items} onRemove={toggleSelection} />
                </div>

                {/* Right — Email config card */}
                <div className="shrink-0" style={{ width: '300px' }}>
                  <SupplierEmailCard
                    supplierId={group.supplierId}
                    items={group.items}
                    cardError={cardErrors[group.supplierId]}
                  />
                </div>

              </div>
            </div>
            );
          })}
        </div>
      </div>

      {/* ── Floating Confirm Bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_32px_rgba(0,0,0,0.05)] p-4 sm:p-6 animate-in slide-in-from-bottom-2 duration-300">
        <div className="max-w-screen-xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <p className="text-sm font-semibold text-slate-800">Ready to generate tokens?</p>
            <p className="text-xs text-slate-500 mt-0.5">
              This will create tracking links and dispatch emails to all {groupedBySupplier.length} supplier{groupedBySupplier.length !== 1 ? 's' : ''}.
            </p>
          </div>
          <button
            onClick={handleProceed}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#1e293b] hover:bg-black text-white text-sm font-semibold px-8 py-3 rounded-xl transition-all duration-150 hover:scale-[1.02] active:scale-95 shadow-lg shadow-black/10"
          >
            Proceed to Review
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
