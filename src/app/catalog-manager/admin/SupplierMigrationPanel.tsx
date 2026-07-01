'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import * as XLSX from 'xlsx';
import { migrateSuppliersFromExcel, type SupplierMigrationResult, type SupplierMigrationRow } from '@/app/actions/catalog-manager';
import { Icon } from '../components/CatalogManagerUI';

type ParsedFile = {
  rows: SupplierMigrationRow[];
  headers: string[];
  preview: SupplierMigrationRow[];
};

const COLUMNS = [
  { label: 'Supplier', required: true, aliases: ['supplier', 'supplier name', 'vendor', 'vendor name', 'name'] },
  { label: 'Supplier Code', required: true, aliases: ['supplier code', 'vendor code', 'supplier id', 'vendor id', 'code'] },
  { label: 'Accountable Manager', required: false, aliases: ['accountable manager', 'manager', 'owner', 'supplier manager'] },
  { label: 'Supplier Emails', required: false, aliases: ['supplier emails', 'supplier email', 'emails', 'email'] },
  { label: 'Additional Supplier Email', required: false, aliases: ['additional supplier email', 'additional email', 'cc email', 'secondary email'] },
] as const;

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function cell(row: unknown[], index: number): string {
  return row[index] != null ? String(row[index]).trim() : '';
}

function headerIndex(headers: string[], aliases: readonly string[], fallback: number): number {
  const normalizedAliases = aliases.map(normalizeHeader);
  const found = headers.findIndex((header) => normalizedAliases.includes(normalizeHeader(header)));
  return found >= 0 ? found : fallback;
}

function parseFile(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', raw: false, dateNF: 'yyyy-mm-dd' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
        const headerRow = (raw[0] ?? []).map((h) => String(h ?? '').trim());
        const indexes = COLUMNS.map((column, fallback) => headerIndex(headerRow, column.aliases, fallback));
        const rows = raw.slice(1)
          .map((row, i): SupplierMigrationRow => ({
            rowIndex: i + 2,
            supplier: cell(row, indexes[0]),
            supplier_code: cell(row, indexes[1]),
            manager: cell(row, indexes[2]) || null,
            emails: cell(row, indexes[3]) || null,
            additional_email: cell(row, indexes[4]) || null,
          }))
          .filter((row) => row.supplier || row.supplier_code || row.manager || row.emails || row.additional_email);
        resolve({ rows, headers: headerRow, preview: rows.slice(0, 5) });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const rows = [
    COLUMNS.map((column) => `${column.label}${column.required ? ' *' : ''}`),
    ['Example Supplier LLC', 'V-100001', 'Omar Haddad', 'supplier@example.com; sales@example.com', 'account.manager@example.com'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 24 }, { wch: 42 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Suppliers');
  XLSX.writeFile(wb, 'NESR_Supplier_Migration_Template.xlsx');
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SupplierMigrationPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<SupplierMigrationResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const handleFile = useCallback(async (f: File) => {
    if (!f.name.match(/\.(xlsx|xls|csv)$/i)) {
      setParseError('Only .xlsx, .xls, or .csv files are accepted.');
      return;
    }
    setFile(f);
    setParseError(null);
    setParsed(null);
    setResult(null);
    setLog([]);
    setProgress(0);
    try {
      setParsed(await parseFile(f));
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse the supplier file.');
    }
  }, []);

  function reset() {
    setFile(null);
    setParsed(null);
    setParseError(null);
    setResult(null);
    setLog([]);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function runMigration() {
    if (!parsed || !file) return;
    startTransition(async () => {
      const batchSize = 50;
      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      let errors = 0;
      const nextLog: string[] = [];
      setResult(null);
      setLog([]);
      setProgress(0);

      for (let i = 0; i < parsed.rows.length; i += batchSize) {
        const batch = parsed.rows.slice(i, i + batchSize);
        const res = await migrateSuppliersFromExcel({ rows: batch, filename: file.name });
        inserted += res.inserted;
        updated += res.updated;
        skipped += res.skipped;
        errors += res.errors;
        nextLog.push(...res.log);
        setProgress(Math.round((Math.min(i + batchSize, parsed.rows.length) / parsed.rows.length) * 100));
        setLog([...nextLog]);
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }

      setResult({ inserted, updated, skipped, errors, log: nextLog });
    });
  }

  const missingRequired = parsed?.rows.filter((row) => !row.supplier.trim() || !row.supplier_code.trim()).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Supplier Migration</p>
          <p className="mt-1 text-sm text-slate-500">Migrate multiple suppliers into the Catalog Repo supplier master from Excel.</p>
        </div>
        <button onClick={downloadTemplate} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:border-[#307c4c]/40 hover:text-[#307c4c]">
          <Icon name="download" className="h-3.5 w-3.5" /> Download template
        </button>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) void handleFile(f); }}
        onClick={() => fileInputRef.current?.click()}
        className={`cursor-pointer rounded-xl p-6 transition-all ${isDragging ? 'border-2 border-[#307c4c] bg-[#307c4c]/5' : 'border-2 border-dashed border-slate-200 bg-slate-50 hover:border-[#307c4c]/40 hover:bg-[#307c4c]/5'}`}
      >
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${isDragging ? 'bg-[#307c4c]/20 text-[#307c4c]' : 'bg-white text-slate-400'}`}>
            <Icon name="sheet" className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-600">{file ? file.name : 'Drop supplier migration file here'}</p>
            <p className="mt-0.5 text-xs text-slate-400">{file ? `${formatBytes(file.size)}${parsed ? ` - ${parsed.rows.length} supplier rows` : ''}` : 'or browse files - .xlsx, .xls, .csv'}</p>
          </div>
        </div>
      </div>
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />

      {parseError && <p className="flex items-center gap-1.5 text-xs font-semibold text-red-600"><Icon name="alert" className="h-3.5 w-3.5" /> {parseError}</p>}

      {parsed && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-600">{parsed.rows.length} supplier rows detected</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{missingRequired ? `${missingRequired} rows need supplier name or supplier code before they can import.` : 'All parsed rows have the required fields.'}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={reset} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  Clear
                </button>
                <button onClick={runMigration} disabled={isPending || parsed.rows.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-[#307c4c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2b6f44] disabled:opacity-40">
                  <Icon name="upload" className="h-3.5 w-3.5" /> {isPending ? 'Migrating...' : `Migrate ${parsed.rows.length} rows`}
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Row</th>
                  <th className="px-3 py-2 font-semibold">Supplier</th>
                  <th className="px-3 py-2 font-semibold">Supplier Code</th>
                  <th className="px-3 py-2 font-semibold">Manager</th>
                  <th className="px-3 py-2 font-semibold">Emails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {parsed.preview.map((row) => (
                  <tr key={row.rowIndex}>
                    <td className="px-3 py-2 font-mono text-slate-400">{row.rowIndex}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.supplier || <span className="text-red-500">Missing</span>}</td>
                    <td className="px-3 py-2 font-mono text-slate-600">{row.supplier_code || <span className="font-sans text-red-500">Missing</span>}</td>
                    <td className="px-3 py-2 text-slate-500">{row.manager || '-'}</td>
                    <td className="max-w-[260px] truncate px-3 py-2 text-slate-500" title={[row.emails, row.additional_email].filter(Boolean).join(', ')}>
                      {[row.emails, row.additional_email].filter(Boolean).join(', ') || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.rows.length > parsed.preview.length && <p className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-400">Showing first {parsed.preview.length} of {parsed.rows.length} rows.</p>}
          </div>
        </div>
      )}

      {(isPending || result || log.length > 0) && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          {isPending && <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#307c4c] transition-all" style={{ width: `${progress}%` }} /></div>}
          {result && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Inserted" value={result.inserted} tone="green" />
              <Metric label="Updated" value={result.updated} tone="slate" />
              <Metric label="Skipped" value={result.skipped} tone="amber" />
              <Metric label="Errors" value={result.errors} tone="red" />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto rounded-xl bg-[#0f172a] p-4 font-mono text-[11px] leading-5 text-slate-300">
            {log.map((line, i) => <div key={`${line}-${i}`}>{line}</div>)}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Expected columns</p>
        <div className="flex flex-wrap gap-1.5">
          {COLUMNS.map((column) => (
            <span key={column.label} className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${column.required ? 'border-[#307c4c]/20 bg-[#307c4c]/10 text-[#1d4f31]' : 'border-slate-200 bg-white text-slate-500'}`}>
              {column.label}{column.required ? ' *' : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'green' | 'slate' | 'amber' | 'red' }) {
  const toneClass = {
    green: 'text-[#307c4c]',
    slate: 'text-slate-800',
    amber: 'text-amber-600',
    red: 'text-red-600',
  }[tone];

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}
