#!/usr/bin/env node
/**
 * Post-Fact (KPI - Post Fact) from the "PostFact Audit" workbook (one "<Month> <yy> (Audits)" sheet
 * per month of audited sample POs), as a Health Board upload file. The procedure, and why, is in
 * src/lib/health-board/procedures/post-fact.md.
 *
 *   node scripts/health-board-postfact-from-audit.mjs --file="<PostFact Audit ….xlsx>" \
 *     --year=2026 --months=March,April,May,June --out=reports/health-board/postfact-2026-mar-jun.csv
 *
 * Per country and month: FAIL ÷ every audited PO with a result (PASS, FAIL, COMPLIANT POST FACT,
 * COMPLIANT W MOC; the compliant ones count in the sample but not as failures). Global: all FAILs ÷
 * all audited POs. Rounded to 2 decimals, as the board's stored months are. This reproduces the
 * board's November 2025 – February 2026 values exactly (checked 24 Nov 2026).
 */
import { writeFileSync } from 'node:fs';
import { createJiti } from 'jiti';
import { openWorkbook } from './lib/xlsx-sheets.mjs';

const jiti = createJiti(import.meta.url);
const { normaliseCountry, MONTHS } = await jiti.import('../src/lib/health-board/definitions.ts');

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const FILE = arg('file');
const YEAR = Number(arg('year'));
const MONTHS_IN = (arg('months') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const OUT = arg('out');
if (!FILE || !YEAR || !OUT || !MONTHS_IN.length || MONTHS_IN.some((m) => !MONTHS.includes(m))) {
  console.error('Usage: --file=… --year=2026 --months=March,April --out=upload.csv');
  process.exit(2);
}

/* The audit team's country codes, where they are not the board's own names. */
const CODE = {
  ALG: 'Algeria',
  EGPT: 'Egypt',
  EGT: 'Egypt',
  INA: 'Indonesia',
  IRQ: 'Iraq',
  KWT: 'Kuwait',
  OMN: 'Oman',
  LBY: 'Libya',
  QTR: 'Qatar',
  IND: 'India',
  BHR: 'Bahrain',
  JRD: 'Jordan',
  'UAE EOS': 'EOS',
  'UAE HQ': 'HQ Dubai',
};
const RESULTS = new Set(['PASS', 'FAIL', 'COMPLIANT POST FACT', 'COMPLIANT W MOC']);
const round2 = (x) => Math.round(x * 100) / 100;

const wb = await openWorkbook(FILE);
/* "June 26 (audits)", "January 26 (Audits)", "May 26 (audits)" … */
const sheetFor = (month) => {
  const want = `${month} ${String(YEAR).slice(2)} (audits)`.toLowerCase();
  const name = wb.names.find((n) => n.trim().toLowerCase() === want);
  if (!name) throw new Error(`${FILE}: no "${month} ${String(YEAR).slice(2)} (Audits)" sheet`);
  return name;
};

const lines = [['Country', 'Value', 'Month', 'Year', 'KPI', 'Category', 'Unit', 'Target words']];
for (const month of MONTHS_IN) {
  const name = sheetFor(month);
  const rows = (await wb.rows(name)).filter(Boolean);
  const hi = rows.findIndex((r) => r.some((v) => String(v ?? '').trim() === 'Country'));
  const head = rows[hi].map((v) =>
    String(v ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s/g, ''),
  );
  const ic = head.indexOf('COUNTRY');
  const ir = head.indexOf('PASS/FAIL');
  if (hi < 0 || ic < 0 || ir < 0) throw new Error(`${name}: no Country or PASS/FAIL column`);
  const by = new Map();
  for (const r of rows.slice(hi + 1)) {
    const raw = String(r[ic] ?? '').trim();
    const result = String(r[ir] ?? '')
      .trim()
      .toUpperCase();
    if (!raw || !result) continue;
    if (!RESULTS.has(result)) throw new Error(`${name}: unknown result "${result}" for ${raw}`);
    const country = CODE[raw] ?? normaliseCountry(raw);
    if (!country) throw new Error(`${name}: unknown country "${raw}"`);
    const t = by.get(country) ?? { n: 0, fail: 0 };
    t.n++;
    if (result === 'FAIL') t.fail++;
    by.set(country, t);
  }
  let n = 0;
  let fail = 0;
  for (const [country, t] of by) {
    n += t.n;
    fail += t.fail;
    lines.push([
      country,
      String(round2((100 * t.fail) / t.n)),
      month,
      String(YEAR),
      'KPI - Post Fact',
      'Purchasing',
      '%',
      '',
    ]);
  }
  const global = round2((100 * fail) / n);
  lines.push([
    'Global',
    String(global),
    month,
    String(YEAR),
    'KPI - Post Fact',
    'Purchasing',
    '%',
    '',
  ]);
  console.log(
    `${month} (${name}): ${[...by].map(([c, t]) => `${c} ${t.fail}/${t.n}`).join(', ')}; Global ${global}% (${fail}/${n})`,
  );
}
writeFileSync(OUT, lines.map((l) => l.join(',')).join('\r\n') + '\r\n');
console.log(`\nWrote ${OUT}: ${lines.length - 1} rows.`);
