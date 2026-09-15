/* Roll-up of a PO's line items: which delivery status dominates, and which DS code does.
   Both are pure and both drive what a buyer sees on the collapsed PO row. */

import type { PurchaseOrder } from '@/types/po';
import { daysDiff } from './format';

export interface StatusSummary {
  majority: 'PAST DUE' | 'DUE SOON' | 'ON TRACK';
  breakdown: { pastDue: number; dueSoon: number; onTrack: number };
}

export function getPOStatusSummary(lines: PurchaseOrder[]): StatusSummary {
  let pastDue = 0,
    dueSoon = 0,
    onTrack = 0;
  for (const line of lines) {
    const diff = daysDiff(line['Delivery Date']);
    if (diff < 0) pastDue++;
    else if (diff <= 7) dueSoon++;
    else onTrack++;
  }
  const majority =
    pastDue >= dueSoon && pastDue >= onTrack
      ? 'PAST DUE'
      : dueSoon >= onTrack
        ? 'DUE SOON'
        : 'ON TRACK';
  return { majority, breakdown: { pastDue, dueSoon, onTrack } };
}

export function getPOMajorityDSCode(lines: PurchaseOrder[]): string | null {
  const counts: Record<string, number> = {};
  for (const line of lines) {
    const code = line['Delivery Code'];
    if (code) counts[code] = (counts[code] || 0) + 1;
  }
  if (Object.keys(counts).length === 0) return null;
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}
