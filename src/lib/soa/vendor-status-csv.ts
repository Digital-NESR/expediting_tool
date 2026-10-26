/**
 * The vendor-status CSV: who was chased, when, whether they answered, and how much of the
 * country each of them is.
 *
 * A pure function rather than a block inside the download handler, because this file leaves
 * the building. A champion sends it to Finance and an auditor reads it, so what is in it and
 * how it is quoted is worth asserting rather than hoping. It was unreachable from a test
 * while it lived inside a click handler between a `Blob` and an `<a download>`.
 *
 * It deliberately says nothing about what anyone owes -- that is the consolidated workbook's
 * job. This is a progress report.
 */

import { csvSafe } from '@/lib/catalog-manager-utils';
import { formatPct } from './spend-share';

export interface VendorStatusRow {
  vendorNo: string;
  vendorName: string;
  amount: number;
  /** Share of the country's WHOLE balance; null when there is no denominator. */
  sharePct: number | null;
  currency: string;
  status: string;
  requestedAt: string | null;
  remindedAt: string | null;
  respondedAt: string | null;
  invoiceCount: number;
}

/**
 * The columns, in order.
 *
 * `% Spend` sits beside the amount because it is the same fact read a second way: how much
 * of the country this one supplier is, which is what decides whether chasing them is worth
 * anyone's morning. It is written with `formatPct`, the same formatter Response Tracking and
 * Consolidation use, so a supplier reads the same on the page and in the file.
 */
export const VENDOR_STATUS_COLUMNS = [
  'Vendor No.',
  'Vendor Name',
  'Amount (USD)',
  '% Spend',
  'Currency',
  'Status',
  'Requested',
  'Reminded',
  'Responded',
  'Invoices',
] as const;

/** Every cell is quoted and its quotes doubled, so a vendor name with a comma survives. */
const cell = (value: unknown): string => `"${csvSafe(value ?? '').replace(/"/g, '""')}"`;

export function vendorStatusCsv(rows: VendorStatusRow[]): string {
  return [
    VENDOR_STATUS_COLUMNS.join(','),
    ...rows.map((r) =>
      [
        r.vendorNo,
        r.vendorName,
        r.amount,
        formatPct(r.sharePct),
        r.currency,
        r.status,
        r.requestedAt ?? '',
        r.remindedAt ?? '',
        r.respondedAt ?? '',
        r.invoiceCount,
      ]
        .map(cell)
        .join(','),
    ),
  ].join('\n');
}
