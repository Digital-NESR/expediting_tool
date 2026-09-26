'use client';

import { useCallback, useEffect, useState } from 'react';
import EmployeeSearchInput, { type Employee } from '@/components/EmployeeSearchInput';
import {
  getSoaRecipients,
  updateSoaVendorContact,
} from '@/app/actions/soa/recipients';
import type { CountryRecipients, VendorRecipient } from '@/lib/soa/recipients';

/**
 * Step two of outreach: who each letter actually goes to.
 *
 * Vendors are ordered by amount because that is the order in which a missing address costs the
 * most. Addresses come from the supplier directory on every load rather than being frozen onto the
 * vendor, so an upstream correction is picked up without an import; what persists is only what a
 * champion changed. Both halves of that persist — an address they found stays found, and one they
 * removed stays removed — which is why a removal is shown struck through with an undo rather than
 * simply vanishing.
 *
 * CC is different and deliberately not saved: the sender and the country AP mailbox are implied by
 * who is sending and where the vendor is told to reply, and anyone else is a one-off for this send.
 */

interface Props {
  countryId: string;
  canEdit: boolean;
  senderEmail: string;
  onBack: () => void;
  /** Extra NESR addresses to CC on this send; held by the parent so a send can read them. */
  onCcChange: (emails: string[]) => void;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export default function RecipientList({
  countryId,
  canEdit,
  senderEmail,
  onBack,
  onCcChange,
}: Props) {
  const [data, setData] = useState<CountryRecipients | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [extraCc, setExtraCc] = useState<Employee[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setBusy(true);
    const res = await getSoaRecipients(countryId);
    if (res.success && res.data) setData(res.data);
    else setNote(res.error ?? 'Could not load recipients.');
    setBusy(false);
  }, [countryId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onCcChange(extraCc.map((e) => e.mail));
  }, [extraCc, onCcChange]);

  async function change(vendorId: number, email: string, action: 'add' | 'remove' | 'restore') {
    setBusy(true);
    const res = await updateSoaVendorContact({ countryId, vendorId, email, action });
    setBusy(false);
    if (!res.success) return setNote(res.error ?? 'Could not save that change.');
    setNote(null);
    if (res.data) setData(res.data);
    if (action === 'add') setDrafts((d) => ({ ...d, [vendorId]: '' }));
  }

  const vendors = data?.vendors ?? [];
  const unreachable = vendors.filter((v) => !v.to.length).length;
  const totalAddresses = vendors.reduce((n, v) => n + v.to.length, 0);

  return (
    <div className="bg-white rounded-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-b-[#F0F0F0] px-4 py-3">
        <div>
          <div className="text-[13px] font-bold text-sns-ink">Recipients</div>
          <div className="text-[11px] text-sns-grey mt-0.5">
            {vendors.length} vendors · {totalAddresses} addresses ·{' '}
            {unreachable > 0 ? (
              <span className="text-[#B71C1C] font-bold">{unreachable} with nobody to write to</span>
            ) : (
              'every vendor reachable'
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="bg-white text-sns-ink border border-sns-line px-3 py-[7px] rounded-md text-[11px] font-bold"
        >
          ← Back to the letter
        </button>
      </div>

      {/* CC applies to the whole send, so it sits above the list rather than on each vendor. */}
      <div className="px-4 py-3 border-b border-b-[#F0F0F0] bg-[#FAFBFA]">
        <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-sns-grey mb-1.5">
          CC on every message
        </div>
        <div className="flex flex-wrap gap-1.5 items-center mb-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#ECEFEC] px-2.5 py-1 text-[11px]">
            {senderEmail}
            <span className="text-[9.5px] uppercase tracking-[0.4px] text-sns-grey">you</span>
          </span>
          {data?.apEmail ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#ECEFEC] px-2.5 py-1 text-[11px]">
              {data.apEmail}
              <span className="text-[9.5px] uppercase tracking-[0.4px] text-sns-grey">AP</span>
            </span>
          ) : (
            <span className="rounded-full bg-[#FDECEA] px-2.5 py-1 text-[11px] text-[#B71C1C] font-bold">
              No AP mailbox set for this country
            </span>
          )}
          {extraCc.map((e) => (
            <span
              key={e.mail}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#E3F0E8] px-2.5 py-1 text-[11px]"
            >
              {e.display_name}
              <button
                type="button"
                onClick={() => setExtraCc((list) => list.filter((x) => x.mail !== e.mail))}
                className="text-sns-grey hover:text-[#B71C1C] font-bold"
                aria-label={`Remove ${e.display_name} from CC`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {canEdit && (
          <div className="max-w-[420px]">
            <EmployeeSearchInput
              placeholder="Add a NESR colleague to CC…"
              excludeEmails={[senderEmail, ...(data?.apEmail ? [data.apEmail] : []), ...extraCc.map((e) => e.mail)]}
              onSelect={(emp) =>
                setExtraCc((list) => (list.some((x) => x.mail === emp.mail) ? list : [...list, emp]))
              }
            />
            <div className="text-[10.5px] text-sns-grey mt-1">
              Colleagues added here apply to this send only and are not kept for next time.
            </div>
          </div>
        )}
      </div>

      {note && (
        <div className="mx-4 mt-3 rounded-md bg-[#FDECEA] border border-[#F5C6C2] px-3 py-2 text-[11.5px] text-[#B71C1C]">
          {note}
        </div>
      )}

      <div className="divide-y divide-[#F3F3F3]">
        {vendors.map((v) => (
          <VendorRow
            key={v.vendorId}
            vendor={v}
            canEdit={canEdit}
            busy={busy}
            draft={drafts[v.vendorId] ?? ''}
            open={expanded.has(v.vendorId)}
            onToggle={() =>
              setExpanded((s) => {
                const next = new Set(s);
                if (next.has(v.vendorId)) next.delete(v.vendorId);
                else next.add(v.vendorId);
                return next;
              })
            }
            onDraft={(value) => setDrafts((d) => ({ ...d, [v.vendorId]: value }))}
            onChange={change}
          />
        ))}
        {!vendors.length && !busy && (
          <div className="px-4 py-6 text-[12px] text-sns-grey">
            Nothing is in scope for this country yet — scope some vendors first.
          </div>
        )}
      </div>
    </div>
  );
}

function VendorRow({
  vendor,
  canEdit,
  busy,
  draft,
  open,
  onToggle,
  onDraft,
  onChange,
}: {
  vendor: VendorRecipient;
  canEdit: boolean;
  busy: boolean;
  draft: string;
  open: boolean;
  onToggle: () => void;
  onDraft: (value: string) => void;
  onChange: (vendorId: number, email: string, action: 'add' | 'remove' | 'restore') => void;
}) {
  const none = vendor.to.length === 0;
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-start gap-3">
        <div className="w-[230px] shrink-0">
          <div className="text-[12.5px] font-bold text-sns-ink truncate" title={vendor.vendorName}>
            {vendor.vendorName}
          </div>
          <div className="text-[10.5px] text-sns-grey font-[family-name:monospace]">
            {vendor.vendorNo}
          </div>
        </div>
        <div className="w-[110px] shrink-0 text-[12px] font-bold text-sns-ink tabular-nums text-right">
          {money(vendor.amountUsd)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5">
            {vendor.to.map((a) => (
              <span
                key={a.email}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ${
                  a.origin === 'added' ? 'bg-[#E3F0E8]' : 'bg-[#ECEFEC]'
                }`}
                title={a.origin === 'added' ? 'Added here and saved for next time' : 'From the supplier directory'}
              >
                {a.email}
                <span className="text-[9.5px] uppercase tracking-[0.4px] text-sns-grey">
                  {a.origin === 'added' ? 'added' : 'directory'}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onChange(vendor.vendorId, a.email, 'remove')}
                    className="text-sns-grey hover:text-[#B71C1C] font-bold disabled:opacity-40"
                    aria-label={`Remove ${a.email}`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {none && (
              <span className="text-[11px] font-bold text-[#B71C1C]">
                No address on file — this vendor cannot be written to.
              </span>
            )}
            {(vendor.suppressed.length > 0 || vendor.droppedInternal.length > 0 || canEdit) && (
              <button
                type="button"
                onClick={onToggle}
                className="text-[10.5px] text-sns-grey underline underline-offset-2"
              >
                {open ? 'hide' : 'add or restore'}
                {vendor.suppressed.length > 0 && ` · ${vendor.suppressed.length} removed`}
                {vendor.droppedInternal.length > 0 && ` · ${vendor.droppedInternal.length} internal`}
              </button>
            )}
          </div>

          {open && (
            <div className="mt-2 pl-0.5">
              {canEdit && (
                <div className="flex gap-1.5 items-center mb-2">
                  <input
                    value={draft}
                    onChange={(e) => onDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && draft.trim()) {
                        e.preventDefault();
                        onChange(vendor.vendorId, draft.trim(), 'add');
                      }
                    }}
                    placeholder="name@supplier.com"
                    className="w-[260px] border border-sns-line rounded-md px-2.5 py-1.5 text-[11.5px]"
                  />
                  <button
                    type="button"
                    disabled={busy || !draft.trim()}
                    onClick={() => onChange(vendor.vendorId, draft.trim(), 'add')}
                    className="bg-sns-green text-white border-none px-3 py-[6px] rounded-md text-[11px] font-bold disabled:opacity-50"
                  >
                    Add
                  </button>
                  <span className="text-[10.5px] text-sns-grey">kept for the next cycle too</span>
                </div>
              )}

              {vendor.suppressed.map((email) => (
                <div key={email} className="flex items-center gap-2 text-[11px] py-0.5">
                  <span className="line-through text-sns-grey">{email}</span>
                  {canEdit && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onChange(vendor.vendorId, email, 'restore')}
                      className="text-sns-green font-bold underline underline-offset-2 disabled:opacity-40"
                    >
                      undo
                    </button>
                  )}
                </div>
              ))}

              {vendor.droppedInternal.map((email) => (
                <div key={email} className="text-[11px] text-sns-grey py-0.5">
                  {email} — NESR address, left out of the vendor letter
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
