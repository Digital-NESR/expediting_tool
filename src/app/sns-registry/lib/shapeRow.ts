import { clsLabel, clsStyle, displayStatus, leafOf, money, statusStyle } from './helpers';
import { daysFromToday, formatDate } from './date';
import type { DisplayStatus, RegistryRecord } from './types';

export interface ShapedRow {
  rid: number;
  idLabel: string;
  clsLabel: string;
  clsBg: string;
  clsFg: string;
  country: string;
  supplierName: string;
  supplierId: string;
  scopeLabel: string;
  scopeDetail: string;
  spendLabel: string;
  status: DisplayStatus;
  statusBg: string;
  statusFg: string;
  accent: string;
  expiryLabel: string;
  expiryNote: string;
  expiryNoteColor: string;
  justificationShort: string;
  reason: string;
  segments: string[];
  spend: number;
  evidence: string;
  requestor: string;
}

export function shapeRow(r: RegistryRecord): ShapedRow {
  const status = displayStatus(r);
  const ss = statusStyle(status);
  const cs = clsStyle(r.cls);
  const d = r.expiry ? daysFromToday(r.expiry) : null;
  let note = 'Not issued yet';
  let noteColor = '#58595B';
  if (d !== null) {
    if (d < 0) {
      note = Math.abs(d) + ' days overdue';
      noteColor = '#9B1C1C';
    } else if (d <= 60) {
      note = d + ' days remaining';
      noteColor = '#8A4B00';
    } else {
      note = d + ' days remaining';
      noteColor = '#58595B';
    }
  }
  const leaves = r.nodes.map(leafOf);
  return {
    rid: r.rid,
    idLabel: r.id || '— not issued —',
    clsLabel: clsLabel(r.cls),
    clsBg: cs[0],
    clsFg: cs[1],
    country: r.country,
    supplierName: r.supplierName,
    supplierId: r.supplierId,
    scopeLabel: r.level + (leaves.length > 1 ? ' group (' + leaves.length + ')' : ''),
    scopeDetail: leaves.slice(0, 2).join(', ') + (leaves.length > 2 ? ' +' + (leaves.length - 2) : ''),
    spendLabel: money(r.spend),
    status,
    statusBg: ss[0],
    statusFg: ss[1],
    accent: ss[2],
    expiryLabel: r.expiry ? formatDate(r.expiry) : '—',
    expiryNote: note,
    expiryNoteColor: noteColor,
    justificationShort: r.justification,
    reason: r.reason,
    segments: r.segments,
    spend: r.spend,
    evidence: r.evidence,
    requestor: r.requestor,
  };
}
