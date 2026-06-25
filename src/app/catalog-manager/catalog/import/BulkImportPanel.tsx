'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { Icon } from '../../components/CatalogManagerUI';
import { bulkImportCatalogEntries, type CatalogImportRow } from '@/app/actions/catalog-manager';

type Phase = 'form' | 'running' | 'done';

interface ParsedFile {
  rows: CatalogImportRow[];
  headers: string[];
  preview: string[][];
}

// Column order the importer expects (A → O).
const COLUMNS: { label: string; field: string; required: boolean; keywords: string[] }[] = [
  { label: 'Supplier', field: 'supplier', required: true, keywords: ['supplier'] },
  { label: 'Supplier Code', field: 'supplier_code', required: true, keywords: ['code', 'vendor'] },
  { label: 'Country', field: 'country', required: true, keywords: ['country'] },
  { label: 'Spend Category', field: 'category', required: true, keywords: ['category', 'spend'] },
  { label: 'Sub-Category', field: 'subcategory', required: false, keywords: ['sub'] },
  { label: 'Commodity', field: 'commodity', required: false, keywords: ['commodity'] },
  { label: 'Description', field: 'description', required: true, keywords: ['description', 'desc', 'service', 'item'] },
  { label: 'UOM', field: 'uom', required: true, keywords: ['uom', 'unit of measure', 'unit'] },
  { label: 'Unit Price', field: 'unit_price', required: true, keywords: ['price', 'rate', 'value'] },
  { label: 'Currency', field: 'currency', required: true, keywords: ['currency', 'ccy'] },
  { label: 'Effective Date', field: 'effective_date', required: true, keywords: ['effective', 'start'] },
  { label: 'Expiry Date', field: 'expiry_date', required: false, keywords: ['expiry', 'expiration', 'end'] },
  { label: 'Supplier Manager', field: 'manager', required: false, keywords: ['manager', 'owner'] },
  { label: 'Sirion Contract ID', field: 'sirion_contract_id', required: false, keywords: ['sirion', 'contract'] },
  { label: 'Notes', field: 'notes', required: false, keywords: ['notes', 'comment', 'remark'] },
];

function parseNum(val: unknown): number | null {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s || s.startsWith('=')) return null;
  const cleaned = s.replace(/SAR|AED|USD|KWD|QAR|OMR|BHD|EGP|DZD/gi, '').replace(/[$£€﷼,]/g, '').trim();
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}
const cell = (row: unknown[], i: number): string => (row[i] != null ? String(row[i]).trim() : '');
const orNull = (s: string): string | null => (s ? s : null);

function parseFile(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', raw: false, dateNF: 'yyyy-mm-dd' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
        const headers = (raw[0] ?? []).map((h) => (h != null ? String(h).trim() : ''));
        const dataRows = raw.slice(1);
        const preview = dataRows.slice(0, 3).map((row) => COLUMNS.map((_, ci) => cell(row, ci)));
        const rows: CatalogImportRow[] = dataRows
          .filter((row) => cell(row, 0) !== '' || cell(row, 1) !== '')
          .map((row, i) => ({
            rowIndex: i + 2,
            supplier: cell(row, 0),
            supplier_code: cell(row, 1),
            country: cell(row, 2),
            category: cell(row, 3),
            subcategory: orNull(cell(row, 4)),
            commodity: orNull(cell(row, 5)),
            description: cell(row, 6),
            uom: cell(row, 7),
            unit_price: parseNum(row[8]),
            currency: cell(row, 9),
            effective_date: orNull(cell(row, 10)),
            expiry_date: orNull(cell(row, 11)),
            manager: orNull(cell(row, 12)),
            sirion_contract_id: orNull(cell(row, 13)),
            notes: orNull(cell(row, 14)),
          }));
        resolve({ rows, headers, preview });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function downloadTemplate() {
  const header = COLUMNS.map((c) => c.label);
  const example = [
    'Gulf Cementing Co.', 'V-100482', 'SA', 'Field Technical Equipment & Services', 'Drilling Product & Services',
    'Primary Cementing', 'Primary cementing — 9-5/8" casing string', 'Per Well', '128000', 'SAR',
    '2026-07-01', '2027-06-30', 'Omar Haddad', 'SIR-CN-231004', 'Annual rate card',
  ];
  const ws = XLSX.utils.aoa_to_sheet([header, example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Catalog');
  XLSX.writeFile(wb, 'NESR_Catalog_Import_Template.xlsx');
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function calcMatch(headers: string[]) {
  const matches = COLUMNS.map((c, i) => {
    const detected = (headers[i] ?? '').trim();
    const norm = detected.toLowerCase();
    return { label: c.label, detected, matched: detected !== '' && c.keywords.some((k) => norm.includes(k)) };
  });
  const score = Math.round((matches.filter((m) => m.matched).length / COLUMNS.length) * 100);
  return { matches, score };
}

export default function BulkImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const handleFile = useCallback(async (f: File) => {
    if (!f.name.match(/\.(xlsx|xls|csv)$/i)) { setParseError('Only .xlsx, .xls, or .csv files are accepted.'); return; }
    setFile(f); setParseError(null); setParsed(null);
    try {
      setParsed(await parseFile(f));
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse the file.');
    }
  }, []);

  async function runImport() {
    if (!parsed || !file) return;
    setPhase('running'); setLog([]); setProgress(0);
    const BATCH = 10;
    let inserted = 0, skipped = 0, errors = 0;
    const all: string[] = [];
    for (let i = 0; i < parsed.rows.length; i += BATCH) {
      const batch = parsed.rows.slice(i, i + BATCH);
      const res = await bulkImportCatalogEntries({ rows: batch, filename: file.name });
      inserted += res.inserted; skipped += res.skipped; errors += res.errors;
      all.push(...res.log);
      setProgress(Math.round((Math.min(i + BATCH, parsed.rows.length) / parsed.rows.length) * 100));
      setLog([...all]);
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    setResult({ inserted, skipped, errors });
    setPhase('done');
  }

  function reset() {
    setPhase('form'); setFile(null); setParsed(null); setParseError(null);
    setLog([]); setResult(null); setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const match = parsed ? calcMatch(parsed.headers) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-slate-500">Upload a supplier rate card (.xlsx / .csv). Rows are validated, then created — rates over the threshold go to Pending Approval, the rest activate.</p>
        <button onClick={downloadTemplate} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:border-[#307c4c]/40 hover:text-[#307c4c]">
          <Icon name="download" className="h-3.5 w-3.5" /> Download template
        </button>
      </div>

      {phase === 'form' && (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {!file ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer select-none flex-col items-center justify-center gap-3 rounded-xl p-8 transition-all ${isDragging ? 'border-2 border-[#307c4c] bg-[#307c4c]/5' : 'border-2 border-dashed border-slate-200 bg-slate-50 hover:border-[#307c4c]/40 hover:bg-[#307c4c]/5'}`}
            >
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${isDragging ? 'bg-[#307c4c]/20 text-[#307c4c]' : 'bg-slate-100 text-slate-400'}`}>
                <Icon name="sheet" className="h-5 w-5" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-600">Drop your rate-card file here</p>
                <p className="mt-0.5 text-xs text-slate-400">or <span className="font-semibold text-[#307c4c] underline underline-offset-2">browse files</span> · .xlsx, .xls, .csv</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-[#307c4c]/30 bg-[#307c4c]/5 px-4 py-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#307c4c]/10 text-[#307c4c]"><Icon name="file" className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-400">{formatBytes(file.size)}{parsed ? ` · ${parsed.rows.length} data rows` : ''}</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); reset(); }} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Icon name="close" className="h-4 w-4" /></button>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

          {parseError && <p className="flex items-center gap-1.5 text-xs text-red-500"><Icon name="alert" className="h-3.5 w-3.5" /> {parseError}</p>}

          {parsed && match && (
            <div>
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">Column match</span>
                  <span className="text-xs text-slate-400">{match.matches.filter((m) => m.matched).length} / {COLUMNS.length} columns</span>
                </div>
                <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full transition-all" style={{ width: `${match.score}%`, background: match.score >= 80 ? '#307c4c' : match.score >= 50 ? '#d97706' : '#ef4444' }} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {match.matches.map((m, i) => (
                    <span key={i} title={m.detected ? `Detected: "${m.detected}"` : 'Column empty'} className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${m.matched ? 'border-[#307c4c]/25 bg-[#307c4c]/8 text-[#1d4f31]' : m.detected ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-100 text-slate-400'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${m.matched ? 'bg-[#307c4c]' : m.detected ? 'bg-amber-400' : 'bg-slate-300'}`} />{m.label}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[10.5px] text-slate-400">Columns are read by position (left to right), not header name — keep the template order. Amber = present but header differs; gray = empty.</p>
              </div>

              {parsed.preview.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="max-h-44 overflow-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          {COLUMNS.map((c) => <th key={c.label} className="whitespace-nowrap px-3 py-2 font-semibold text-slate-500">{c.label}</th>)}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsed.preview.map((row, ri) => (
                          <tr key={ri} className={ri % 2 ? 'bg-slate-50/60' : 'bg-white'}>
                            {row.map((c, ci) => <td key={ci} className="max-w-[140px] truncate whitespace-nowrap px-3 py-2 text-slate-600" title={c}>{c || <span className="text-slate-300">—</span>}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <p className="mt-2 text-xs text-slate-400">{parsed.rows.length} data rows detected (first 3 shown).</p>
            </div>
          )}

          <div className="pt-1">
            <button
              onClick={runImport}
              disabled={!parsed || parsed.rows.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-[#307c4c] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#2b6f44] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon name="upload" className="h-4 w-4" />
              {parsed && parsed.rows.length > 0 ? `Import ${parsed.rows.length} rows` : 'Import rows'}
            </button>
          </div>
        </div>
      )}

      {phase === 'running' && (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 shrink-0 animate-spin text-[#307c4c]" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
            <div><p className="text-sm font-semibold text-slate-800">Importing rows…</p><p className="text-xs text-slate-400">{progress}% complete</p></div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#307c4c] transition-all" style={{ width: `${progress}%` }} /></div>
          <div className="h-56 overflow-y-auto rounded-xl bg-[#0f172a] p-4 font-mono text-[11px] leading-5">
            {log.map((line, i) => <div key={i} className={line.startsWith('✅') ? 'text-emerald-400' : line.startsWith('⚠️') ? 'text-amber-400' : line.startsWith('❌') ? 'text-red-400' : 'text-slate-400'}>{line}</div>)}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {phase === 'done' && result && (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${result.errors === 0 ? 'bg-[#307c4c]/10 text-[#307c4c]' : 'bg-amber-50 text-amber-500'}`}><Icon name={result.errors === 0 ? 'check' : 'alert'} className="h-5 w-5" /></div>
            <div><p className="text-base font-bold text-slate-900">Import complete</p><p className="text-xs text-slate-400">{file?.name}</p></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Inserted</p><p className="mt-0.5 text-2xl font-bold tabular-nums text-[#307c4c]">{result.inserted}</p></div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Skipped</p><p className="mt-0.5 text-2xl font-bold tabular-nums text-amber-500">{result.skipped}</p></div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Errors</p><p className="mt-0.5 text-2xl font-bold tabular-nums text-red-500">{result.errors}</p></div>
          </div>
          <div className="h-48 overflow-y-auto rounded-xl bg-[#0f172a] p-4 font-mono text-[11px] leading-5">
            {log.map((line, i) => <div key={i} className={line.startsWith('✅') ? 'text-emerald-400' : line.startsWith('⚠️') ? 'text-amber-400' : line.startsWith('❌') ? 'text-red-400' : 'text-slate-400'}>{line}</div>)}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Icon name="upload" className="h-4 w-4" /> Import another file</button>
            <Link href="/catalog-manager/catalog" className="inline-flex items-center gap-2 rounded-lg bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2b6f44]">View catalog <Icon name="arrowRight" className="h-4 w-4" /></Link>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3.5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Expected columns (in order)</p></div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead><tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-4 py-2.5">Col</th><th className="px-4 py-2.5">Header</th><th className="px-4 py-2.5">Required</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {COLUMNS.map((c, i) => (
                <tr key={c.label} className={i % 2 ? 'bg-slate-50/50' : 'bg-white'}>
                  <td className="px-4 py-2 font-mono text-[12px] font-semibold text-slate-700">{String.fromCharCode(65 + i)}</td>
                  <td className="px-4 py-2 text-slate-700">{c.label}</td>
                  <td className="px-4 py-2">{c.required ? <span className="text-[#307c4c]">Required</span> : <span className="text-slate-400">Optional</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
          <ul className="space-y-1.5 text-xs text-slate-600">
            {[
              'Row 1 is the header row; data starts on row 2.',
              'Country accepts a code (SA) or full name (Saudi Arabia). Category, UOM, and currency must already exist in master data.',
              'Dates accept DD/MM/YYYY or YYYY-MM-DD. Currency symbols in Unit Price are stripped automatically.',
              'A row matching an existing active rate (same vendor code + country + description) is skipped as a duplicate.',
            ].map((r, i) => (
              <li key={i} className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#307c4c]" />{r}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
