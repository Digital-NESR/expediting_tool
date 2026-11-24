import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import type { QueryResultRow } from 'pg';
import { attachmentContentDisposition } from '@/lib/contentDisposition';
import { activeCountry, hasAccess, currentSafeSignActor } from '@/lib/safesign/access';
import { ensureSafeSignSchema, safesignPool } from '@/lib/safesign/db';
import { todayRiyadh } from '@/lib/safesign/delivery';
import {
  displayStatus,
  RESPONSE_TYPE_LABEL,
  STATUS_LABEL,
  type RequestStatus,
  type ResponseType,
} from '@/lib/safesign/model';
import { dateOnly } from '@/lib/safesign/supplier-access';

export const dynamic = 'force-dynamic';

/**
 * Status per supplier per document, as an Excel workbook. `?communication=<id>` or
 * `?topic=<id>` narrows it; with neither, every sent communication is included. Always only the
 * country being worked on.
 *
 * Two sheets: "Status" (one row per supplier per communication, with who responded and when),
 * and "By supplier" (completed out of sent for each supplier).
 */
export async function GET(req: NextRequest) {
  const actor = await currentSafeSignActor();
  if (!actor) return new NextResponse('Unauthorized', { status: 401 });
  if (!hasAccess(actor)) return new NextResponse('Not found', { status: 404 });
  await ensureSafeSignSchema();
  const country = await activeCountry(actor);

  const communication = Number(req.nextUrl.searchParams.get('communication')) || null;
  const topic = Number(req.nextUrl.searchParams.get('topic')) || null;

  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT t.name AS topic, c.id AS comm_id, c.title, c.response_type, c.deadline,
            v.name AS vendor, v.category, r.status, r.sent_at, r.sent_to, r.sent_cc,
            r.responded_name, r.responded_title, r.responded_email, r.responded_at,
            r.completed_at, r.reminder_count, r.response_comment,
            (SELECT string_agg(f.filename, '; ' ORDER BY f.id) FROM ss_response_files f
              WHERE f.request_id = r.id) AS files
       FROM ss_requests r
       JOIN ss_communications c ON c.id = r.communication_id
       JOIN ss_topics t ON t.id = c.topic_id
       JOIN ss_vendors v ON v.id = r.vendor_id
      WHERE c.status <> 'draft'
        AND ($1::bigint IS NULL OR c.id = $1)
        AND ($2::bigint IS NULL OR c.topic_id = $2)
        AND c.country_id = $3
      ORDER BY t.name, c.sent_at, v.category, v.name`,
    [communication, topic, country.id],
  );

  const today = todayRiyadh();
  const stamp = (v: unknown) =>
    v ? new Date(v as string).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh' }) : '';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SafeSign';
  const ws = wb.addWorksheet('Status');
  ws.columns = [
    { header: 'Topic', key: 'topic', width: 22 },
    { header: 'Communication', key: 'title', width: 40 },
    { header: 'Response type', key: 'type', width: 20 },
    { header: 'Deadline', key: 'deadline', width: 13 },
    { header: 'Supplier', key: 'vendor', width: 28 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Responded by', key: 'name', width: 24 },
    { header: 'Job title', key: 'jobTitle', width: 22 },
    { header: 'Responded from', key: 'email', width: 30 },
    { header: 'Responded at', key: 'at', width: 20 },
    { header: 'Completed at', key: 'completed', width: 20 },
    { header: 'Reminders sent', key: 'reminders', width: 15 },
    { header: 'Files', key: 'files', width: 40 },
    { header: 'Supplier comment', key: 'comment', width: 40 },
    { header: 'Sent to', key: 'sentTo', width: 40 },
  ];

  const bySupplier = new Map<string, { category: string; done: number; total: number; overdue: number }>();
  for (const r of rows) {
    const status = String(r.status) as RequestStatus;
    const deadline = dateOnly(r.deadline);
    const shown = displayStatus(status, deadline, today, r.sent_at !== null);
    ws.addRow({
      topic: r.topic,
      title: r.title,
      type: RESPONSE_TYPE_LABEL[String(r.response_type) as ResponseType],
      deadline,
      vendor: r.vendor,
      category: r.category,
      status: STATUS_LABEL[shown],
      name: r.responded_name ?? '',
      jobTitle: r.responded_title ?? '',
      email: r.responded_email ?? '',
      at: stamp(r.responded_at),
      completed: stamp(r.completed_at),
      reminders: Number(r.reminder_count ?? 0),
      files: r.files ?? '',
      comment: r.response_comment ?? '',
      sentTo: [...((r.sent_to as string[]) ?? []), ...((r.sent_cc as string[]) ?? []).map((e) => `cc: ${e}`)].join('; '),
    });
    if (r.sent_at) {
      const key = String(r.vendor);
      const s = bySupplier.get(key) ?? { category: String(r.category), done: 0, total: 0, overdue: 0 };
      s.total += 1;
      if (status === 'completed') s.done += 1;
      if (shown === 'overdue') s.overdue += 1;
      bySupplier.set(key, s);
    }
  }

  const ws2 = wb.addWorksheet('By supplier');
  ws2.columns = [
    { header: 'Supplier', key: 'vendor', width: 30 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Completed', key: 'done', width: 12 },
    { header: 'Sent', key: 'total', width: 10 },
    { header: 'Compliance %', key: 'pct', width: 14 },
    { header: 'Overdue', key: 'overdue', width: 10 },
  ];
  for (const [vendor, s] of [...bySupplier.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    ws2.addRow({ vendor, ...s, pct: s.total ? Math.round((s.done / s.total) * 100) : 0 });
  }

  for (const sheet of [ws, ws2]) {
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF307C4C' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': attachmentContentDisposition(`SafeSign status ${country.name} ${today}.xlsx`),
      'Cache-Control': 'private, no-cache',
    },
  });
}
