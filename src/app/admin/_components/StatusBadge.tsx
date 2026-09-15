'use client';

/**
 * The access-request status pill shared by every tool's approvals panel.
 *
 * The status vocabulary is NOT the same across tools — PO Expediting and SourceGuide
 * still carry the legacy `'Denied'`, TI-TE / Catalog / S&S write `'Rejected'` and
 * `'Revoked'` (see `src/types/access.ts`). Rather than flatten that, the badge takes a
 * plain string: `Approved` renders green, `Pending` amber, and every other spelling
 * renders red with its own literal text, which is what all the copies already did.
 */
export default function StatusBadge({ status }: { status: string }) {
  if (status === 'Approved') return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#307c4c]/10 text-[#307c4c] border border-[#307c4c]/20 whitespace-nowrap">
      Approved
    </span>
  );
  if (status === 'Pending') return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">
      Pending
    </span>
  );
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 whitespace-nowrap">
      {status}
    </span>
  );
}
