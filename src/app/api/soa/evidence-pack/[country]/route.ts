import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import type { QueryResultRow } from 'pg';
import { attachmentContentDisposition } from '@/lib/contentDisposition';
import { canAccessCountry, getSoaActor } from '@/lib/soa/access';
import { complianceCriteria, reminderGapDays, reminderInWindow } from '@/lib/soa/compliance';
import { ensureSoaSchema, soaPool } from '@/lib/soa/db';

/**
 * The evidence pack: one workbook that answers an audit of a country's quarter.
 *
 * The consolidation export already produced a vendor list, which is what Finance needs to post the
 * numbers. It is not what an auditor needs. The question there is not "what were the balances" but
 * "prove you did what the SOP says" — that every in-scope vendor was written to, that a reminder
 * followed inside the 10-14 day window, that non-responders were documented rather than quietly
 * dropped, and that the coverage figure was measured against the target in force at the time.
 *
 * So the pack leads with the policy the quarter was judged against, then the four control criteria
 * and their verdicts, then the per-vendor evidence, then the append-only trail. Four sheets rather
 * than four downloads, because a pack that arrives in pieces gets reassembled wrongly.
 *
 * The criteria come from `@/lib/soa/compliance`, the same module the Consolidation screen reads.
 * If the pack computed its own, the two would eventually disagree, and the disagreement would be
 * discovered by the auditor rather than by us.
 */

const asIso = (v: unknown): string => (v instanceof Date ? v.toISOString() : v ? String(v) : '');
const asDate = (v: unknown): string => asIso(v).slice(0, 10);

function headerRow(sheet: ExcelJS.Worksheet, labels: string[]) {
  const row = sheet.addRow(labels);
  row.font = { bold: true };
  return row;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ country: string }> }) {
  const actor = await getSoaActor();
  if (!actor) return new NextResponse('Unauthorized', { status: 401 });

  const { country } = await params;
  const countryId = decodeURIComponent(country);

  /* A viewer of the country is enough. The pack contains nothing a viewer cannot already read on
     the screens; withholding it from the people asked to answer for the quarter would only mean
     the pack gets rebuilt by hand in a spreadsheet, which is how evidence stops matching. */
  if (!canAccessCountry(actor, countryId, 'viewer')) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    await ensureSoaSchema();

    const cycleRows = await soaPool.query<QueryResultRow>(
      `SELECT * FROM cycles WHERE is_active LIMIT 1`,
    );
    if (!cycleRows.rows.length) {
      return new NextResponse('No active cycle', { status: 409 });
    }
    const cycle = cycleRows.rows[0];
    const cycleId = Number(cycle.id);

    const ccRows = await soaPool.query<QueryResultRow>(
      `SELECT cc.id, cc.status::text AS status, cc.handed_off_at, c.name
         FROM country_cycles cc JOIN countries c ON c.id = cc.country_id
        WHERE cc.cycle_id = $1 AND cc.country_id = $2`,
      [cycleId, countryId],
    );
    if (!ccRows.rows.length) {
      return new NextResponse('This country has not been scoped for the active cycle', {
        status: 409,
      });
    }
    const countryCycleId = Number(ccRows.rows[0].id);
    const countryName = String(ccRows.rows[0].name);

    const [vendorRes, evidenceRes, submissionRes, denomRes] = await Promise.all([
      soaPool.query<QueryResultRow>(
        `SELECT v.vendor_no, v.name, v.contact_emails, vce.open_po_amount, vce.currency,
                vce.status::text AS status, vce.requested_at, vce.reminded_at, vce.responded_at,
                vce.invoice_count
           FROM vendor_cycle_entries vce JOIN vendors v ON v.id = vce.vendor_id
          WHERE vce.country_cycle_id = $1
          ORDER BY vce.open_po_amount DESC`,
        [countryCycleId],
      ),
      soaPool.query<QueryResultRow>(
        `SELECT occurred_at, type::text AS type, action, actor, detail
           FROM evidence_log WHERE country_cycle_id = $1 ORDER BY occurred_at`,
        [countryCycleId],
      ),
      soaPool.query<QueryResultRow>(
        `SELECT v.vendor_no, v.name AS vendor_name, s.file_name, s.uploaded_at, s.uploaded_by,
                s.accepted_at, s.accepted_by, s.detected_invoice_count, LENGTH(s.content) AS bytes
           FROM soa_submissions s
           JOIN vendor_cycle_entries vce ON vce.id = s.vendor_cycle_entry_id
           JOIN vendors v ON v.id = vce.vendor_id
          WHERE vce.country_cycle_id = $1
          ORDER BY s.uploaded_at`,
        [countryCycleId],
      ),
      soaPool.query<QueryResultRow>(
        `SELECT COALESCE(SUM(e.pos_value), 0) AS total
           FROM supplier_po_extract e JOIN countries c ON e.po_country = ANY (c.spend_names)
          WHERE e.cycle_id = $1 AND c.id = $2`,
        [cycleId, countryId],
      ),
    ]);

    const vendors = vendorRes.rows;
    const totalBalance = Number(denomRes.rows[0]?.total ?? 0);
    const receivedBalance = vendors
      .filter((v) => String(v.status) === 'received')
      .reduce((sum, v) => sum + Number(v.open_po_amount), 0);
    const coveragePct = totalBalance > 0 ? Math.round((receivedBalance / totalBalance) * 100) : 0;
    const targetPct = Number(cycle.coverage_target_pct);

    const criteria = complianceCriteria(
      vendors.map((v) => ({
        status: String(v.status),
        reqDate: v.requested_at ? asDate(v.requested_at) : '—',
        remDate: v.reminded_at ? asDate(v.reminded_at) : null,
        requestedAt: v.requested_at ? asIso(v.requested_at) : null,
        remindedAt: v.reminded_at ? asIso(v.reminded_at) : null,
      })),
      coveragePct,
      coveragePct >= targetPct,
      targetPct,
      Number(cycle.year_end_target_pct),
    );

    const wb = new ExcelJS.Workbook();
    wb.creator = 'NESR SOA Consolidation';
    wb.created = new Date();

    /* ── 1. Summary: the policy, the outcome, and the verdicts ───────────── */
    const summary = wb.addWorksheet('Summary');
    summary.columns = [{ width: 34 }, { width: 62 }];
    summary.addRow(['SOA Consolidation — evidence pack']).font = { bold: true, size: 14 };
    summary.addRow([]);
    for (const [k, v] of [
      ['Country', `${countryName} (${countryId})`],
      ['Cycle', String(cycle.label)],
      ['Period', `${asDate(cycle.period_start)} to ${asDate(cycle.period_end)}`],
      ['Submission deadline', asDate(cycle.submission_deadline)],
      ['Status', String(ccRows.rows[0].status)],
      ['Handed off', ccRows.rows[0].handed_off_at ? asIso(ccRows.rows[0].handed_off_at) : 'No'],
      ['Pack generated', new Date().toISOString()],
      ['Generated by', actor.email],
    ] as [string, string][]) {
      summary.addRow([k, v]);
    }

    summary.addRow([]);
    summary.addRow(['Policy in force for this cycle']).font = { bold: true };
    for (const [k, v] of [
      ['Coverage target (quarterly)', `${targetPct}%`],
      ['Coverage target (year end)', `${Number(cycle.year_end_target_pct)}%`],
      ['Vendor threshold', `$${Number(cycle.vendor_threshold_usd).toLocaleString('en-US')}`],
      ['Receipted-spend lookback', `${Number(cycle.lookback_months)} months`],
      [
        'Spend window read',
        cycle.extract_from ? `${asDate(cycle.extract_from)} to ${asDate(cycle.extract_to)}` : 'n/a',
      ],
      ['Spend snapshot taken', cycle.extracted_at ? asIso(cycle.extracted_at) : 'n/a'],
    ] as [string, string][]) {
      summary.addRow([k, v]);
    }

    summary.addRow([]);
    summary.addRow(['Outcome']).font = { bold: true };
    summary.addRow(['Country receipted balance', totalBalance]);
    summary.addRow(['Balance confirmed by received SOAs', receivedBalance]);
    summary.addRow(['Coverage', `${coveragePct}%`]);
    summary.addRow(['Vendors in scope', vendors.length]);
    summary.addRow([
      'Statements received',
      vendors.filter((v) => String(v.status) === 'received').length,
    ]);
    summary.getColumn(2).numFmt = '#,##0';

    summary.addRow([]);
    summary.addRow([`Control criteria — SOP NESR-SC-01-GR2PAY`]).font = { bold: true };
    headerRow(summary, ['Criterion', 'Verdict']);
    for (const c of criteria) {
      summary.addRow([c.label, c.state.toUpperCase()]);
      summary.addRow(['', c.detail]);
    }
    summary.addRow([]);
    summary.addRow([
      'Overall',
      criteria.every((c) => c.state === 'pass')
        ? 'All criteria met'
        : criteria.some((c) => c.state === 'fail')
          ? 'One or more criteria failed'
          : 'Some criteria could not be verified',
    ]).font = { bold: true };

    /* ── 2. Vendors: the per-vendor evidence ─────────────────────────────── */
    const vs = wb.addWorksheet('Vendors');
    headerRow(vs, [
      'Vendor no',
      'Vendor',
      'Amount confirmed (USD)',
      'Currency',
      'Status',
      'Request sent',
      'Reminder sent',
      'Response received',
      'Reminder gap (days)',
      'Inside 10-14 day window',
      'Invoices on statement',
      'Contact addresses used',
    ]);
    for (const v of vendors) {
      const shaped = {
        status: String(v.status),
        reqDate: v.requested_at ? asDate(v.requested_at) : '—',
        remDate: v.reminded_at ? asDate(v.reminded_at) : null,
        requestedAt: v.requested_at ? asIso(v.requested_at) : null,
        remindedAt: v.reminded_at ? asIso(v.reminded_at) : null,
      };
      const gap = reminderGapDays(shaped);
      const inWindow = reminderInWindow(shaped);
      vs.addRow([
        String(v.vendor_no),
        String(v.name),
        Number(v.open_po_amount),
        String(v.currency),
        String(v.status),
        v.requested_at ? asIso(v.requested_at) : 'Not sent',
        v.reminded_at ? asIso(v.reminded_at) : 'Not sent',
        v.responded_at ? asIso(v.responded_at) : 'No response',
        gap ?? '',
        inWindow === null ? 'n/a' : inWindow ? 'Yes' : 'No',
        Number(v.invoice_count),
        ((v.contact_emails ?? []) as string[]).join(', ') || 'None on file',
      ]);
    }
    vs.getColumn(3).numFmt = '#,##0.00';
    vs.columns.forEach((c, i) => {
      c.width = i === 1 ? 40 : i === 11 ? 40 : 20;
    });

    /* ── 3. The append-only trail ────────────────────────────────────────── */
    const ev = wb.addWorksheet('Evidence log');
    headerRow(ev, ['When', 'Type', 'Action', 'Actor', 'Detail']);
    for (const e of evidenceRes.rows) {
      ev.addRow([
        asIso(e.occurred_at),
        String(e.type),
        String(e.action),
        String(e.actor),
        String(e.detail),
      ]);
    }
    ev.columns.forEach((c, i) => {
      c.width = i === 4 ? 90 : 24;
    });

    /* ── 4. The statements themselves ────────────────────────────────────── */
    const st = wb.addWorksheet('Statements received');
    headerRow(st, [
      'Vendor no',
      'Vendor',
      'File',
      'Size (bytes)',
      'Uploaded',
      'Uploaded by',
      'Accepted',
      'Accepted by',
      'Invoices detected',
    ]);
    for (const s of submissionRes.rows) {
      st.addRow([
        String(s.vendor_no),
        String(s.vendor_name),
        String(s.file_name),
        Number(s.bytes ?? 0),
        asIso(s.uploaded_at),
        s.uploaded_by ? String(s.uploaded_by) : '',
        s.accepted_at ? asIso(s.accepted_at) : 'Not accepted',
        s.accepted_by ? String(s.accepted_by) : '',
        s.detected_invoice_count == null ? '' : Number(s.detected_invoice_count),
      ]);
    }
    st.columns.forEach((c, i) => {
      c.width = i === 1 ? 40 : 22;
    });
    if (!submissionRes.rows.length) {
      /* Said out loud rather than left as an empty sheet: "no statements" and "the sheet failed to
         populate" look identical otherwise, and only one of them is an audit finding. */
      st.addRow(['No statements have been received for this country in this cycle.']);
    }

    const buffer = await wb.xlsx.writeBuffer();
    const fileName = `SOA-${countryId}-${String(cycle.label).replace(/\s+/g, '-')}-evidence-pack.xlsx`;

    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentContentDisposition(fileName),
        'Content-Length': String((buffer as ArrayBuffer).byteLength),
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (err) {
    console.error('[SOA] evidence pack error:', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
