import path from 'path';
import * as XLSX from 'xlsx';
import titePool from '../src/lib/db-tite';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const parseDate = (val: any): string | null => {
  if (!val) return null;
  const s = String(val).trim();
  if (s.startsWith('=') || s === '') return null;
  // Handle DD/MM/YYYY format
  const parts = s.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    const dt = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
    if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
  }
  // Handle yyyy-mm-dd and other formats
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
  return null;
};

const calcAlertLevel = (
  expiryDate: string | null,
  extendedDate: string | null,
  status: string
): string => {
  if (status === 'Closed') return 'closed';
  const effective = extendedDate || expiryDate;
  if (!effective) return 'ok';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(effective);
  const diff = Math.ceil((exp.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff <= 7) return 'urgent';
  if (diff <= 14) return 'action';
  if (diff <= 30) return 'plan';
  if (diff <= 60) return 'info';
  return 'ok';
};

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

async function migrateKSA() {
  console.log('Starting KSA TI-TE migration...\n');

  const workbook = XLSX.readFile(path.join(__dirname, '../scripts/data/TI_TE_Portal_KSA.xlsx'));
  const sheet = workbook.Sheets['KSA (2)'];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    dateNF: 'yyyy-mm-dd',
  });

  // Test DB connection before processing rows
  try {
    const client = await titePool.connect();
    console.log('DB connection OK');
    client.release();
  } catch (connErr: any) {
    console.error('DB connection FAILED:', connErr?.message || String(connErr));
    throw connErr;
  }

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  // Row 0: title, Row 1: headers — skip both; data starts at row 2 (index 2)
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];

    // Skip rows with no reference number (col 0)
    const rawNo = row[0];
    if (rawNo === null || rawNo === undefined || String(rawNo).trim() === '' || String(rawNo).trim().toLowerCase() === 'nan') {
      console.log(`⏭  Row ${i}: skipped — no reference number`);
      skipped++;
      continue;
    }

    const numericNo = parseFloat(String(rawNo).trim());
    if (isNaN(numericNo)) {
      console.log(`⏭  Row ${i}: skipped — no reference number`);
      skipped++;
      continue;
    }

    const reference_number = 'KSA-' + String(Math.round(numericNo)).padStart(3, '0');

    try {
      // col 1: segment
      const segment = row[1] ? String(row[1]).trim() || null : null;

      // col 2: from_country
      const from_country = row[2] ? String(row[2]).trim() : null;

      // col 3: to_country
      const to_country = row[3] ? String(row[3]).trim() : null;

      // col 4: invoice_number
      const invoice_number = row[4] ? String(row[4]).trim() || null : null;

      // col 5: invoice_value — parseFloat only, null if formula or NaN
      let invoice_value: number | null = null;
      if (row[5] !== null && row[5] !== undefined) {
        const ivStr = String(row[5]).trim();
        if (!ivStr.startsWith('=')) {
          const parsed = parseFloat(ivStr);
          invoice_value = isNaN(parsed) ? null : parsed;
        }
      }

      // col 6: bayan_number — null if starts with '=' or empty
      let bayan_number: string | null = null;
      if (row[6] !== null && row[6] !== undefined) {
        const bnStr = String(row[6]).trim();
        if (!bnStr.startsWith('=') && bnStr !== '') {
          bayan_number = bnStr;
        }
      }

      // col 7: description
      const description = row[7] ? String(row[7]).trim() : null;

      // col 8: mot — normalize 'Lnad' → 'Land'
      let mot: string | null = null;
      if (row[8] !== null && row[8] !== undefined) {
        let motStr = String(row[8]).trim();
        if (motStr === 'Lnad') motStr = 'Land';
        mot = motStr || null;
      }

      // col 9: awb_number
      const awb_number = row[9] ? String(row[9]).trim() || null : null;

      // col 10: import_date
      const import_date = parseDate(row[10]);

      // col 11: deposit_sar and deposit_local — parseFloat only, null if formula or NaN
      let deposit_sar: number | null = null;
      if (row[11] !== null && row[11] !== undefined) {
        const dsStr = String(row[11]).trim();
        if (!dsStr.startsWith('=')) {
          const parsed = parseFloat(dsStr);
          deposit_sar = isNaN(parsed) ? null : parsed;
        }
      }
      const deposit_local = deposit_sar;

      // col 12: deposit_usd — SKIP Excel column, calculate from deposit_sar
      const deposit_usd: number | null =
        deposit_sar !== null ? deposit_sar / 3.75 : null;

      // col 13: po_number
      const po_number = row[13] !== null && row[13] !== undefined
        ? String(row[13]).trim() || null
        : null;

      // col 14: movement_type — normalize trailing spaces
      let movement_type: string | null = null;
      if (row[14] !== null && row[14] !== undefined) {
        const mtStr = String(row[14]).trim();
        if (mtStr === 'Import' || mtStr === 'Import  ') movement_type = 'Import';
        else if (mtStr === 'Export' || mtStr === 'Export  ') movement_type = 'Export';
        else movement_type = mtStr || null;
      }

      // col 15: expiry_date — null if starts with '='
      let expiry_date: string | null = null;
      if (row[15] !== null && row[15] !== undefined) {
        const edStr = String(row[15]).trim();
        if (!edStr.startsWith('=')) {
          expiry_date = parseDate(edStr);
        }
      }

      // col 16: extended_date — null if starts with '=' or empty
      let extended_date: string | null = null;
      if (row[16] !== null && row[16] !== undefined) {
        const exdStr = String(row[16]).trim();
        if (!exdStr.startsWith('=') && exdStr !== '') {
          extended_date = parseDate(exdStr);
        }
      }

      // col 17: comments
      const comments = row[17] ? String(row[17]).trim() || null : null;

      // col 18: status
      let status = 'Active';
      if (row[18] !== null && row[18] !== undefined) {
        if (String(row[18]).toLowerCase().includes('closed')) {
          status = 'Closed';
        }
      }

      const alert_level = calcAlertLevel(expiry_date, extended_date, status);

      const result = await titePool.query(
        `INSERT INTO shipments (
          reference_number,
          segment,
          from_country,
          to_country,
          invoice_number,
          invoice_value,
          bayan_number,
          description,
          mot,
          awb_number,
          po_number,
          movement_type,
          import_date,
          expiry_date,
          extended_date,
          deposit_sar,
          deposit_local,
          deposit_usd,
          comments,
          status,
          alert_level,
          created_by
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
        )
        ON CONFLICT (reference_number) DO NOTHING`,
        [
          reference_number,
          segment,
          from_country,
          to_country,
          invoice_number,
          invoice_value,
          bayan_number,
          description,
          mot,
          awb_number,
          po_number,
          movement_type,
          import_date,
          expiry_date,
          extended_date,
          deposit_sar,
          deposit_local,
          deposit_usd,
          comments,
          status,
          alert_level,
          'migration-ksa',
        ]
      );

      if (result.rowCount === 0) {
        console.log(`⚠️  ${reference_number}: already exists, skipped`);
        skipped++;
      } else {
        console.log(
          `✅ ${reference_number} | ${segment ?? ''} | ${movement_type ?? ''} | Expiry: ${expiry_date ?? 'N/A'}`
        );
        inserted++;
      }
    } catch (err: any) {
      console.error(`[ERROR] Row ${i}: ${err?.message || err?.code || String(err)}`);
      if (err?.stack) console.error(err.stack);
      errors++;
    }
  }

  console.log(`
=============================
Migration complete — KSA
✅ Inserted:  ${inserted}
⚠️  Skipped:   ${skipped}
❌ Errors:    ${errors}
=============================
`);
}

migrateKSA()
  .then(() => {
    titePool.end();
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    titePool.end();
    process.exit(1);
  });
