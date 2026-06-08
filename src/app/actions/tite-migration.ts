'use server';

import titePool from '@/lib/db-tite';

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

/* ─── Country code map ───────────────────────────────────────── */

const COUNTRY_CODE: Record<string, string> = {
  'Saudi Arabia (KSA)':          'KSA',
  'United Arab Emirates (UAE)':  'UAE',
  'Qatar':                        'QAT',
  'Kuwait':                       'KWT',
  'Oman':                         'OMN',
  'Bahrain':                      'BHR',
  'Egypt':                        'EGY',
  'Algeria':                      'DZA',
  'Iraq':                         'IRQ',
  'Libya':                        'LBY',
  'Chad':                         'TCD',
  'Congo':                        'COG',
  'Other':                        'OTH',
};

/* ─── Alert level ────────────────────────────────────────────── */

function calcAlertLevel(
  expiryDate: string | null,
  extendedDate: string | null,
  status: string,
): string {
  if (status === 'Closed' || status === 'Closed - Refund Recovered') return 'closed';
  const effective = extendedDate || expiryDate;
  if (!effective) return 'ok';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil(
    (new Date(effective).getTime() - today.getTime()) / 86400000,
  );
  if (diff < 0)   return 'overdue';
  if (diff <= 7)  return 'urgent';
  if (diff <= 14) return 'action';
  if (diff <= 30) return 'plan';
  if (diff <= 60) return 'info';
  return 'ok';
}

/* ─── Main action ────────────────────────────────────────────── */

export async function importShipments(params: {
  country: string;
  filename: string;
  rows: RawShipmentRow[];
  userEmail: string;
}): Promise<MigrationResult> {
  const { country, filename, rows, userEmail } = params;
  const countryCode = COUNTRY_CODE[country] ?? 'OTH';

  const log: string[] = [];
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    // Skip rows with no reference number
    if (!row.no || row.no.trim() === '') {
      log.push(`⏭  Row ${row.rowIndex}: skipped — no reference number`);
      skipped++;
      continue;
    }

    const numericNo = parseFloat(row.no.trim());
    if (isNaN(numericNo)) {
      log.push(`⏭  Row ${row.rowIndex}: skipped — no reference number`);
      skipped++;
      continue;
    }

    const reference_number =
      `${countryCode}-${String(Math.round(numericNo)).padStart(3, '0')}`;

    try {
      const alert_level = calcAlertLevel(
        row.expiry_date,
        row.extended_date,
        row.status,
      );

      const created_by = `migration-${country
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')}`;

      const result = await titePool.query(
        `INSERT INTO shipments (
          reference_number,
          segment,
          from_country,
          to_country,
          invoice_number,
          invoice_value_usd,
          customs_reference_number,
          description,
          mot,
          awb_number,
          po_number,
          movement_type,
          import_date,
          expiry_date,
          extended_date,
          deposit_usd,
          comments,
          status,
          alert_level,
          country,
          created_by
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
        )
        ON CONFLICT (reference_number) DO NOTHING`,
        [
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
          row.import_date,
          row.expiry_date,
          row.extended_date,
          row.deposit_usd,
          row.comments,
          row.status,
          alert_level,
          country,
          created_by,
        ],
      );

      if (result.rowCount === 0) {
        log.push(`⚠️  ${reference_number}: already exists, skipped`);
        skipped++;
      } else {
        log.push(
          `✅ ${reference_number} | ${row.segment ?? ''} | ${row.movement_type ?? ''} | ${row.expiry_date ?? 'N/A'}`,
        );
        inserted++;
      }
    } catch (err: any) {
      log.push(`❌ ${reference_number}: ${err?.message ?? String(err)}`);
      errors++;
    }
  }

  // Record in migration_log (best-effort — don't fail the whole import)
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
