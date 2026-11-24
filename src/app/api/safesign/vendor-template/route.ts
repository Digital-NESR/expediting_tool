import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { attachmentContentDisposition } from '@/lib/contentDisposition';
import { canManage, currentSafeSignActor } from '@/lib/safesign/access';

export const dynamic = 'force-dynamic';

/** The Excel template for uploading suppliers to the SafeSign vendor library. */
export async function GET() {
  const actor = await currentSafeSignActor();
  if (!actor) return new NextResponse('Unauthorized', { status: 401 });
  if (!canManage(actor)) return new NextResponse('Not found', { status: 404 });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SafeSign';
  const ws = wb.addWorksheet('Suppliers');
  ws.columns = [
    { header: 'Supplier', key: 'supplier', width: 30 },
    { header: 'Category of work', key: 'category', width: 22 },
    { header: 'TO emails', key: 'to', width: 45 },
    { header: 'CC emails', key: 'cc', width: 55 },
  ];
  ws.addRow({
    supplier: 'Example Supplier Co',
    category: 'Logistics',
    to: 'Operations Manager ops@example.com',
    cc: 'HSE hse@example.com; Second Contact second@example.com',
  });

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF307C4C' } };
  ws.getRow(2).font = { italic: true, color: { argb: 'FF7A8A82' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const help = wb.addWorksheet('How to fill');
  help.getColumn(1).width = 100;
  for (const line of [
    'One row per supplier. Replace the grey example row on the Suppliers sheet.',
    'Supplier: the company name. A supplier already in the library is updated, not duplicated.',
    'Category of work: how suppliers are grouped, e.g. Logistics, Shipping, Manpower.',
    'TO emails: who must respond. At least one is required.',
    'CC emails: who is copied. Optional.',
    'Several emails in one cell: separate them with ; or , (a name in front of each email is kept as the contact name).',
    'Only the first sheet (Suppliers) is read.',
  ]) {
    help.addRow([line]);
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': attachmentContentDisposition('SafeSign supplier template.xlsx'),
      'Cache-Control': 'private, no-cache',
    },
  });
}
