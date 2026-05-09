'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { importShipments, getMigrationLog } from '@/app/actions/tite-migration';
import type { RawShipmentRow, MigrationLogRow } from '@/app/actions/tite-migration';

/* ─── Types ──────────────────────────────────────────────────── */

type Phase = 'form' | 'running' | 'done';

interface ParsedFile {
  rows: RawShipmentRow[];
  headers: string[];
  preview: string[][];
}

/* ─── Country options ────────────────────────────────────────── */

const COUNTRIES = [
  { label: 'Saudi Arabia (KSA)', currency: 'SAR' },
  { label: 'United Arab Emirates (UAE)', currency: 'AED' },
  { label: 'Qatar', currency: 'QAR' },
  { label: 'Kuwait', currency: 'KWD' },
  { label: 'Oman', currency: 'OMR' },
  { label: 'Bahrain', currency: 'BHD' },
  { label: 'Egypt', currency: 'EGP' },
  { label: 'Algeria', currency: 'DZD' },
  { label: 'Iraq', currency: 'IQD' },
  { label: 'Libya', currency: 'LYD' },
  { label: 'Chad', currency: 'XAF' },
  { label: 'Congo', currency: 'XAF' },
  { label: 'Other', currency: '—' },
];

/* ─── Client-side Excel parser ───────────────────────────────── */

function parseExcel(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', dateNF: 'yyyy-mm-dd' });

        const sheetName =
          workbook.SheetNames.find(
            (n) =>
              n.includes('KSA') || n.includes('UAE') ||
              n.toLowerCase().includes('portal') ||
              n.toLowerCase().includes('data'),
          ) ??
          workbook.SheetNames[1] ??
          workbook.SheetNames[0];

        const sheet = workbook.Sheets[sheetName];
        const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          raw: false,
          dateNF: 'yyyy-mm-dd',
        });

        const headers: string[] = (rawRows[1] ?? []).map((h: any) =>
          h != null ? String(h).trim() : '',
        );

        const previewSource = rawRows.slice(2, 5);
        const preview: string[][] = previewSource.map((row) =>
          headers.map((_, ci) => {
            const v = row[ci];
            return v != null ? String(v).trim() : '';
          }),
        );

        const parseNum = (val: any): number | null => {
          if (val == null) return null;
          const s = String(val).trim();
          if (s.startsWith('=') || s === '') return null;
          const n = parseFloat(s.replace(/,/g, ''));
          return isNaN(n) ? null : n;
        };

        const parseDate = (val: any): string | null => {
          if (val == null) return null;
          const s = String(val).trim();
          if (s.startsWith('=') || s === '') return null;
          // DD/MM/YYYY
          const parts = s.split('/');
          if (parts.length === 3) {
            const [d, m, y] = parts;
            const dt = new Date(
              `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
            );
            if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
          }
          const dt = new Date(s);
          if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
          return null;
        };

        const parseStatus = (val: any): string => {
          if (val == null) return 'Active';
          return String(val).toLowerCase().includes('closed') ? 'Closed' : 'Active';
        };

        const dataRows = rawRows.slice(2);
        const rows: RawShipmentRow[] = dataRows
          .filter((row) => row[0] != null && String(row[0]).trim() !== '')
          .map((row, i) => {
            const depositLocal = parseNum(row[11]);
            return {
              rowIndex: i + 3,
              no: String(row[0] ?? '').trim() || null,
              segment: row[1] ? String(row[1]).trim() || null : null,
              from: row[2] ? String(row[2]).trim() || null : null,
              to: row[3] ? String(row[3]).trim() || null : null,
              invoiceNumber: row[4] ? String(row[4]).trim() || null : null,
              invoiceValue: parseNum(row[5]),
              bayanNumber: row[6]
                ? String(row[6]).trim().split('\n')[0] || null
                : null,
              description: row[7] ? String(row[7]).trim() || null : null,
              mot: row[8]
                ? String(row[8])
                    .trim()
                    .replace(/lnad/i, 'Land')
                    .replace(/\blnd\b/i, 'Land') || null
                : null,
              awb: row[9] ? String(row[9]).trim() || null : null,
              importDate: parseDate(row[10]),
              depositLocal,
              depositUsd: depositLocal != null ? depositLocal / 3.75 : null,
              poNumber: row[13] ? String(row[13]).trim() || null : null,
              movementType: row[14]
                ? String(row[14]).trim().replace(/\s+/g, ' ') || null
                : null,
              expiryDate: parseDate(row[15]),
              extendedDate: parseDate(row[16]),
              comments: row[17] ? String(row[17]).trim() || null : null,
              status: parseStatus(row[18]),
            };
          });

        resolve({ rows, headers, preview });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/* ─── Helpers ────────────────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${String(d.getUTCDate()).padStart(2, '0')} ${M[d.getUTCMonth()]} ${d.getUTCFullYear()} ${hh}:${mm}`;
}

/* ─── Sub-components ─────────────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
      <span className="w-1 h-4 bg-[#307c4c] rounded-full inline-block shrink-0" />
      {children}
    </h2>
  );
}

/* ─── Migration log table ────────────────────────────────────── */

function MigrationLogTable({
  rows,
  loading,
}: {
  rows: MigrationLogRow[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-slate-400 text-sm">
        <svg className="w-4 h-4 animate-spin text-[#307c4c]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        Loading history…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-slate-400">
        No migrations yet.
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              {['Country', 'File', 'Inserted', 'Skipped', 'Errors', 'Migrated By', 'Date'].map((h) => (
                <th key={h} className="py-3 px-4 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={r.id} className={`hover:bg-[#307c4c]/5 transition-colors ${i % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
                <td className="py-3 px-4 text-sm font-medium text-slate-800 whitespace-nowrap">{r.country}</td>
                <td className="py-3 px-4 text-xs text-slate-500 max-w-[200px] truncate" title={r.filename}>{r.filename}</td>
                <td className="py-3 px-4 text-sm font-semibold text-[#307c4c] tabular-nums">{r.rows_inserted.toLocaleString()}</td>
                <td className="py-3 px-4 text-sm font-medium text-amber-600 tabular-nums">{r.rows_skipped.toLocaleString()}</td>
                <td className="py-3 px-4 text-sm font-medium text-red-500 tabular-nums">{r.rows_errored.toLocaleString()}</td>
                <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">{r.migrated_by}</td>
                <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(r.migrated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────── */

export default function TiteMigrationClient({ userEmail }: { userEmail: string }) {
  /* form state */
  const [country, setCountry] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  /* migration state */
  const [phase, setPhase] = useState<Phase>('form');
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: number } | null>(null);

  /* history */
  const [history, setHistory] = useState<MigrationLogRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /* load history */
  useEffect(() => {
    getMigrationLog().then((rows) => {
      setHistory(rows);
      setHistoryLoading(false);
    });
  }, []);

  /* auto-scroll log */
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  /* close dropdown on outside click */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filteredCountries = COUNTRIES.filter((c) =>
    c.label.toLowerCase().includes(countrySearch.toLowerCase()),
  );

  const handleFile = useCallback(async (f: File) => {
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      setParseError('Only .xlsx and .xls files are accepted.');
      return;
    }
    setFile(f);
    setParseError(null);
    setParsed(null);
    try {
      const result = await parseExcel(f);
      setParsed(result);
    } catch (err: any) {
      setParseError(err?.message ?? 'Failed to parse Excel file.');
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleImport = async () => {
    if (!country || !parsed) return;
    setPhase('running');
    setLog([]);
    setProgress(0);

    const total = parsed.rows.length;
    let done = 0;

    // Stream progress by batching rows — send 10 at a time so UI updates
    const BATCH = 10;
    let inserted = 0;
    let skipped = 0;
    let errors = 0;
    const allLog: string[] = [];

    for (let i = 0; i < parsed.rows.length; i += BATCH) {
      const batch = parsed.rows.slice(i, i + BATCH);
      const res = await importShipments({
        country,
        filename: file!.name,
        rows: batch,
        userEmail,
      });
      inserted += res.inserted;
      skipped += res.skipped;
      errors += res.errors;
      allLog.push(...res.log);
      done = Math.min(i + BATCH, total);
      setProgress(Math.round((done / total) * 100));
      setLog([...allLog]);
    }

    setResult({ inserted, skipped, errors });
    setPhase('done');

    // Refresh history
    getMigrationLog().then(setHistory);
  };

  const reset = () => {
    setPhase('form');
    setCountry('');
    setCountrySearch('');
    setFile(null);
    setParsed(null);
    setParseError(null);
    setLog([]);
    setResult(null);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const canImport = !!country && !!parsed && parsed.rows.length > 0;

  /* ── Render ── */
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-top-2 duration-300">

      {/* Page header */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">TI-TE Data Migration</h2>
        <p className="text-[12px] text-gray-400 mt-0.5">
          Import shipment records from Excel into the database by country.
        </p>
      </div>

      {/* ── Form phase ── */}
      {phase === 'form' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6 max-w-2xl">

          {/* Step 1 — Country */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Step 1 — Country
            </label>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => { setDropdownOpen((o) => !o); setCountrySearch(''); }}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700 hover:border-[#307c4c]/50 focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20 transition-all"
              >
                <span className={country ? 'text-slate-900 font-medium' : 'text-slate-400'}>
                  {country
                    ? (() => {
                        const c = COUNTRIES.find((c) => c.label === country)!;
                        return `${c.label} — ${c.currency}`;
                      })()
                    : 'Select a country…'}
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {dropdownOpen && (
                <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search…"
                      value={countrySearch}
                      onChange={(e) => setCountrySearch(e.target.value)}
                      className="w-full text-sm px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20"
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto py-1">
                    {filteredCountries.length === 0 && (
                      <div className="px-4 py-3 text-sm text-slate-400">No matches</div>
                    )}
                    {filteredCountries.map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        onClick={() => { setCountry(c.label); setDropdownOpen(false); }}
                        className={`w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-[#307c4c]/5 transition-colors ${country === c.label ? 'bg-[#307c4c]/10 text-[#307c4c] font-semibold' : 'text-slate-700'}`}
                      >
                        <span>{c.label}</span>
                        <span className="text-xs text-slate-400 font-normal">{c.currency}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Step 2 — File upload */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Step 2 — Excel File
            </label>

            {!file ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 rounded-xl cursor-pointer transition-all select-none
                  ${isDragging
                    ? 'border-2 border-[#307c4c] bg-[#307c4c]/5'
                    : 'border-2 border-dashed border-slate-200 bg-slate-50 hover:border-[#307c4c]/40 hover:bg-[#307c4c]/5'
                  }`}
                style={{ padding: 32 }}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${isDragging ? 'bg-[#307c4c]/20' : 'bg-slate-100'}`}>
                  <svg className={`w-5 h-5 ${isDragging ? 'text-[#307c4c]' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-600">
                    Drop your Excel file here
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    or{' '}
                    <span className="text-[#307c4c] font-semibold underline underline-offset-2">
                      browse files
                    </span>{' '}
                    · .xlsx, .xls only
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-[#307c4c]/30 bg-[#307c4c]/5">
                <div className="w-9 h-9 rounded-lg bg-[#307c4c]/10 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-[#307c4c]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{file.name}</p>
                  <p className="text-xs text-slate-400">{formatBytes(file.size)}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setParsed(null);
                    setParseError(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />

            {parseError && (
              <p className="mt-2 text-xs text-red-500 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                {parseError}
              </p>
            )}
          </div>

          {/* Step 3 — Column preview */}
          {parsed && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Step 3 — Column Mapping Preview
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Detected columns:
              </p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {parsed.headers.map((h, i) =>
                  h ? (
                    <span
                      key={i}
                      className="px-2.5 py-1 bg-slate-100 rounded-md text-xs font-medium border border-slate-200 text-slate-600"
                    >
                      {h}
                    </span>
                  ) : null,
                )}
              </div>
              {parsed.preview.length > 0 && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto max-h-40">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          {parsed.headers.map((h, i) => (
                            <th
                              key={i}
                              className="py-2 px-3 font-semibold text-slate-500 whitespace-nowrap"
                            >
                              {h || `Col ${i + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsed.preview.map((row, ri) => (
                          <tr key={ri} className={ri % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}>
                            {row.map((cell, ci) => (
                              <td
                                key={ci}
                                className="py-2 px-3 text-slate-600 whitespace-nowrap max-w-[140px] truncate"
                                title={cell}
                              >
                                {cell || <span className="text-slate-300">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <p className="text-xs text-slate-400 mt-2">
                {parsed.rows.length} data rows detected (first 3 shown above)
              </p>
            </div>
          )}

          {/* Import button */}
          <div className="pt-1">
            <button
              onClick={handleImport}
              disabled={!canImport}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100"
              style={{ background: canImport ? '#307c4c' : undefined }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {canImport
                ? `Import ${parsed!.rows.length.toLocaleString()} rows from ${country}`
                : 'Import rows'}
            </button>
          </div>
        </div>
      )}

      {/* ── Running phase ── */}
      {phase === 'running' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 max-w-2xl space-y-5">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 animate-spin text-[#307c4c] shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-slate-800">Processing rows…</p>
              <p className="text-xs text-slate-400">{progress}% complete</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progress}%`, background: '#307c4c' }}
            />
          </div>

          {/* Live log */}
          <div className="bg-[#0f172a] rounded-xl p-4 h-56 overflow-y-auto font-mono text-[11px] leading-5">
            {log.map((line, i) => {
              const color = line.startsWith('✅')
                ? 'text-emerald-400'
                : line.startsWith('⚠️')
                  ? 'text-amber-400'
                  : line.startsWith('❌')
                    ? 'text-red-400'
                    : 'text-slate-400';
              return (
                <div key={i} className={color}>
                  {line}
                </div>
              );
            })}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* ── Done phase ── */}
      {phase === 'done' && result && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 max-w-2xl space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${result.errors === 0 ? 'bg-[#307c4c]/10' : 'bg-amber-50'}`}>
              {result.errors === 0 ? (
                <svg className="w-5 h-5 text-[#307c4c]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              )}
            </div>
            <div>
              <p className="text-base font-bold text-slate-900">Migration Complete</p>
              <p className="text-xs text-slate-400">{country} · {file?.name}</p>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Inserted</p>
              <p className="text-2xl font-bold text-[#307c4c] tabular-nums mt-0.5">{result.inserted.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Skipped</p>
              <p className="text-2xl font-bold text-amber-500 tabular-nums mt-0.5">{result.skipped.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Errors</p>
              <p className="text-2xl font-bold text-red-500 tabular-nums mt-0.5">{result.errors.toLocaleString()}</p>
            </div>
          </div>

          {/* Final log */}
          <div className="bg-[#0f172a] rounded-xl p-4 h-48 overflow-y-auto font-mono text-[11px] leading-5">
            {log.map((line, i) => {
              const color = line.startsWith('✅')
                ? 'text-emerald-400'
                : line.startsWith('⚠️')
                  ? 'text-amber-400'
                  : line.startsWith('❌')
                    ? 'text-red-400'
                    : 'text-slate-400';
              return <div key={i} className={color}>{line}</div>;
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Import Another File
            </button>
            <a
              href="/ti-te/shipments"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: '#307c4c' }}
            >
              View Shipments
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      )}

      {/* ── Previous migrations ── */}
      <div>
        <SectionTitle>Previous Migrations</SectionTitle>
        <MigrationLogTable rows={history} loading={historyLoading} />
      </div>
    </div>
  );
}
