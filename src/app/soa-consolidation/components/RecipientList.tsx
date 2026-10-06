'use client';

import { useCallback, useEffect, useState } from 'react';
import EmployeeSearchInput, { type Employee } from '@/components/EmployeeSearchInput';
import {
  getSoaRecipients,
  removeSoaVendorFromCycle,
  updateSoaVendorContact,
} from '@/app/actions/soa/recipients';
import type { CountryRecipients, VendorRecipient } from '@/lib/soa/recipients';
import { useConfirm } from './useConfirm';

/**
 * Step two of outreach: who each letter actually goes to.
 *
 * Vendors are ordered by amount because that is the order in which a missing address costs the
 * most. Addresses come from the supplier directory on every load rather than being frozen onto the
 * vendor, so an upstream correction is picked up without an import; what persists is only what a
 * champion changed. Both halves of that persist, an address they found stays found, and one they
 * removed stays removed. Which is why a removal is shown struck through with an undo rather than
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
  /** Default copies the sender dropped for this send. Also the parent's to pass on. */
  onCcRemovedChange: (emails: string[]) => void;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/**
 * Solid green for an address the system supplied, outlined for one somebody typed.
 *
 * The same convention as PO Expediting, and it carries the distinction that used to need a word
 * of uppercase text beside every chip. Where an address came from matters when a send bounces:
 * a directory address is wrong upstream and worth correcting there, a hand-added one is wrong here.
 */
function Chip({
  label,
  system,
  locked,
  title,
  onRemove,
}: {
  label: string;
  system: boolean;
  locked?: boolean;
  title?: string;
  onRemove?: () => void;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-[5px] text-[11.5px] font-medium ${
        system ? 'bg-sns-green text-white' : 'border border-sns-green bg-white text-sns-green'
      }`}
    >
      {locked && <span aria-hidden>🔒</span>}
      {label}
      {onRemove && !locked && (
        <button
          type="button"
          onClick={onRemove}
          className={`font-bold leading-none ${system ? 'text-white/70 hover:text-white' : 'text-sns-green/60 hover:text-sns-green'}`}
          aria-label={`Remove ${label}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

export default function RecipientList({
  countryId,
  canEdit,
  senderEmail,
  onBack,
  onCcChange,
  onCcRemovedChange,
}: Props) {
  const [data, setData] = useState<CountryRecipients | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [extraCc, setExtraCc] = useState<Employee[]>([]);
  // Defaults the sender took off. Held here rather than filtered out of `data`, so putting one
  // back is a click and not a page reload.
  const [ccRemoved, setCcRemoved] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const { ask, dialog } = useConfirm();

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

  useEffect(() => {
    onCcRemovedChange(ccRemoved);
  }, [ccRemoved, onCcRemovedChange]);

  const dropCc = (email: string) => setCcRemoved((list) => [...new Set([...list, email])]);
  const isDropped = (email: string) => ccRemoved.includes(email);

  /**
   * Take a vendor out of the cycle.
   *
   * Confirmed first, because it is the one control here that throws work away rather than
   * changing it: every address a champion tracked down for that supplier goes with the row, and
   * putting it back means finding them again in Vendor Scoping.
   */
  async function removeVendor(vendor: VendorRecipient) {
    const ok = await ask({
      title: 'Remove this vendor from the cycle?',
      confirmLabel: 'Remove the vendor',
      body: (
        <>
          <strong>{vendor.vendorName}</strong> will not be written to this quarter, and the{' '}
          {vendor.to.length === 1 ? 'address' : 'addresses'} on this line{' '}
          {vendor.to.length === 1 ? 'goes' : 'go'} with it. Putting them back means finding them
          again in Vendor Scoping.
        </>
      ),
    });
    if (!ok) return;
    setBusy(true);
    const res = await removeSoaVendorFromCycle({ countryId, entryId: vendor.entryId });
    setBusy(false);
    if (!res.success) return setNote(res.error ?? 'Could not remove that vendor.');
    setNote(null);
    if (res.data) setData(res.data);
  }

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
      {dialog}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-b-[#F0F0F0] px-4 py-3">
        <div>
          <div className="text-[13px] font-bold text-sns-ink">Recipients</div>
          <div className="text-[11px] text-sns-grey mt-0.5">
            {vendors.length} vendors · {totalAddresses} addresses ·{' '}
            {unreachable > 0 ? (
              <span className="text-[#B71C1C] font-bold">
                {unreachable} with nobody to write to
              </span>
            ) : (
              'every vendor reachable'
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Says what the two chip styles mean, once, rather than a word of uppercase beside
              every address. */}
          <span className="inline-flex items-center gap-1.5 text-[10.5px] text-sns-grey">
            <span className="h-2.5 w-2.5 rounded-sm bg-sns-green" />
            from the system
            <span className="ml-1.5 h-2.5 w-2.5 rounded-sm border border-sns-green bg-white" />
            added here
          </span>
          <button
            type="button"
            onClick={onBack}
            className="bg-white text-sns-ink border border-sns-line px-3 py-[7px] rounded-md text-[11px] font-bold"
          >
            ← Back to the letter
          </button>
        </div>
      </div>

      {/* CC applies to the whole send, so it sits above the list rather than on each vendor. */}
      <div className="px-4 py-3 border-b border-b-[#F0F0F0] bg-[#FAFBFA]">
        <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-sns-grey mb-1.5">
          CC on every message
        </div>
        <div className="flex flex-wrap gap-1.5 items-center mb-2">
          {/* The sender is always copied and cannot be dropped: they are accountable for the send. */}
          <Chip label={senderEmail} system locked title="You, always copied" />
          {data?.apEmails.length ? (
            data.apEmails
              .filter((ap) => !isDropped(ap))
              .map((ap) => (
                <Chip
                  key={ap}
                  label={ap}
                  system
                  title="Accounts Payable for this country"
                  onRemove={() => dropCc(ap)}
                />
              ))
          ) : (
            <span className="rounded-md bg-[#FDECEA] px-2.5 py-[5px] text-[11.5px] font-bold text-[#B71C1C]">
              No AP contact set for this country, add one in /admin
            </span>
          )}
          {(data?.championEmails ?? [])
            .filter((c) => c.toLowerCase() !== senderEmail.toLowerCase() && !isDropped(c))
            .map((champ) => (
              <Chip
                key={champ}
                label={champ}
                system
                title="Champion for this country"
                onRemove={() => dropCc(champ)}
              />
            ))}
          {extraCc.map((e) => (
            <Chip
              key={e.mail}
              label={e.display_name}
              system={false}
              title={`${e.mail}. Added for this send only`}
              onRemove={() => setExtraCc((list) => list.filter((x) => x.mail !== e.mail))}
            />
          ))}
        </div>
        {ccRemoved.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-sns-grey">
            <span>Not copied:</span>
            {ccRemoved.map((email) => (
              <span key={email} className="inline-flex items-center gap-1.5">
                <span className="line-through">{email}</span>
                <button
                  type="button"
                  onClick={() => setCcRemoved((list) => list.filter((e) => e !== email))}
                  className="font-semibold text-sns-green hover:underline"
                >
                  undo
                </button>
              </span>
            ))}
          </div>
        )}
        {canEdit && (
          <div className="max-w-[420px]">
            <EmployeeSearchInput
              placeholder="Add a NESR colleague to CC…"
              excludeEmails={[
                senderEmail,
                ...(data?.apEmails ?? []),
                ...(data?.championEmails ?? []),
                ...extraCc.map((e) => e.mail),
              ]}
              onSelect={(emp) =>
                setExtraCc((list) =>
                  list.some((x) => x.mail === emp.mail) ? list : [...list, emp],
                )
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
            onRemove={() => removeVendor(v)}
          />
        ))}
        {!vendors.length && !busy && (
          <div className="px-4 py-6 text-[12px] text-sns-grey">
            Nothing is in scope for this country yet, scope some vendors first.
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
  onRemove,
}: {
  vendor: VendorRecipient;
  canEdit: boolean;
  busy: boolean;
  draft: string;
  open: boolean;
  onToggle: () => void;
  onDraft: (value: string) => void;
  onChange: (vendorId: number, email: string, action: 'add' | 'remove' | 'restore') => void;
  onRemove: () => void;
}) {
  const none = vendor.to.length === 0;
  const hidden = vendor.suppressed.length + vendor.droppedInternal.length;
  /* Only a vendor nobody has written to. Once a letter has gone out the entry is what the
     dispatches and the evidence hang off, so the server refuses it and the control is not
     offered; the title says why rather than leaving a dead button to be clicked. */
  const removable = vendor.status === 'scoped';

  return (
    <div className="px-4 py-3">
      {/* One line for who and how much, with the amount and the row's controls on the right so
          the eye can run down each column instead of hunting through wrapped chips. */}
      <div className="flex items-baseline gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-bold text-sns-ink" title={vendor.vendorName}>
            {vendor.vendorName}
          </div>
          <div className="text-[10.5px] text-sns-grey font-[family-name:monospace]">
            {vendor.vendorNo}
          </div>
        </div>

        <div className="shrink-0 text-[12.5px] font-bold text-sns-ink tabular-nums">
          {money(vendor.amountUsd)}
        </div>

        <div className="w-[120px] shrink-0 text-right">
          {none ? (
            <span className="text-[11px] font-bold text-[#B71C1C]">No address</span>
          ) : (
            <span className="text-[11px] text-sns-grey tabular-nums">
              {vendor.to.length} {vendor.to.length === 1 ? 'address' : 'addresses'}
            </span>
          )}
        </div>

        {/* The blank template as this supplier was sent it, for when they say it never arrived or
            want it at another address. Rebuilt on request rather than stored, so it always carries
            the current AP contacts. */}
        <a
          href={`/api/soa/vendor-template/${vendor.entryId}`}
          title={`Download the blank template for ${vendor.vendorName}`}
          aria-label={`Download the blank template for ${vendor.vendorName}`}
          className="shrink-0 text-[11px] font-semibold text-sns-grey hover:text-sns-green hover:underline"
        >
          Template
        </a>

        <button
          type="button"
          onClick={onToggle}
          className="w-[76px] shrink-0 text-right text-[11px] font-semibold text-sns-green hover:underline"
        >
          {open ? 'Done' : canEdit ? 'Edit' : 'Details'}
          {!open && hidden > 0 && <span className="text-sns-grey"> · {hidden}</span>}
        </button>

        {/* Last, and quiet until hovered. It is the one control on the line that throws the row
            away, so it should not sit where the eye lands first. */}
        {canEdit && (
          <button
            type="button"
            onClick={removable ? onRemove : undefined}
            disabled={!removable || busy}
            aria-label={`Remove ${vendor.vendorName} from this cycle`}
            title={
              removable
                ? `Remove ${vendor.vendorName} from this cycle`
                : 'Already written to. Close it without a statement from Response Tracking instead.'
            }
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[13px] leading-none transition-colors ${
              removable
                ? 'text-sns-grey hover:bg-[#FDECEA] hover:text-[#B71C1C] disabled:opacity-40'
                : 'text-[#D8D8D8] cursor-not-allowed'
            }`}
          >
            ✕
          </button>
        )}
      </div>

      {/* The addresses themselves get the full width rather than sharing a line with the name. */}
      {!none && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {vendor.to.map((a) => (
            <Chip
              key={a.email}
              label={a.email}
              system={a.origin === 'directory'}
              title={
                a.origin === 'added'
                  ? 'Added here and kept for next time'
                  : 'From the supplier directory'
              }
              onRemove={
                canEdit && !busy ? () => onChange(vendor.vendorId, a.email, 'remove') : undefined
              }
            />
          ))}
        </div>
      )}
      {none && (
        <div className="mt-2 text-[11.5px] font-bold text-[#B71C1C]">
          Nobody to write to, add an address, or this vendor cannot be chased.
        </div>
      )}

      {open && (
        <div className="mt-2.5 rounded-lg border border-sns-line bg-[#FAFBFA] px-3 py-2.5">
          {canEdit && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-sns-grey">
                Add an address
              </div>
              <div className="mt-1.5 flex items-center gap-2">
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
                  aria-label={`Add an address for ${vendor.vendorName}`}
                  className="w-[280px] rounded-md border border-sns-line bg-white px-2.5 py-1.5 text-[11.5px]"
                />
                <button
                  type="button"
                  disabled={busy || !draft.trim()}
                  onClick={() => onChange(vendor.vendorId, draft.trim(), 'add')}
                  className="rounded-md bg-sns-green px-3 py-[6px] text-[11px] font-bold text-white disabled:opacity-40"
                >
                  Add
                </button>
                <span className="text-[10.5px] text-sns-grey">kept for the next cycle too</span>
              </div>
            </div>
          )}

          {vendor.suppressed.length > 0 && (
            <div className={canEdit ? 'mt-3 border-t border-t-[#EDEDED] pt-2.5' : ''}>
              <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-sns-grey">
                Removed. Will not be written to
              </div>
              <div className="mt-1 space-y-0.5">
                {vendor.suppressed.map((email) => (
                  <div key={email} className="flex items-center gap-2 text-[11.5px]">
                    <span className="line-through text-sns-grey">{email}</span>
                    {canEdit && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onChange(vendor.vendorId, email, 'restore')}
                        className="font-semibold text-sns-green hover:underline disabled:opacity-40"
                      >
                        undo
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {vendor.droppedInternal.length > 0 && (
            <div className="mt-3 border-t border-t-[#EDEDED] pt-2.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-sns-grey">
                NESR addresses, left out of the vendor letter
              </div>
              <div className="mt-1 space-y-0.5 text-[11.5px] text-sns-grey">
                {vendor.droppedInternal.map((email) => (
                  <div key={email}>{email}</div>
                ))}
              </div>
            </div>
          )}

          {!canEdit && hidden === 0 && (
            <div className="text-[11.5px] text-sns-grey">
              Nothing has been changed for this vendor.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
