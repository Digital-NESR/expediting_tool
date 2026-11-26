import Link from 'next/link';
import { Plus } from 'lucide-react';
import { safesignPage } from '@/lib/safesign/page';
import { listCommunications } from '@/lib/safesign/read';
import { formatDay, RESPONSE_TYPE_LABEL } from '@/lib/safesign/model';
import { APPROVAL_LABEL, type ApprovalState } from '@/lib/safesign/approvals';
import SafeSignShell from '../../components/SafeSignShell';
import { BANNER_BUTTON, CARD } from '../../components/ui';

const STATE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-slate-800 text-white',
  pending_scm: 'bg-amber-50 text-amber-700',
  pending_final: 'bg-amber-50 text-amber-700',
  approved: 'bg-sky-50 text-sky-700',
  rejected: 'bg-rose-50 text-rose-700',
};

/** A draft shows where it is in approval; anything emailed shows sent or closed. */
function stateOf(c: { status: string; approval: string }): { key: string; label: string } {
  if (c.status !== 'draft' || c.approval === 'not_submitted') return { key: c.status, label: c.status };
  const label = c.approval === 'approved' ? 'Approved, not sent' : APPROVAL_LABEL[c.approval as ApprovalState];
  return { key: c.approval, label };
}

export default async function CommunicationsPage() {
  const { country, shell } = await safesignPage();
  const comms = await listCommunications(country.id);

  return (
    <SafeSignShell
      user={shell}
      title="Communications"
      subtitle={`Every letter, policy and request sent to suppliers in ${country.name}.`}
      actions={
        <Link href="/safesign/communications/new" className={BANNER_BUTTON}>
          <Plus className="h-4 w-4" /> New communication
        </Link>
      }
    >
      <div className={`${CARD} overflow-x-auto`}>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">Communication</th>
              <th className="px-3 py-3">Topic</th>
              <th className="px-3 py-3">Response</th>
              <th className="px-3 py-3">Deadline</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3 text-right">Complete</th>
              <th className="px-3 py-3 text-right">Overdue</th>
              <th className="px-4 py-3 text-right">To review</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {comms.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-500">
                  No communications in {country.name} yet.{' '}
                  <Link
                    href="/safesign/communications/new"
                    className="font-semibold text-[#307c4c] hover:underline"
                  >
                    Create one
                  </Link>{' '}
                  to send a document to a group of suppliers and track their responses.
                </td>
              </tr>
            )}
            {comms.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <Link
                    href={`/safesign/communications/${c.id}`}
                    className="font-medium text-slate-800 hover:text-[#307c4c]"
                  >
                    {c.title}
                  </Link>
                </td>
                <td className="px-3 py-3 text-slate-600">{c.topicName}</td>
                <td className="px-3 py-3 text-slate-600">{RESPONSE_TYPE_LABEL[c.responseType]}</td>
                <td className="px-3 py-3 text-slate-600">{formatDay(c.deadline)}</td>
                <td className="px-3 py-3">
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold first-letter:uppercase ${STATE[stateOf(c).key]}`}
                  >
                    {stateOf(c).label}
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-semibold text-slate-700">
                  {c.done} / {c.total}
                </td>
                <td
                  className={`px-3 py-3 text-right ${c.overdue ? 'font-semibold text-rose-600' : 'text-slate-400'}`}
                >
                  {c.overdue}
                </td>
                <td
                  className={`px-4 py-3 text-right ${c.toReview ? 'font-semibold text-sky-700' : 'text-slate-400'}`}
                >
                  {c.toReview}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SafeSignShell>
  );
}
