'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { Icon } from '../../components/CatalogManagerUI';
import { bulkImportCatalogEntries, type CatalogImportRow } from '@/app/actions/catalog-manager';
import { SEED_UOMS, SEED_CURRENCIES, SEED_COUNTRIES, INCOTERMS } from '@/lib/catalog-manager-utils';
import { SPEND_TAXONOMY } from '@/lib/catalog-taxonomy';

type Phase = 'form' | 'running' | 'done';

interface ParsedFile {
  rows: CatalogImportRow[];
  headers: string[];
  preview: string[][];
}

// Data-validation kind for each template column (drives the dropdowns / typed cells).
type DVKind = 'text' | 'code' | 'country' | 'category' | 'subcategory' | 'uom' | 'currency' | 'incoterms' | 'price' | 'date' | 'whole';

// Column order the importer expects (A → Q). `hint` powers the "Field guide" sheet.
const COLUMNS: { label: string; field: string; required: boolean; keywords: string[]; dv: DVKind; hint: string }[] = [
  { label: 'Supplier', field: 'supplier', required: true, keywords: ['supplier'], dv: 'text', hint: 'Supplier / vendor name (free text).' },
  { label: 'Supplier Code', field: 'supplier_code', required: true, keywords: ['code', 'vendor'], dv: 'code', hint: 'SAP vendor code — leading zeros are preserved (cell is text).' },
  { label: 'Country', field: 'country', required: true, keywords: ['country'], dv: 'country', hint: 'Pick from the dropdown (2-letter code, e.g. SA).' },
  { label: 'Spend Category', field: 'category', required: false, keywords: ['category', 'spend'], dv: 'category', hint: 'Optional — pick from the dropdown of active categories.' },
  { label: 'Sub-Category', field: 'subcategory', required: false, keywords: ['sub'], dv: 'subcategory', hint: 'Optional — pick from the dropdown.' },
  { label: 'Commodity', field: 'commodity', required: true, keywords: ['commodity'], dv: 'text', hint: 'What is being priced (free text).' },
  { label: 'Description', field: 'description', required: false, keywords: ['description', 'desc', 'service', 'item'], dv: 'text', hint: 'Optional — longer description; defaults to the commodity if blank.' },
  { label: 'UOM', field: 'uom', required: true, keywords: ['uom', 'unit of measure', 'unit'], dv: 'uom', hint: 'Pick from the dropdown of active units of measure.' },
  { label: 'Unit Price', field: 'unit_price', required: true, keywords: ['price', 'rate', 'value'], dv: 'price', hint: 'Number greater than 0 — no currency symbols or thousands separators.' },
  { label: 'Currency', field: 'currency', required: true, keywords: ['currency', 'ccy'], dv: 'currency', hint: 'Pick from the dropdown of valid currency codes.' },
  { label: 'Effective Date', field: 'effective_date', required: true, keywords: ['effective', 'start'], dv: 'date', hint: 'Date the rate starts (YYYY-MM-DD).' },
  { label: 'Expiry Date', field: 'expiry_date', required: false, keywords: ['expiry', 'expiration', 'end'], dv: 'date', hint: 'Optional — date the rate lapses (YYYY-MM-DD).' },
  { label: 'Supplier Manager', field: 'manager', required: false, keywords: ['manager', 'owner'], dv: 'text', hint: 'Optional — accountable owner for the supplier.' },
  { label: 'Sirion Contract ID', field: 'sirion_contract_id', required: false, keywords: ['sirion', 'contract'], dv: 'text', hint: 'Optional — e.g. SIR-CN-000000.' },
  { label: 'Notes', field: 'notes', required: false, keywords: ['notes', 'comment', 'remark'], dv: 'text', hint: 'Optional — free text.' },
  { label: 'Incoterms', field: 'incoterms', required: false, keywords: ['incoterm'], dv: 'incoterms', hint: 'Optional — pick from the dropdown (Incoterms 2020).' },
  { label: 'Lead Time', field: 'lead_time', required: false, keywords: ['lead', 'lead time'], dv: 'whole', hint: 'Optional — supplier lead time as a whole number of days.' },
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
            incoterms: orNull(cell(row, 15)),
            lead_time_days: parseNum(row[16]),
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

const TPL_GREEN = 'FF307C4C';
const TPL_GREEN_DARK = 'FF1D4F31';
const TPL_PALE = 'FFEAF4EF';
const TPL_BORDER = 'FFD9E2DC';
const TPL_DATA_ROWS = 400;

const tplHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TPL_GREEN } } as ExcelJS.Fill;
const tplThin = { style: 'thin', color: { argb: TPL_BORDER } } as ExcelJS.Border;
const tplBox = { top: tplThin, left: tplThin, bottom: tplThin, right: tplThin };

/** Build the Excel data-validation rule for a template column (dropdowns + typed cells). */
function validationFor(kind: DVKind, required: boolean, listRange: Record<string, string>): ExcelJS.DataValidation | null {
  const allowBlank = !required;
  switch (kind) {
    case 'country': case 'category': case 'subcategory': case 'uom': case 'currency': case 'incoterms':
      return {
        type: 'list', allowBlank, formulae: [listRange[kind]],
        showErrorMessage: true, errorStyle: 'error', errorTitle: 'Pick from the list',
        error: 'Choose one of the allowed values from the dropdown.',
      };
    case 'price':
      return {
        type: 'decimal', operator: 'greaterThan', allowBlank: false, formulae: [0],
        showErrorMessage: true, errorStyle: 'error', errorTitle: 'Invalid unit price',
        error: 'Enter a number greater than 0 — no currency symbols or thousands separators.',
      };
    case 'date':
      return {
        type: 'date', operator: 'greaterThan', allowBlank, formulae: [new Date(2000, 0, 1)],
        showErrorMessage: true, errorStyle: 'error', errorTitle: 'Invalid date',
        error: 'Enter a valid date (format YYYY-MM-DD).',
      };
    case 'whole':
      return {
        type: 'whole', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0],
        showErrorMessage: true, errorStyle: 'error', errorTitle: 'Invalid lead time',
        error: 'Enter a whole number of days (0 or more).',
      };
    default:
      return null; // free text — no validation
  }
}

async function downloadTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NESR Catalog Repo';
  wb.created = new Date();

  // Validation source data (kept on a hidden "Lists" sheet, referenced by range).
  const subcats = Array.from(new Set(SPEND_TAXONOMY.flatMap((c) => c.subs.map((s) => s.name)))).sort();
  const listCols: { header: string; values: string[] }[] = [
    { header: 'Countries', values: SEED_COUNTRIES.map((c) => c.code) },
    { header: 'Categories', values: SPEND_TAXONOMY.map((c) => c.name) },
    { header: 'Sub-categories', values: subcats },
    { header: 'UOMs', values: [...SEED_UOMS] },
    { header: 'Currencies', values: SEED_CURRENCIES.map((c) => c.code) },
    { header: 'Incoterms', values: INCOTERMS.map((i) => `${i.code}`) },
  ];
  const L = ['A', 'B', 'C', 'D', 'E', 'F'];
  // Prefer an INLINE dropdown list — the most reliably-rendered form across Excel,
  // Google Sheets and LibreOffice. Fall back to a reference into the hidden "Lists"
  // sheet only when the inline form would break: Excel caps an inline list formula at
  // 255 characters, and a value containing a comma/quote can't be inlined.
  const listFormula = (colIdx: number): string => {
    const values = listCols[colIdx].values;
    const inline = `"${values.join(',')}"`;
    const inlineSafe = inline.length <= 255 && !values.some((v) => v.includes(',') || v.includes('"'));
    return inlineSafe ? inline : `Lists!$${L[colIdx]}$2:$${L[colIdx]}$${1 + values.length}`;
  };
  const listRange: Record<string, string> = {
    country: listFormula(0),
    category: listFormula(1),
    subcategory: listFormula(2),
    uom: listFormula(3),
    currency: listFormula(4),
    incoterms: listFormula(5),
  };

  /* ── 1) Instructions ── */
  const info = wb.addWorksheet('Instructions');
  info.getColumn(1).width = 118;
  const infoLines: { t: string; head?: boolean; title?: boolean }[] = [
    { t: 'NESR Catalog Repo — Bulk Import Template', title: true },
    { t: '' },
    { t: 'HOW TO FILL', head: true },
    { t: '1. Enter one catalog rate per row on the "Catalog" sheet, starting at row 2 (row 1 is the header).' },
    { t: '2. Required columns are marked with * in the header: Supplier, Supplier Code, Country, Commodity, UOM, Unit Price, Currency, Effective Date.' },
    { t: '3. Country, Spend Category, Sub-Category, UOM, Currency and Incoterms are DROPDOWNS — click the cell and pick a value.' },
    { t: '4. Unit Price accepts numbers greater than 0 only. Lead Time is a whole number of days.' },
    { t: '5. Effective / Expiry Date must be real dates (YYYY-MM-DD).' },
    { t: '6. Supplier Code is stored as text so leading zeros (e.g. 0001103058) are preserved.' },
    { t: '7. See the "Field guide" tab for every column, whether it is required, and its allowed values.' },
    { t: '' },
    { t: 'HOW NOT TO FILL', head: true },
    { t: '1. Do NOT rename, remove, or reorder the header columns — rows are read by column position.' },
    { t: '2. Do NOT merge cells, add total rows, or leave blank rows between entries.' },
    { t: '3. Do NOT add currency symbols or thousands separators to Unit Price (enter 128000, not "SAR 128,000").' },
    { t: '4. Do NOT type your own categories, UOMs, currencies, or Incoterms — use the dropdowns; unknown values are rejected.' },
    { t: '5. A row matching an existing active rate (same vendor code + country + description) is skipped as a duplicate.' },
    { t: '' },
    { t: 'Rates at or above the approval threshold (USD equivalent) are routed to Pending Approval; the rest activate immediately.' },
  ];
  infoLines.forEach((line) => {
    const row = info.addRow([line.t]);
    const cell = row.getCell(1);
    if (line.title) cell.font = { bold: true, size: 14, color: { argb: TPL_GREEN_DARK } };
    else if (line.head) cell.font = { bold: true, size: 11, color: { argb: TPL_GREEN } };
    else cell.font = { size: 10, color: { argb: 'FF334155' } };
    cell.alignment = { wrapText: true, vertical: 'middle' };
  });

  /* ── 2) Catalog (data entry, validated) ── */
  const cat = wb.addWorksheet('Catalog', { views: [{ state: 'frozen', ySplit: 1 }] });
  COLUMNS.forEach((c, i) => {
    const col = cat.getColumn(i + 1);
    col.width = c.field === 'description' || c.field === 'notes' ? 32
      : c.field === 'supplier' || c.field === 'commodity' ? 26
      : c.field === 'sirion_contract_id' ? 20 : 16;

    const headCell = cat.getCell(1, i + 1);
    headCell.value = `${c.label}${c.required ? ' *' : ''}`;
    headCell.fill = tplHeaderFill;
    headCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headCell.alignment = { vertical: 'middle', horizontal: 'left' };
    headCell.border = tplBox;

    const dv = validationFor(c.dv, c.required, listRange);
    for (let r = 2; r <= TPL_DATA_ROWS + 1; r++) {
      const cell = cat.getCell(r, i + 1);
      if (c.dv === 'code') cell.numFmt = '@';
      else if (c.dv === 'price') cell.numFmt = '#,##0.00';
      else if (c.dv === 'date') cell.numFmt = 'yyyy-mm-dd';
      else if (c.dv === 'whole') cell.numFmt = '0';
      if (dv) cell.dataValidation = dv;
    }
  });
  cat.getRow(1).height = 22;

  /* ── 3) Field guide (the required/format reference table) ── */
  const guide = wb.addWorksheet('Field guide');
  guide.columns = [
    { header: 'Field', width: 22 },
    { header: 'Required', width: 12 },
    { header: 'Format / allowed values', width: 62 },
  ];
  const gHead = guide.getRow(1);
  gHead.height = 20;
  gHead.eachCell((cell) => {
    cell.fill = tplHeaderFill;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle' };
    cell.border = tplBox;
  });
  COLUMNS.forEach((c, i) => {
    const row = guide.addRow([c.label, c.required ? 'Required' : 'Optional', c.hint]);
    if (i % 2 === 1) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TPL_PALE } } as ExcelJS.Fill; });
    row.getCell(1).font = { bold: true, color: { argb: 'FF0F172A' } };
    row.getCell(2).font = { bold: true, color: { argb: c.required ? TPL_GREEN_DARK : 'FF94A3B8' } };
    row.getCell(3).font = { color: { argb: 'FF475569' } };
    row.eachCell((cell) => { cell.alignment = { vertical: 'middle', wrapText: true }; cell.border = tplBox; });
  });

  /* ── 4) Lists (hidden validation source) ── */
  const lists = wb.addWorksheet('Lists', { state: 'hidden' });
  listCols.forEach((col, ci) => {
    lists.getColumn(ci + 1).width = 22;
    const head = lists.getCell(`${L[ci]}1`);
    head.value = col.header;
    head.font = { bold: true, color: { argb: TPL_GREEN_DARK } };
    col.values.forEach((v, ri) => { lists.getCell(`${L[ci]}${ri + 2}`).value = v; });
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'NESR_Catalog_Import_Template.xlsx';
  a.click();
  URL.revokeObjectURL(url);
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
        <button onClick={() => { void downloadTemplate(); }} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-sm transition-all hover:border-[#307c4c]/40 hover:text-[#307c4c] active:scale-[0.98]">
          <Icon name="download" className="h-3.5 w-3.5" /> Download template
        </button>
      </div>

      {phase === 'form' && (
        <div className="cm-fade-up space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
          {!file ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer select-none flex-col items-center justify-center gap-3 rounded-xl p-8 transition-all ${isDragging ? 'border-2 border-[#307c4c] bg-[#307c4c]/5' : 'border-2 border-dashed border-slate-200 bg-slate-50 hover:border-[#307c4c]/40 hover:bg-[#307c4c]/5'}`}
            >
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 ${isDragging ? 'scale-110 bg-[#307c4c]/20 text-[#307c4c]' : 'bg-slate-100 text-slate-400'}`}>
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
        <div className="cm-fade-up space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
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
        <div className="cm-fade-up space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
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
            <button onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-[#6aaf8e] active:scale-[0.98]"><Icon name="upload" className="h-4 w-4" /> Import another file</button>
            <Link href="/catalog-manager/catalog" className="inline-flex items-center gap-2 rounded-lg bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#307c4c]/25 transition-all hover:bg-[#2b6f44] active:scale-[0.98]">View catalog <Icon name="arrowRight" className="h-4 w-4" /></Link>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3.5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Expected columns (in order)</p></div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead><tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-4 py-2.5">Col</th><th className="px-4 py-2.5">Header</th><th className="px-4 py-2.5">Required</th><th className="px-4 py-2.5">Type / allowed values</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {COLUMNS.map((c, i) => (
                <tr key={c.label} className={i % 2 ? 'bg-slate-50/50' : 'bg-white'}>
                  <td className="px-4 py-2 font-mono text-[12px] font-semibold text-slate-700">{String.fromCharCode(65 + i)}</td>
                  <td className="px-4 py-2 font-medium text-slate-700">{c.label}</td>
                  <td className="px-4 py-2">{c.required ? <span className="font-semibold text-[#307c4c]">Required</span> : <span className="text-slate-400">Optional</span>}</td>
                  <td className="px-4 py-2 text-[12px] text-slate-500">{c.hint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
          <ul className="space-y-1.5 text-xs text-slate-600">
            {[
              'Download the template above — Country, Spend Category, Sub-Category, UOM, Currency and Incoterms are locked dropdowns, and Unit Price / dates / Lead Time only accept valid values.',
              'Row 1 is the header row; data starts on row 2. Columns are read by position, so keep the order.',
              'Commodity is required; Spend Category and Description are optional (Description defaults to the Commodity when blank).',
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
