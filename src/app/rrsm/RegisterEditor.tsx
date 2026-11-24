'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · the register editor's two panels: a line, and a
   supplier. Both slide in from the right over the register, so
   the list being edited stays in view behind them.

   The form runs the same checks the server will (lib/rrsm/
   register.ts) before it sends anything, so a mistake is shown
   beside its field at once. The server runs them again on what
   arrives; the form's copy is a courtesy, not the rule.
   ───────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from 'react';
import { History, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import {
  deleteServiceLine,
  getServiceLineHistory,
  offHireServiceLine,
  reinstateServiceLine,
  saveServiceLine,
  saveSupplier,
  type RegisterEditorData,
  type RegisterLogEntry,
  type RegisterResult,
  type RegisterSupplier,
} from '@/app/actions/rrsm/register';
import type { RegisterRow } from '@/app/actions/rrsm/overview';
import {
  EMPTY_LINE_DRAFT,
  checkOffHireDate,
  checkServiceLine,
  checkSupplier,
  type ServiceLineDraft,
  type SupplierDraft,
} from '@/lib/rrsm/register';

/* ─── shared bits ────────────────────────────────────────────────────────────────────────── */

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-300 focus:border-[#307c4c] disabled:bg-slate-50 disabled:text-slate-500';

export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Buttons along the bottom; left out when the content carries its own (the registry form). */
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-slate-950/30 backdrop-blur-[1px]"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-[600px] flex-col bg-white shadow-2xl"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-[12.5px] text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <footer className="shrink-0 border-t border-slate-100 bg-slate-50/70 px-5 py-3">
            {footer}
          </footer>
        )}
      </aside>
    </>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      {hint && <p className="mt-0.5 text-[12px] text-slate-500">{hint}</p>}
      <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  error,
  required,
  wide,
  hint,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  wide?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block text-[12.5px] font-medium text-slate-600">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] font-medium text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] text-slate-400">{hint}</span>
      ) : null}
    </label>
  );
}

function Banner({ tone, children }: { tone: 'error' | 'info'; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-lg border px-3.5 py-2.5 text-[13px] ${
        tone === 'error'
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-[#307c4c]/20 bg-[#307c4c]/[0.06] text-[#1d4f31]'
      }`}
    >
      {children}
    </div>
  );
}

function PrimaryButton({
  busy,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={busy || props.disabled}
      className="inline-flex items-center gap-2 rounded-lg bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2b6f44] disabled:opacity-50"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

function GhostButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 ${props.className ?? ''}`}
    />
  );
}

/** Today in yyyy-mm-dd, for the off-hire date's default and its `max`. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const FIELD_LABEL: Record<string, string> = {
  supplierCode: 'Supplier',
  category: 'Category',
  description: 'Description',
  assetRef: 'Plate / serial',
  serviceNumber: 'Service number',
  segment: 'Segment',
  costCenter: 'Cost center',
  costCenterName: 'Cost center name',
  entity: 'Entity',
  purchasingGroup: 'Purchasing group',
  plant: 'Plant',
  operatingModel: 'Operating model',
  uom: 'Unit',
  rate: 'Rate',
  paymentTerms: 'Payment terms',
  startsOn: 'Starts',
  contractEndsOn: 'Contract ends',
  ownerEmail: 'Owner',
  requesterEmail: 'Requester',
  offHireDate: 'Off hire',
  name: 'Name',
  contactEmails: 'Contacts',
};

const ACTION_LABEL: Record<string, string> = {
  line_created: 'Added',
  line_updated: 'Changed',
  line_off_hired: 'Off hired',
  line_reinstated: 'Back on hire',
  line_deleted: 'Deleted',
};

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return Array.isArray(v) ? v.join(', ') || '—' : String(v);
}

/* ─── a line ─────────────────────────────────────────────────────────────────────────────── */

export function draftFromRow(r: RegisterRow): ServiceLineDraft {
  return {
    supplierCode: r.supplierCode,
    category: r.category,
    description: r.description,
    assetRef: r.assetRef,
    serviceNumber: r.serviceNumber,
    segment: r.segment,
    costCenter: r.costCenter,
    costCenterName: r.costCenterName,
    entity: r.entity,
    purchasingGroup: r.purchasingGroup,
    plant: r.plant,
    operatingModel: r.operatingModel,
    uom: r.uom,
    rate: r.rate === null ? '' : String(r.rate),
    paymentTerms: r.paymentTerms,
    startsOn: r.startsOn,
    contractEndsOn: r.contractEndsOn,
    ownerEmail: r.ownerEmail,
    requesterEmail: r.requesterEmail,
  };
}

/** The Service Registry item a unit belongs to, as the unit editor needs it. */
export interface UnitRegistryItem {
  code: string;
  itemName: string;
  supplierCode: string;
  supplierName: string;
  unitPrice: number;
  uomCode: string;
  rateToConfirm: boolean;
  category: string;
  serviceNumber: string;
}

export function LineDrawer({
  countryCode,
  currency,
  editor,
  categories,
  line,
  item,
  preview,
  onClose,
  onSaved,
  onAddSupplier,
}: {
  /** The registry item this unit is (or is to be) under; its supplier, rate and unit win. */
  item?: UnitRegistryItem | null;
  countryCode: string;
  currency: string;
  editor: RegisterEditorData;
  /** The categories already on this register, offered as suggestions so spellings converge. */
  categories: string[];
  /** Null to add a new line. */
  line: RegisterRow | null;
  /** Dev preview: checks run, nothing is sent. */
  preview?: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  onAddSupplier: () => void;
}) {
  const [draft, setDraft] = useState<ServiceLineDraft>(() =>
    line
      ? draftFromRow(line)
      : item
        ? {
            ...EMPTY_LINE_DRAFT,
            supplierCode: item.supplierCode,
            description: item.itemName,
            uom: item.uomCode,
            rate: item.rateToConfirm ? '' : String(item.unitPrice),
            category: item.category,
            serviceNumber: item.serviceNumber,
          }
        : { ...EMPTY_LINE_DRAFT },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<RegisterLogEntry[] | null>(null);
  const [offDate, setOffDate] = useState(todayIso());
  const [offNote, setOffNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const uomCodes = useMemo(() => editor.uoms.map((u) => u.code), [editor.uoms]);
  const offHired = !!line && (!!line.offHireDate || !line.active);
  const rateChanged = !!line && draft.rate.trim() !== (line.rate === null ? '' : String(line.rate));

  useEffect(() => {
    if (!line || preview) return;
    let live = true;
    void getServiceLineHistory(line.id).then((h) => live && setHistory(h));
    return () => {
      live = false;
    };
  }, [line, preview]);

  function set<K extends keyof ServiceLineDraft>(key: K, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  }

  async function run(key: string, fn: () => Promise<RegisterResult>, done: string) {
    setBusy(key);
    setError('');
    const r = preview ? { success: true } : await fn();
    setBusy(null);
    if (r.success) {
      onSaved(preview ? `${done} (preview, nothing saved)` : done);
      return;
    }
    if (r.fieldErrors) setErrors(r.fieldErrors);
    setError(r.error ?? 'That did not save.');
  }

  function save() {
    const checked = checkServiceLine(draft, uomCodes);
    if (!checked.ok) {
      setErrors(checked.errors as Record<string, string>);
      setError('Some fields need attention.');
      return;
    }
    void run(
      'save',
      () =>
        saveServiceLine({
          countryCode,
          id: line?.id ?? null,
          draft,
          registryCode: item?.code ?? null,
        }),
      line ? 'Line saved.' : 'Line added to the register.',
    );
  }

  function offHire() {
    const ok = checkOffHireDate(offDate, line?.startsOn || null, new Date());
    if (!ok.ok) {
      setError(ok.error);
      return;
    }
    void run(
      'off',
      () => offHireServiceLine({ id: line!.id, date: offDate, note: offNote }),
      'Line off hired. The next month opened will leave it out.',
    );
  }

  const ro = !editor.canEdit || offHired;
  /* Under a registry item, its supplier, unit and rate are the item's: changed on the item. */
  const fromItem = !!item;
  const rateLocked = ro || (fromItem && !item!.rateToConfirm);
  const supplier = editor.suppliers.find((s) => s.code === draft.supplierCode);

  return (
    <Drawer
      title={line ? line.description : 'Add a line'}
      subtitle={
        line
          ? `Line ${line.id}${line.assetRef ? ` · ${line.assetRef}` : ''} · ${line.supplierName}`
          : 'A rented asset or a recurrent service, standing between months.'
      }
      onClose={onClose}
      footer={
        editor.canEdit && !offHired ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <GhostButton onClick={onClose}>Cancel</GhostButton>
            <PrimaryButton busy={busy === 'save'} onClick={save}>
              {line ? 'Save changes' : 'Add to register'}
            </PrimaryButton>
          </div>
        ) : (
          <div className="flex justify-end">
            <GhostButton onClick={onClose}>Close</GhostButton>
          </div>
        )
      }
    >
      {error && <Banner tone="error">{error}</Banner>}
      {item && (
        <Banner tone="info">
          A unit of Service Registry item <b className="font-mono">{item.code}</b>, {item.itemName}.
          Its supplier, unit and rate come from the item; change them there.
          {item.rateToConfirm &&
            ' The item’s rate is still to be confirmed, so set it here for now.'}
        </Banner>
      )}
      {offHired && (
        <Banner tone="info">
          Off hire since {line?.offHireDate || 'an earlier date'}. Put it back on hire to change it.
        </Banner>
      )}

      <Section title="Supplier">
        <Field label="Supplier" required wide error={errors.supplierCode}>
          {fromItem ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
              {item!.supplierName} · <span className="font-mono">{item!.supplierCode}</span>
            </div>
          ) : (
            <select
              value={draft.supplierCode}
              disabled={ro}
              onChange={(e) => set('supplierCode', e.target.value)}
              className={INPUT}
            >
              <option value="">Pick a supplier…</option>
              {editor.suppliers
                .filter((s) => s.active || s.code === draft.supplierCode)
                .map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} · {s.code}
                  </option>
                ))}
            </select>
          )}
          {!ro && !fromItem && (
            <span className="mt-1 block text-[12px] text-slate-400">
              Not listed?{' '}
              <button
                type="button"
                onClick={onAddSupplier}
                className="font-semibold text-[#307c4c] hover:underline"
              >
                Add a supplier
              </button>
              {supplier && !supplier.contactEmails.length && (
                <span className="text-amber-600">
                  {' '}
                  · this supplier has no contact email, so invitations can only be sent by link
                </span>
              )}
            </span>
          )}
        </Field>
      </Section>

      <Section title="What it is">
        <Field
          label="Category"
          wide
          error={errors.category}
          hint="e.g. Equipment Rental, Transportation, Accommodation. Pick an existing one where it fits."
        >
          <input
            value={draft.category}
            disabled={ro}
            list="rrsm-categories"
            onChange={(e) => set('category', e.target.value)}
            className={INPUT}
          />
          <datalist id="rrsm-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Description" required wide error={errors.description}>
          <input
            value={draft.description}
            disabled={ro}
            onChange={(e) => set('description', e.target.value)}
            placeholder="e.g. TOYOTA LAND CRUISER, or Staff house, Mussafah"
            className={INPUT}
          />
        </Field>
        <Field
          label="Plate / serial"
          error={errors.assetRef}
          hint="Blank for a service. Must be unique among lines on hire."
        >
          <input
            value={draft.assetRef}
            disabled={ro}
            onChange={(e) => set('assetRef', e.target.value)}
            className={`${INPUT} font-mono`}
          />
        </Field>
        <Field label="SAP service number" error={errors.serviceNumber}>
          <input
            value={draft.serviceNumber}
            disabled={ro}
            onChange={(e) => set('serviceNumber', e.target.value)}
            className={`${INPUT} font-mono`}
          />
        </Field>
        {/* No operating model to pick (user decision, 24 Nov 2026): who validates a line is
            chosen per line when the buyer sends it to Ops. A new line keeps the default and an
            existing one keeps what it had; neither is shown. */}
      </Section>

      <Section
        title="Price"
        hint={
          rateChanged
            ? 'A new rate applies from the next month opened. A month already open keeps the rate it opened with.'
            : undefined
        }
      >
        <Field label={`Rate (${currency})`} error={errors.rate} hint="Blank if not agreed yet.">
          <input
            value={draft.rate}
            disabled={rateLocked}
            inputMode="decimal"
            onChange={(e) => set('rate', e.target.value)}
            className={`${INPUT} text-right font-mono`}
          />
        </Field>
        <Field label="Per" required error={errors.uom}>
          <select
            value={draft.uom}
            disabled={ro || fromItem}
            onChange={(e) => set('uom', e.target.value)}
            className={INPUT}
          >
            {editor.uoms.map((u) => (
              <option key={u.code} value={u.code}>
                {u.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Payment terms" error={errors.paymentTerms}>
          <input
            value={draft.paymentTerms}
            disabled={ro}
            onChange={(e) => set('paymentTerms', e.target.value)}
            placeholder="e.g. NT30"
            className={`${INPUT} font-mono`}
          />
        </Field>
      </Section>

      <Section title="Where the cost lands">
        <Field label="Segment" required error={errors.segment}>
          <input
            value={draft.segment}
            disabled={ro}
            onChange={(e) => set('segment', e.target.value)}
            className={`${INPUT} font-mono`}
          />
        </Field>
        <Field label="Cost center" required error={errors.costCenter}>
          <input
            value={draft.costCenter}
            disabled={ro}
            onChange={(e) => set('costCenter', e.target.value)}
            className={`${INPUT} font-mono`}
          />
        </Field>
        <Field label="Cost center name" wide error={errors.costCenterName}>
          <input
            value={draft.costCenterName}
            disabled={ro}
            onChange={(e) => set('costCenterName', e.target.value)}
            className={INPUT}
          />
        </Field>
        <Field label="Entity" error={errors.entity}>
          <input
            value={draft.entity}
            disabled={ro}
            onChange={(e) => set('entity', e.target.value)}
            className={`${INPUT} font-mono`}
          />
        </Field>
        <Field label="Purchasing group" error={errors.purchasingGroup}>
          <input
            value={draft.purchasingGroup}
            disabled={ro}
            onChange={(e) => set('purchasingGroup', e.target.value)}
            className={`${INPUT} font-mono`}
          />
        </Field>
        <Field label="Plant" error={errors.plant}>
          <input
            value={draft.plant}
            disabled={ro}
            onChange={(e) => set('plant', e.target.value)}
            className={`${INPUT} font-mono`}
          />
        </Field>
      </Section>

      <Section
        title="Contract"
        hint="An end date puts the line on the Renewals page 90 days ahead, and the owner and requester are the ones reminded."
      >
        <Field label="Starts" error={errors.startsOn}>
          <input
            type="date"
            value={draft.startsOn}
            disabled={ro}
            onChange={(e) => set('startsOn', e.target.value)}
            className={INPUT}
          />
        </Field>
        <Field
          label="Contract ends"
          error={errors.contractEndsOn}
          hint="Blank for a standing arrangement."
        >
          <input
            type="date"
            value={draft.contractEndsOn}
            disabled={ro}
            onChange={(e) => set('contractEndsOn', e.target.value)}
            className={INPUT}
          />
        </Field>
        <Field label="Owner email" error={errors.ownerEmail}>
          <input
            type="email"
            value={draft.ownerEmail}
            disabled={ro}
            onChange={(e) => set('ownerEmail', e.target.value)}
            className={INPUT}
          />
        </Field>
        <Field label="Requester email" error={errors.requesterEmail}>
          <input
            type="email"
            value={draft.requesterEmail}
            disabled={ro}
            onChange={(e) => set('requesterEmail', e.target.value)}
            className={INPUT}
          />
        </Field>
      </Section>

      {/* ── off hire, back on hire, delete ───────────────────── */}
      {line && editor.canEdit && (
        <section className="rounded-xl border border-slate-200 p-4">
          {offHired ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-slate-600">
                Came back, or off hired by mistake? Put it back and the next month opened will carry
                it again.
              </p>
              <GhostButton
                disabled={busy === 'back'}
                onClick={() =>
                  void run('back', () => reinstateServiceLine(line.id), 'Line is back on hire.')
                }
              >
                {busy === 'back' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Back on hire
              </GhostButton>
            </div>
          ) : (
            <>
              <h3 className="text-[13px] font-semibold text-slate-800">Off hire</h3>
              <p className="mt-0.5 text-[12.5px] text-slate-500">
                The asset has gone for good. The line stays on record; the next month opened leaves
                it out. For a month it was not used, untick On hire on Ops validation instead.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
                <Field label="Date">
                  <input
                    type="date"
                    value={offDate}
                    max={todayIso()}
                    onChange={(e) => setOffDate(e.target.value)}
                    className={INPUT}
                  />
                </Field>
                <Field label="Note">
                  <input
                    value={offNote}
                    onChange={(e) => setOffNote(e.target.value)}
                    placeholder="Optional, e.g. returned to depot"
                    className={INPUT}
                  />
                </Field>
                <GhostButton disabled={busy === 'off'} onClick={offHire}>
                  {busy === 'off' && <Loader2 className="h-4 w-4 animate-spin" />}
                  Off hire
                </GhostButton>
              </div>
            </>
          )}

          {line.cycles === 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="text-[12.5px] text-slate-500">
                Entered by mistake? It has not been in a cycle yet, so it can still be deleted.
              </p>
              {confirmDelete ? (
                <div className="flex gap-2">
                  <GhostButton onClick={() => setConfirmDelete(false)}>Keep it</GhostButton>
                  <button
                    type="button"
                    disabled={busy === 'del'}
                    onClick={() =>
                      void run('del', () => deleteServiceLine(line.id), 'Line deleted.')
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {busy === 'del' && <Loader2 className="h-4 w-4 animate-spin" />}
                    Delete for good
                  </button>
                </div>
              ) : (
                <GhostButton
                  onClick={() => setConfirmDelete(true)}
                  className="hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </GhostButton>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── history ──────────────────────────────────────────── */}
      {line && !preview && (
        <section>
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <History className="h-3.5 w-3.5" /> History
          </h3>
          {history === null ? (
            <p className="mt-2 text-[12.5px] text-slate-400">Loading…</p>
          ) : !history.length ? (
            <p className="mt-2 text-[12.5px] text-slate-400">
              No changes recorded. Lines loaded before the editor existed start their history here.
            </p>
          ) : (
            <ol className="mt-2 space-y-2.5">
              {history.map((h) => (
                <li key={h.id} className="rounded-lg border border-slate-100 px-3 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px]">
                    <span className="font-semibold text-slate-700">
                      {ACTION_LABEL[h.action] ?? h.action}
                    </span>
                    <span className="text-slate-400">
                      {h.actor} · {new Date(h.at).toLocaleString('en-GB')}
                    </span>
                  </div>
                  {h.action === 'line_updated' && (
                    <ul className="mt-1 space-y-0.5 text-[12px] text-slate-600">
                      {Object.entries(h.changes).map(([k, [a, b]]) => (
                        <li key={k}>
                          {FIELD_LABEL[k] ?? k}: <span className="text-slate-400">{show(a)}</span> →{' '}
                          <b className="font-semibold">{show(b)}</b>
                        </li>
                      ))}
                    </ul>
                  )}
                  {h.note && <p className="mt-1 text-[12px] italic text-slate-500">{h.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </Drawer>
  );
}

/* ─── a supplier ─────────────────────────────────────────────────────────────────────────── */

export function SupplierDrawer({
  countryCode,
  supplier,
  canEdit,
  preview,
  onClose,
  onSaved,
}: {
  countryCode: string;
  /** Null to add one. */
  supplier: RegisterSupplier | null;
  canEdit: boolean;
  preview?: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [draft, setDraft] = useState<SupplierDraft>(() => ({
    code: supplier?.code ?? '',
    name: supplier?.name ?? '',
    contactEmails: supplier?.contactEmails.join(', ') ?? '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function set<K extends keyof SupplierDraft>(key: K, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  }

  async function save() {
    const checked = checkSupplier(draft);
    if (!checked.ok) {
      setErrors(checked.errors as Record<string, string>);
      setError('Some fields need attention.');
      return;
    }
    setBusy(true);
    setError('');
    const r = preview
      ? { success: true }
      : await saveSupplier({ countryCode, draft, existingCode: supplier?.code ?? null });
    setBusy(false);
    if (r.success) {
      onSaved(
        preview
          ? 'Supplier saved (preview, nothing saved)'
          : supplier
            ? 'Supplier saved.'
            : 'Supplier added.',
      );
      return;
    }
    if ('fieldErrors' in r && r.fieldErrors) setErrors(r.fieldErrors);
    setError(('error' in r && r.error) || 'That did not save.');
  }

  return (
    <Drawer
      title={supplier ? supplier.name : 'Add a supplier'}
      subtitle={
        supplier
          ? `SAP vendor ${supplier.code} · ${supplier.linesHere} line${supplier.linesHere === 1 ? '' : 's'} here`
          : 'Suppliers are shared across countries, keyed by SAP vendor code.'
      }
      onClose={onClose}
      footer={
        canEdit ? (
          <div className="flex justify-end gap-2">
            <GhostButton onClick={onClose}>Cancel</GhostButton>
            <PrimaryButton busy={busy} onClick={() => void save()}>
              {supplier ? 'Save changes' : 'Add supplier'}
            </PrimaryButton>
          </div>
        ) : (
          <div className="flex justify-end">
            <GhostButton onClick={onClose}>Close</GhostButton>
          </div>
        )
      }
    >
      {error && <Banner tone="error">{error}</Banner>}
      <Section title="Supplier">
        <Field
          label="SAP vendor code"
          required
          error={errors.code}
          hint={supplier ? 'Fixed once saved.' : 'Leading zeros are dropped: 0000100482 is 100482.'}
        >
          <input
            value={draft.code}
            disabled={!!supplier || !canEdit}
            onChange={(e) => set('code', e.target.value)}
            className={`${INPUT} font-mono`}
          />
        </Field>
        <Field label="Name" required error={errors.name}>
          <input
            value={draft.name}
            disabled={!canEdit}
            onChange={(e) => set('name', e.target.value)}
            className={INPUT}
          />
        </Field>
        <Field
          label="Contact emails"
          wide
          error={errors.contactEmails}
          hint="Where the monthly submission link is sent. Separate several with commas."
        >
          <textarea
            rows={3}
            value={draft.contactEmails}
            disabled={!canEdit}
            onChange={(e) => set('contactEmails', e.target.value)}
            className={INPUT}
          />
        </Field>
      </Section>
    </Drawer>
  );
}
