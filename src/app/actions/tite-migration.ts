'use server';

import titePool from '@/lib/db-tite';
import { withTransaction } from '@/lib/db/tx';
import { titeCountryCode, formatTiteReference, canonicalTiteCountry } from '@/lib/tite-constants';
import { alertLevelFor } from '@/lib/tite-utils';
import { requireAdmin, isAdminActor } from '@/lib/require-access';

/** Hard ceiling on rows accepted per call — a bulk INSERT is not a free-for-all. */
const MAX_IMPORT_ROWS = 5000;

/** Rows per multi-row INSERT. 100 × 21 columns is well inside the 65535 bind-parameter cap. */
const INSERT_CHUNK = 100;

/* ─── Types ──────────────────────────────────────────────────── */

export interface RawShipmentRow {
  rowIndex: number;
  no: string;
  segment: string | null;
  /** Origin country. May contain comma-separated values (e.g. "UAE, KSA").
   *  Stored as-is — no normalisation or splitting is applied. */
  from_country: string | null;
  to_country: string | null;
  invoice_number: string | null;
  invoice_value_usd: number | null;
  customs_reference_number: string | null;
  description: string | null;
  mot: string | null;
  awb_number: string | null;
  po_number: string | null;
  movement_type: string | null;
  /* Dates are RAW cell values — whatever the spreadsheet held. The client must not
     pre-parse them: `parseDateFlexible` below is the one parser, and it runs in
     UTC. A client-side `new Date(s).toISOString()` shifts every date back a day
     for a Gulf user and nulls the formats this one handles. */
  import_date: string | null;
  expiry_date: string | null;
  extended_date: string | null;
  deposit_usd: number | null;
  comments: string | null;
  status: string;
}

export interface MigrationResult {
  inserted: number;
  skipped: number;
  errors: number;
  log: string[];
}

export interface MigrationLogRow {
  id: number;
  country: string;
  filename: string;
  rows_inserted: number;
  rows_skipped: number;
  rows_errored: number;
  migrated_by: string;
  migrated_at: string;
}

/* The country → reference-prefix map and the canonical country list both live in
   `@/lib/tite-constants`, shared with the admin panels and the app pages. */

/* ─── Flexible date parser ───────────────────────────────────── */

/** Month abbreviation / full-name → zero-padded 2-digit number. */
const MONTH_NUM: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  january: '01', february: '02', march: '03', april: '04',
  june: '06', july: '07', august: '08', september: '09',
  october: '10', november: '11', december: '12',
};

/** Build a YYYY-MM-DD string and validate it. Returns null if the date is invalid. */
function toYMD(yyyy: string, mm: string, dd: string): string | null {
  const s = `${yyyy.padStart(4, '0')}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  return isNaN(new Date(s + 'T00:00:00Z').getTime()) ? null : s;
}

/**
 * Convert an Excel date serial number to YYYY-MM-DD.
 * Excel epoch: serial 1 = Jan 1 1900.
 * Excel has a well-known leap-year bug: serial 60 is the fictional Feb 29 1900.
 * All serials ≥ 60 are corrected by subtracting 1.
 */
function excelSerialToDate(serial: number): string | null {
  const n = Math.floor(serial);
  if (n <= 0) return null;
  const adj = n >= 60 ? n - 1 : n;
  const d = new Date(Date.UTC(1899, 11, 31) + adj * 86400000);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Parse a date value from an Excel migration row into YYYY-MM-DD, or null.
 * Used internally for import_date, expiry_date, and extended_date columns.
 *
 * Formats handled (tried in order):
 *   - Native JS number          → Excel serial  (e.g. 44927  → 2023-01-01)
 *   - null / "" / "—" / "="…   → null
 *   - YYYY-MM-DD                → pass-through
 *   - DD/Mon/YY or DD/Mon/YYYY  → e.g. "27/Apr/16" → 2016-04-27
 *   - DD-Mon-YY or DD-Mon-YYYY  → e.g. "23-Jan-27" → 2027-01-23
 *   - DD/MM/YYYY                → e.g. "15/06/2023" → 2023-06-15
 *   - DD-MM-YYYY                → e.g. "15-06-2023" → 2023-06-15
 *   - Numeric string            → Excel serial fallback
 */
function parseDateFlexible(value: unknown): string | null {
  if (value == null) return null;

  // Native number (XLSX library returns these for unformatted date cells)
  if (typeof value === 'number') return excelSerialToDate(value);

  const s = String(value).trim();
  if (!s || s === '—' || s === '-' || s.startsWith('=')) return null;

  // YYYY-MM-DD — already the target format
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return isNaN(new Date(s + 'T00:00:00Z').getTime()) ? null : s;
  }

  // DD/Mon/YY or DD/Mon/YYYY  e.g. "27/Apr/16", "24/Oct/16"
  let m = s.match(/^(\d{1,2})\/([A-Za-z]{3,9})\/(\d{2,4})$/);
  if (m) {
    const mm = MONTH_NUM[m[2].toLowerCase()];
    if (mm) {
      const y = m[3].length <= 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
      return toYMD(String(y), mm, m[1]);
    }
  }

  // DD-Mon-YY or DD-Mon-YYYY  e.g. "23-Jan-27"
  m = s.match(/^(\d{1,2})-([A-Za-z]{3,9})-(\d{2,4})$/);
  if (m) {
    const mm = MONTH_NUM[m[2].toLowerCase()];
    if (mm) {
      const y = m[3].length <= 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
      return toYMD(String(y), mm, m[1]);
    }
  }

  // DD/MM/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return toYMD(m[3], m[2], m[1]);

  // DD-MM-YYYY
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return toYMD(m[3], m[2], m[1]);

  // Numeric string → Excel serial fallback
  const n = Number(s);
  if (!isNaN(n) && n > 0) return excelSerialToDate(n);

  return null;
}

/* ─── Main action ────────────────────────────────────────────── */

/** The 21 columns a migrated shipment row writes, in bind order. */
const SHIPMENT_COLS = [
  'reference_number', 'segment', 'from_country', 'to_country',
  'invoice_number', 'invoice_value_usd', 'customs_reference_number', 'description',
  'mot', 'awb_number', 'po_number', 'movement_type',
  'import_date', 'expiry_date', 'extended_date',
  'deposit_usd', 'comments', 'status', 'alert_level', 'country', 'created_by',
] as const;

interface PreparedRow {
  rowIndex: number;
  reference_number: string;
  /** Log line to emit when this row inserts successfully. */
  successLine: string;
  values: unknown[];
}

/** `($1,$2,…,$21),($22,…)` for `count` rows of `SHIPMENT_COLS.length` columns. */
function valuePlaceholders(count: number): string {
  const width = SHIPMENT_COLS.length;
  return Array.from({ length: count }, (_, r) =>
    `(${Array.from({ length: width }, (_, c) => `$${r * width + c + 1}`).join(',')})`,
  ).join(',');
}

/**
 * Import one whole Excel file.
 *
 * The client sends the file in ONE call. It used to drive its own batches of 10,
 * each a separate server action writing its own `migration_log` row: a 500-row
 * file produced 50 partial log rows and ~100 sequential round trips with no
 * transaction at all, and a batch that threw left the UI stuck on 'running' with
 * a half-imported file and no way to tell which half. Now the whole file either
 * commits or does not, chunked server-side, with a single log row.
 *
 * Per-row reporting is unchanged: every row is still individually accounted for
 * as inserted / skipped / errored, and a single bad row is retried on its own so
 * it cannot take its chunk down with it.
 */
export async function importShipments(params: {
  country: string;
  filename: string;
  rows: RawShipmentRow[];
}): Promise<MigrationResult> {
  const admin = await requireAdmin();
  const { filename, rows } = params;
  const userEmail = admin.email;
  // Store the canonical spelling so the stakeholder seed below actually joins.
  const country = canonicalTiteCountry(params.country) ?? params.country;
  const countryCode = titeCountryCode(country);

  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      inserted: 0,
      skipped: 0,
      errors: rows.length,
      log: [`❌ Too many rows in one call (${rows.length}). The limit is ${MAX_IMPORT_ROWS}; split the file into smaller batches.`],
    };
  }

  /* ── Phase 1: prepare every row in memory. No DB connection is held here. ── */

  const lines = new Map<number, string>();   // rowIndex → log line, emitted in order
  const prepared: PreparedRow[] = [];
  const seenRefs = new Set<string>();
  let skipped = 0;
  let errors  = 0;

  const created_by = `migration-${country
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')}`;

  for (const row of rows) {
    const numericNo = row.no ? parseFloat(row.no.trim()) : NaN;
    if (isNaN(numericNo)) {
      lines.set(row.rowIndex, `⏭  Row ${row.rowIndex}: skipped — no reference number`);
      skipped++;
      continue;
    }

    const reference_number = formatTiteReference(countryCode, Math.round(numericNo));

    // A reference repeated inside the same file: ON CONFLICT would silently drop
    // the second copy, so report it as the duplicate it is.
    if (seenRefs.has(reference_number)) {
      lines.set(row.rowIndex, `⚠️  ${reference_number}: duplicated in this file, skipped`);
      skipped++;
      continue;
    }
    seenRefs.add(reference_number);

    // Dates are parsed HERE and only here. The client sends raw cell values.
    const importDate   = parseDateFlexible(row.import_date);
    const expiryDate   = parseDateFlexible(row.expiry_date);
    const extendedDate = parseDateFlexible(row.extended_date);

    prepared.push({
      rowIndex: row.rowIndex,
      reference_number,
      successLine: `✅ ${reference_number} | ${row.segment ?? ''} | ${row.movement_type ?? ''} | ${expiryDate ?? 'N/A'}`,
      values: [
        reference_number,
        row.segment,
        row.from_country,
        row.to_country,
        row.invoice_number,
        row.invoice_value_usd,
        row.customs_reference_number,
        row.description,
        row.mot,
        row.awb_number,
        row.po_number,
        row.movement_type,
        importDate,
        expiryDate,
        extendedDate,
        row.deposit_usd,
        row.comments,
        row.status,
        alertLevelFor(expiryDate, extendedDate, row.status),
        country,
        created_by,
      ],
    });
  }

  /* ── Phase 2: one transaction for the whole file. ── */

  const insertedIds: number[] = [];
  let seededContacts = 0;

  if (prepared.length > 0) {
    await withTransaction(titePool, async (client) => {
      const insertSql = (count: number) =>
        `INSERT INTO shipments (${SHIPMENT_COLS.join(', ')})
         VALUES ${valuePlaceholders(count)}
         ON CONFLICT (reference_number) DO NOTHING
         RETURNING id, reference_number`;

      for (let i = 0; i < prepared.length; i += INSERT_CHUNK) {
        const chunk = prepared.slice(i, i + INSERT_CHUNK);
        const sp = `mig_${i}`;
        await client.query(`SAVEPOINT ${sp}`);
        try {
          const res = await client.query<{ id: number; reference_number: string }>(
            insertSql(chunk.length),
            chunk.flatMap(p => p.values),
          );
          await client.query(`RELEASE SAVEPOINT ${sp}`);
          const landed = new Map(res.rows.map(r => [r.reference_number, r.id]));
          for (const p of chunk) {
            const id = landed.get(p.reference_number);
            if (id == null) {
              lines.set(p.rowIndex, `⚠️  ${p.reference_number}: already exists, skipped`);
              skipped++;
            } else {
              lines.set(p.rowIndex, p.successLine);
              insertedIds.push(id);
            }
          }
        } catch {
          // One bad row poisons its whole chunk inside a transaction. Roll the
          // chunk back and replay it row by row so the rest of the file survives
          // and the operator is told exactly which row failed.
          await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
          for (const p of chunk) {
            const rowSp = `mig_r_${p.rowIndex}`;
            await client.query(`SAVEPOINT ${rowSp}`);
            try {
              const one = await client.query<{ id: number }>(insertSql(1), p.values);
              await client.query(`RELEASE SAVEPOINT ${rowSp}`);
              if (one.rowCount === 0) {
                lines.set(p.rowIndex, `⚠️  ${p.reference_number}: already exists, skipped`);
                skipped++;
              } else {
                lines.set(p.rowIndex, p.successLine);
                insertedIds.push(one.rows[0].id);
              }
            } catch (err) {
              await client.query(`ROLLBACK TO SAVEPOINT ${rowSp}`);
              lines.set(
                p.rowIndex,
                `❌ ${p.reference_number}: ${err instanceof Error ? err.message : String(err)}`,
              );
              errors++;
            }
          }
        }
      }

      /* Seed default notification recipients for everything that landed, in one
         statement. A migrated shipment with no recipients is invisible to the
         expiry alerts, which is how a customs deadline gets missed — so this is
         inside the transaction, but behind a savepoint so a stakeholder-table
         problem reports itself instead of discarding the whole import. */
      if (insertedIds.length > 0) {
        await client.query(`SAVEPOINT mig_contacts`);
        try {
          const seeded = await client.query(
            `INSERT INTO shipment_notification_contacts
               (shipment_id, email, name, role,
                notify_60_days, notify_30_days, notify_14_days, notify_7_days,
                notify_2_days, notify_1_day, notify_0_day, notify_overdue)
             SELECT sid, cs.email, cs.name, cs.role,
                    true, true, true, true, true, true, true, true
             FROM unnest($1::int[]) AS sid
             CROSS JOIN country_stakeholders cs
             WHERE cs.country = $2 AND cs.active = true
             ON CONFLICT DO NOTHING`,
            [insertedIds, country],
          );
          await client.query(`RELEASE SAVEPOINT mig_contacts`);
          seededContacts = seeded.rowCount ?? 0;
        } catch (err) {
          await client.query(`ROLLBACK TO SAVEPOINT mig_contacts`);
          lines.set(
            Number.MAX_SAFE_INTEGER - 1,
            `❌ Default notifiers could not be seeded: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    });
  }

  const inserted = insertedIds.length;

  if (inserted > 0 && seededContacts === 0) {
    lines.set(
      Number.MAX_SAFE_INTEGER,
      `⚠️  No default notifiers configured for "${country}" — ${inserted} shipment${inserted === 1 ? '' : 's'} imported with no expiry recipients. Add them under Default Notifiers.`,
    );
  }

  const log = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, line]) => line);

  // ONE row per file, written after the import commits (best-effort: the
  // migration_log table may not exist yet, and that must not undo the import).
  try {
    await titePool.query(
      `INSERT INTO migration_log
         (country, filename, rows_inserted, rows_skipped, rows_errored, migrated_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [country, filename, inserted, skipped, errors, userEmail],
    );
  } catch {
    // migration_log table may not exist yet — non-fatal
  }

  return { inserted, skipped, errors, log };
}

/* ─── Fetch migration log ────────────────────────────────────── */

export async function getMigrationLog(): Promise<MigrationLogRow[]> {
  // Read the admin panel renders: degrade to an empty history, never crash.
  if (!(await isAdminActor())) return [];
  try {
    const { rows } = await titePool.query<MigrationLogRow>(
      `SELECT id, country, filename, rows_inserted, rows_skipped,
              rows_errored, migrated_by,
              migrated_at AT TIME ZONE 'UTC' AS migrated_at
       FROM migration_log
       ORDER BY migrated_at DESC
       LIMIT 20`,
    );
    return rows;
  } catch {
    return [];
  }
}
