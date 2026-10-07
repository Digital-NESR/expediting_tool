import type { Draft } from './types';

/** A field value as the audit trail should print it. */
function auditValue(v: string): string {
  const t = v.trim();
  return t ? t : '(blank)';
}

/**
 * What changed between two versions of a record, in the words the audit trail
 * should use.
 *
 * Before and after are both recorded, in full. "Record edited" on its own tells
 * a future auditor nothing, and the previous justification is the text the
 * approver actually read when they rejected it — once the row is overwritten it
 * exists nowhere else.
 *
 * Lives outside the server action so it can be tested directly: a `'use server'`
 * module may only export async functions, and this is the part of an edit that
 * has to be right.
 */
export function diffDraft(before: Draft, after: Draft): string[] {
  const out: string[] = [];
  const scalar = (label: string, a: string, b: string) => {
    if (a.trim() !== b.trim()) out.push(`${label}: ${auditValue(a)} → ${auditValue(b)}`);
  };

  scalar('Classification', before.cls, after.cls);
  scalar('Country', before.country, after.country);
  scalar('Scope level', before.level, after.level);
  scalar('Supplier SAP ID', before.supplierId, after.supplierId);
  scalar('Supplier name', before.supplierName, after.supplierName);
  scalar('Reason code', before.reason, after.reason);
  scalar('Written reason', before.reasonOther, after.reasonOther);
  scalar('Expiry date', before.expiry, after.expiry);
  scalar('Annual spend', before.spend, after.spend);
  scalar('Justification', before.justification, after.justification);

  // Order is meaningful for nodes — it is the stored sort order — but not for
  // segments, so only the latter is sorted before comparing.
  const nodeList = (d: Draft) => d.nodes.map((n) => n.com || n.fam).join(', ');
  scalar('Taxonomy scope', nodeList(before), nodeList(after));
  const segList = (d: Draft) => [...d.segments].sort().join(', ');
  scalar('Segments', segList(before), segList(after));

  return out;
}
