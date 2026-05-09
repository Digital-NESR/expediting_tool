import path from 'path';
import * as XLSX from 'xlsx';
import titePool from '@/lib/db-tite';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Helpers (mirrors scripts/migrate-tite-ksa.ts)
// ---------------------------------------------------------------------------

const parseDate = (val: any): string | null => {
  if (!val) return null;
  const s = String(val).trim();
  if (s.startsWith('=') || s === '') return null;
  const parts = s.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    const dt = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
    if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
  }
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
// Route handler
// ---------------------------------------------------------------------------

export async function POST() {
  const logs: string[] = [];
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const filePath = path.join(process.cwd(), 'scripts/data/TI_TE_Portal_KSA.xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets['KSA (2)'];

    if (!sheet) {
      return Response.json({ ok: false, error: 'Sheet "KSA (2)" not found in workbook' }, { status: 500 });
    }

    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      dateNF: 'yyyy-mm-dd',
    });

    // Rows 0–1 are title/headers
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];

      const rawNo = row[0];
      if (
        rawNo === null || rawNo === undefined ||
        String(rawNo).trim() === '' ||
        String(rawNo).trim().toLowerCase() === 'nan'
      ) {
        logs.push(`SKIP Row ${i}: no reference number`);
        skipped++;
        continue;
      }

      const numericNo = parseFloat(String(rawNo).trim());
      if (isNaN(numericNo)) {
        logs.push(`SKIP Row ${i}: no reference number`);
        skipped++;
        continue;
      }

      const reference_number = 'KSA-' + String(Math.round(numericNo)).padStart(3, '0');

      try {
        const segment       = row[1]  ? String(row[1]).trim()  || null : null;
        const from_country  = row[2]  ? String(row[2]).trim()  || null : null;
        const to_country    = row[3]  ? String(row[3]).trim()  || null : null;
        const invoice_number = row[4] ? String(row[4]).trim()  || null : null;

        let invoice_value: number | null = null;
        if (row[5] != null) {
          const s = String(row[5]).trim();
          if (!s.startsWith('=')) { const p = parseFloat(s); if (!isNaN(p)) invoice_value = p; }
        }

        let bayan_number: string | null = null;
        if (row[6] != null) {
          const s = String(row[6]).trim();
          if (!s.startsWith('=') && s !== '') bayan_number = s;
        }

        const description = row[7] ? String(row[7]).trim() || null : null;

        let mot: string | null = null;
        if (row[8] != null) {
          let s = String(row[8]).trim();
          if (s === 'Lnad') s = 'Land';
          mot = s || null;
        }

        const awb_number = row[9] ? String(row[9]).trim() || null : null;
        const import_date = parseDate(row[10]);

        let deposit_sar: number | null = null;
        if (row[11] != null) {
          const s = String(row[11]).trim();
          if (!s.startsWith('=')) { const p = parseFloat(s); if (!isNaN(p)) deposit_sar = p; }
        }
        const deposit_local = deposit_sar;
        const deposit_usd   = deposit_sar !== null ? deposit_sar / 3.75 : null;

        const po_number = row[13] != null ? String(row[13]).trim() || null : null;

        let movement_type: string | null = null;
        if (row[14] != null) {
          const s = String(row[14]).trim();
          if (s === 'Import' || s === 'Import  ') movement_type = 'Import';
          else if (s === 'Export' || s === 'Export  ') movement_type = 'Export';
          else movement_type = s || null;
        }

        let expiry_date: string | null = null;
        if (row[15] != null) {
          const s = String(row[15]).trim();
          if (!s.startsWith('=')) expiry_date = parseDate(s);
        }

        let extended_date: string | null = null;
        if (row[16] != null) {
          const s = String(row[16]).trim();
          if (!s.startsWith('=') && s !== '') extended_date = parseDate(s);
        }

        const comments = row[17] ? String(row[17]).trim() || null : null;

        let status = 'Active';
        if (row[18] != null && String(row[18]).toLowerCase().includes('closed')) status = 'Closed';

        const alert_level = calcAlertLevel(expiry_date, extended_date, status);

        const result = await titePool.query(
          `INSERT INTO shipments (
            reference_number, segment, from_country, to_country,
            invoice_number, invoice_value, bayan_number, description,
            mot, awb_number, po_number, movement_type,
            import_date, expiry_date, extended_date,
            deposit_sar, deposit_local, deposit_usd,
            comments, status, alert_level, created_by
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
          )
          ON CONFLICT (reference_number) DO NOTHING`,
          [
            reference_number, segment, from_country, to_country,
            invoice_number, invoice_value, bayan_number, description,
            mot, awb_number, po_number, movement_type,
            import_date, expiry_date, extended_date,
            deposit_sar, deposit_local, deposit_usd,
            comments, status, alert_level, 'migration-ksa',
          ]
        );

        if (result.rowCount === 0) {
          logs.push(`SKIP ${reference_number}: already exists`);
          skipped++;
        } else {
          logs.push(`OK   ${reference_number} | ${segment ?? ''} | ${movement_type ?? ''} | Expiry: ${expiry_date ?? 'N/A'}`);
          inserted++;
        }
      } catch (err: any) {
        logs.push(`ERR  Row ${i} (${reference_number}): ${err?.message || String(err)}`);
        errors++;
      }
    }

    return Response.json({ ok: true, inserted, skipped, errors, logs });
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
