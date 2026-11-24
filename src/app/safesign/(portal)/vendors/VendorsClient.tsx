'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardPaste, Pencil, Plus, Trash2, X } from 'lucide-react';
import { importVendors, removeVendor, saveVendor, type VendorInput } from '@/app/actions/safesign/library';
import type { Vendor } from '@/lib/safesign/read';
import { BUTTON, BUTTON_SECONDARY, CARD, INPUT, LABEL } from '../../components/SafeSignShell';

const EMAIL_RE = /[^\s@,;<>()"']+@[^\s@,;<>()"']+\.[A-Za-z]{2,}/g;

/**
 * Parse rows pasted from Excel: Supplier | Category | TO emails | CC emails.
 * Emails in a cell may be separated by commas, semicolons or spaces, and may have a name in
 * front of them ("Houssam Obeid hobeid@nui.sa"), which is kept as the contact name.
 */
export function parsePasted(text: string): VendorInput[] {
  const out: VendorInput[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = line.split('\t');
    const name = (cells[0] ?? '').trim();
    if (!name || /^supplier$/i.test(name)) continue;
    const category = (cells[1] ?? '').includes('@') ? 'General' : (cells[1] ?? '').trim() || 'General';
    const toCell = (cells[1] ?? '').includes('@') ? cells.slice(1, 2).join(' ') : cells[2] ?? '';
    const ccCells = (cells[1] ?? '').includes('@') ? cells.slice(2) : cells.slice(3);
    const pick = (cell: string, kind: 'to' | 'cc') =>
      [...cell.matchAll(EMAIL_RE)].map((m) => {
        const before = cell.slice(0, m.index).split(/[,;]/).pop()?.trim() ?? '';
        return { name: before.replace(/[.\s]+$/, ''), email: m[0], kind };
      });
    out.push({
      name,
      category,
      contacts: [...pick(toCell, 'to'), ...ccCells.flatMap((c) => pick(c, 'cc'))],
    });
  }
  return out;
}

const blank = (): VendorInput => ({ name: '', category: '', vendorCode: '', contacts: [{ name: '', email: '', kind: 'to' }] });

export default function VendorsClient({ vendors, canManage }: { vendors: Vendor[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<VendorInput | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [filter, setFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const categories = useMemo(() => [...new Set(vendors.map((v) => v.category))].sort(), [vendors]);
  const shown = vendors.filter(
    (v) =>
      (showInactive || v.active) &&
      (!filter ||
        [v.name, v.category, ...v.contacts.map((c) => c.email)].some((s) => s.toLowerCase().includes(filter.toLowerCase()))),
  );
  const parsed = useMemo(() => (pasteText ? parsePasted(pasteText) : []), [pasteText]);

  function save() {
    if (!editing) return;
    start(async () => {
      const r = await saveVendor(editing);
      if (r.success) {
        setEditing(null);
        setNotice({ ok: true, text: 'Supplier saved.' });
        router.refresh();
      } else setNotice({ ok: false, text: r.error ?? 'Could not save.' });
    });
  }

  function runImport() {
    start(async () => {
      const r = await importVendors(parsed);
      setNotice({
        ok: r.success,
        text: `${r.added ?? 0} added, ${r.updated ?? 0} updated.${r.errors?.length ? ' ' + r.errors.join(' ') : ''}${r.error ? ' ' + r.error : ''}`,
      });
      if (r.success) {
        setPasting(false);
        setPasteText('');
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${INPUT} max-w-xs`} placeholder="Search suppliers, categories, emails" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
        </label>
        {canManage && (
          <div className="ml-auto flex gap-2">
            <button className={BUTTON_SECONDARY} onClick={() => setPasting(true)}>
              <ClipboardPaste className="h-4 w-4" /> Paste from Excel
            </button>
            <button className={BUTTON} onClick={() => setEditing(blank())}>
              <Plus className="h-4 w-4" /> Add supplier
            </button>
          </div>
        )}
      </div>

      {notice && <p className={`rounded-lg px-3 py-2 text-sm ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{notice.text}</p>}

      {pasting && (
        <section className={`${CARD} space-y-3 p-5`}>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Paste suppliers from Excel</h2>
              <p className="text-xs text-slate-500">
                Copy rows with these columns: <b>Supplier</b> · <b>Category</b> · <b>TO emails</b> · <b>CC emails</b> (any further columns are CC too).
                A supplier already in the library is updated, not duplicated.
              </p>
            </div>
            <button aria-label="Close" onClick={() => setPasting(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          <textarea className={`${INPUT} min-h-[140px] font-mono text-xs`} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={'NESMA\tLogistics\thobeid@nui.sa\tronulfoa@nui.sa; jihadk@nui.sa'} />
          {parsed.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Supplier</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">TO</th>
                    <th className="px-3 py-2">CC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsed.map((v, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-medium">{v.name}</td>
                      <td className="px-3 py-1.5">{v.category}</td>
                      <td className="px-3 py-1.5">{v.contacts.filter((c) => c.kind === 'to').map((c) => c.email).join(', ') || <span className="text-rose-600">none</span>}</td>
                      <td className="px-3 py-1.5">{v.contacts.filter((c) => c.kind === 'cc').map((c) => c.email).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end">
            <button className={BUTTON} disabled={pending || !parsed.length} onClick={runImport}>
              Import {parsed.length || ''} supplier{parsed.length === 1 ? '' : 's'}
            </button>
          </div>
        </section>
      )}

      {editing && (
        <section className={`${CARD} space-y-3 p-5`}>
          <h2 className="text-sm font-semibold text-slate-800">{editing.id ? 'Edit supplier' : 'Add supplier'}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={LABEL}>Supplier name</label>
              <input className={INPUT} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <label className={LABEL}>Category of work</label>
              <input className={INPUT} list="ss-categories" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
              <datalist id="ss-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={LABEL}>Vendor code (optional)</label>
              <input className={INPUT} value={editing.vendorCode ?? ''} onChange={(e) => setEditing({ ...editing, vendorCode: e.target.value })} />
            </div>
          </div>
          <div>
            <span className={LABEL}>Contacts</span>
            <div className="space-y-2">
              {editing.contacts.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    aria-label="TO or CC"
                    className={`${INPUT} w-20`}
                    value={c.kind}
                    onChange={(e) => {
                      const contacts = [...editing.contacts];
                      contacts[i] = { ...c, kind: e.target.value as 'to' | 'cc' };
                      setEditing({ ...editing, contacts });
                    }}
                  >
                    <option value="to">TO</option>
                    <option value="cc">CC</option>
                  </select>
                  <input
                    className={INPUT}
                    placeholder="Name"
                    value={c.name ?? ''}
                    onChange={(e) => {
                      const contacts = [...editing.contacts];
                      contacts[i] = { ...c, name: e.target.value };
                      setEditing({ ...editing, contacts });
                    }}
                  />
                  <input
                    className={INPUT}
                    placeholder="email@supplier.com"
                    value={c.email}
                    onChange={(e) => {
                      const contacts = [...editing.contacts];
                      contacts[i] = { ...c, email: e.target.value };
                      setEditing({ ...editing, contacts });
                    }}
                  />
                  <button
                    aria-label="Remove contact"
                    className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                    onClick={() => setEditing({ ...editing, contacts: editing.contacts.filter((_, j) => j !== i) })}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              className="mt-2 text-xs font-semibold text-[#307c4c] hover:underline"
              onClick={() => setEditing({ ...editing, contacts: [...editing.contacts, { name: '', email: '', kind: 'cc' }] })}
            >
              + Add contact
            </button>
          </div>
          {editing.id && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={editing.active !== false} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Active
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button className={BUTTON_SECONDARY} onClick={() => setEditing(null)}>Cancel</button>
            <button className={BUTTON} disabled={pending} onClick={save}>Save</button>
          </div>
        </section>
      )}

      <section className={`${CARD} overflow-x-auto`}>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-3 py-3">Category</th>
              <th className="px-3 py-3">TO</th>
              <th className="px-3 py-3">CC</th>
              {canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((v) => (
              <tr key={v.id} className={v.active ? '' : 'opacity-50'}>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {v.name}
                  {!v.active && <span className="ml-2 text-xs font-normal text-slate-500">inactive</span>}
                </td>
                <td className="px-3 py-3 text-slate-600">{v.category}</td>
                <td className="px-3 py-3 text-xs text-slate-600">
                  {v.contacts.filter((c) => c.kind === 'to').map((c) => (
                    <div key={c.email}>{c.name ? `${c.name} · ` : ''}{c.email}</div>
                  ))}
                </td>
                <td className="px-3 py-3 text-xs text-slate-500">
                  {v.contacts.filter((c) => c.kind === 'cc').map((c) => (
                    <div key={c.email}>{c.name ? `${c.name} · ` : ''}{c.email}</div>
                  ))}
                </td>
                {canManage && (
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      aria-label={`Edit ${v.name}`}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      onClick={() =>
                        setEditing({ id: v.id, name: v.name, category: v.category, vendorCode: v.vendorCode, active: v.active, contacts: v.contacts.map((c) => ({ name: c.name, email: c.email, kind: c.kind })) })
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={`Remove ${v.name}`}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                      onClick={() => {
                        if (confirm(`Remove ${v.name}? Suppliers with history are made inactive instead of deleted.`))
                          start(async () => {
                            const r = await removeVendor(v.id);
                            setNotice({ ok: r.success, text: r.success ? 'Removed.' : r.error ?? 'Could not remove.' });
                            router.refresh();
                          });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                  No suppliers yet. Add one, or paste the list from Excel.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
