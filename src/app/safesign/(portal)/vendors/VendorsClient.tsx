'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileSpreadsheet, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { readSpreadsheet } from '@/lib/spreadsheet-import';
import { importVendors, removeVendor, saveVendor, type VendorInput } from '@/app/actions/safesign/library';
import type { Vendor } from '@/lib/safesign/read';
import { BUTTON, BUTTON_SECONDARY, CARD, INPUT, LABEL } from '../../components/SafeSignShell';

const EMAIL_RE = /[^\s@,;<>()"']+@[^\s@,;<>()"']+\.[A-Za-z]{2,}/g;

/**
 * Turn spreadsheet rows into suppliers: Supplier | Category | TO emails | CC emails (any further
 * columns are CC too). Emails in a cell may be separated by commas, semicolons, spaces or line
 * breaks, and may have a name in front of them ("Houssam Obeid hobeid@nui.sa"), which is kept as
 * the contact name. A first row whose first cell says "Supplier" is treated as the header.
 */
export function parseRows(rows: string[][]): VendorInput[] {
  const out: VendorInput[] = [];
  for (const raw of rows) {
    const cells = raw.map((c) => String(c ?? ''));
    const name = (cells[0] ?? '').trim();
    // The header row, and the template's grey example row if it was left in.
    if (!name || /^supplier/i.test(name) || /^example supplier co$/i.test(name)) continue;
    const categoryIsEmail = (cells[1] ?? '').includes('@');
    const category = categoryIsEmail ? 'General' : (cells[1] ?? '').trim() || 'General';
    const toCell = categoryIsEmail ? cells[1] ?? '' : cells[2] ?? '';
    const ccCells = categoryIsEmail ? cells.slice(2) : cells.slice(3);
    const pick = (cell: string, kind: 'to' | 'cc') =>
      [...cell.matchAll(EMAIL_RE)].map((m) => {
        const before = cell.slice(0, m.index).split(/[,;\n]/).pop()?.trim() ?? '';
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

export default function VendorsClient({ vendors }: { vendors: Vendor[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<VendorInput | null>(null);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<VendorInput[]>([]);
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

  async function readFile(file: File | undefined) {
    if (!file) return;
    setNotice(null);
    try {
      const sheets = await readSpreadsheet(file);
      const rows = parseRows(sheets[0]?.rows ?? []);
      setFileName(file.name);
      setParsed(rows);
      if (!rows.length) setNotice({ ok: false, text: 'No suppliers found in the first sheet. Use the template columns.' });
    } catch (err) {
      setParsed([]);
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'Could not read that file.' });
    }
  }

  function closeImport() {
    setImporting(false);
    setParsed([]);
    setFileName(null);
  }

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
      if (r.success) closeImport();
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
        <>
          <div className="ml-auto flex gap-2">
            <button className={BUTTON_SECONDARY} onClick={() => setImporting(true)}>
              <Upload className="h-4 w-4" /> Upload from Excel
            </button>
            <button className={BUTTON} onClick={() => setEditing(blank())}>
              <Plus className="h-4 w-4" /> Add supplier
            </button>
          </div>
        </>
      </div>

      {notice && <p className={`rounded-lg px-3 py-2 text-sm ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{notice.text}</p>}

      {importing && (
        <section className={`${CARD} space-y-3 p-5`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Upload suppliers from Excel</h2>
              <p className="text-xs text-slate-500">
                Columns: <b>Supplier</b> · <b>Category of work</b> · <b>TO emails</b> · <b>CC emails</b>. Several emails in one cell can be
                separated by commas or semicolons, with an optional name in front. A supplier already in the library is updated, not
                duplicated.
              </p>
            </div>
            <button aria-label="Close" onClick={closeImport} className="rounded p-1 text-slate-400 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/api/safesign/vendor-template" className={BUTTON_SECONDARY}>
              <Download className="h-4 w-4" /> Download template
            </a>
            <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500 hover:border-[#307c4c]/50 hover:text-[#307c4c]">
              <FileSpreadsheet className="h-4 w-4" />
              {fileName ? `${fileName}, choose another file` : 'Choose an Excel (.xlsx) or CSV file'}
              <input
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                onChange={(e) => {
                  void readFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
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
                    className={`${INPUT.replace("w-full", "")} w-24 shrink-0`}
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
              <th className="px-4 py-3" />
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
                <>
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
                </>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                  No suppliers yet. Add one, or upload the list from Excel.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
