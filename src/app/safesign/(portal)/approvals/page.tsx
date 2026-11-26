import Link from 'next/link';
import { safesignApproverPage } from '@/lib/safesign/page';
import { listCountries } from '@/lib/safesign/access';
import { approvalsFor, APPROVAL_LABEL, type ApprovalState } from '@/lib/safesign/approvals';
import { RESPONSE_TYPE_LABEL, formatDay, formatStamp } from '@/lib/safesign/model';
import SafeSignShell from '../../components/SafeSignShell';
import { CARD } from '../../components/ui';

const TONE: Record<ApprovalState, string> = {
  not_submitted: 'bg-slate-100 text-slate-600',
  pending_scm: 'bg-amber-50 text-amber-700',
  pending_final: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-700',
};

export default async function ApprovalsPage() {
  const { actor, shell } = await safesignApproverPage();
  const [items, countries] = await Promise.all([shell.approver ? approvalsFor(actor) : [], listCountries()]);
  const scmNames = actor.approver.scm.map((id) => countries.find((c) => c.id === id)?.name ?? id);
  const waiting = items.filter((i) => i.mine);
  const others = items.filter((i) => !i.mine);
  const role = [
    actor.approver.scm.length ? `supply chain manager for ${scmNames.join(', ')}` : '',
    actor.approver.final ? 'final approver for every country' : '',
  ]
    .filter(Boolean)
    .join(' and ');

  return (
    <SafeSignShell
      user={shell}
      title="Approvals"
      subtitle={shell.approver ? `You approve as ${role}.` : 'You are not an approver.'}
    >
      <Table title={`Waiting for you (${waiting.length})`} rows={waiting} empty="Nothing is waiting for your approval." />
      {others.length > 0 && <Table title="Other approvals" rows={others} empty="" />}
    </SafeSignShell>
  );
}

function Table({ title, rows, empty }: { title: string; rows: Awaited<ReturnType<typeof approvalsFor>>; empty: string }) {
  return (
    <section className={`${CARD} overflow-hidden`}>
      <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Communication</th>
              <th className="px-4 py-2.5">Country</th>
              <th className="px-4 py-2.5">Sender</th>
              <th className="px-4 py-2.5">Suppliers</th>
              <th className="px-4 py-2.5">Deadline</th>
              <th className="px-4 py-2.5">Submitted</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <Link href={`/safesign/approvals/${r.id}`} className="font-semibold text-slate-800 hover:text-[#307c4c] hover:underline">
                    {r.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {r.topicName} · {RESPONSE_TYPE_LABEL[r.responseType]}
                  </p>
                </td>
                <td className="px-4 py-3 text-slate-700">{r.countryName}</td>
                <td className="px-4 py-3 text-slate-700">{r.createdBy}</td>
                <td className="px-4 py-3 text-slate-700">{r.suppliers}</td>
                <td className="px-4 py-3 text-slate-700">{formatDay(r.deadline)}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{r.submittedAt ? formatStamp(r.submittedAt) : '-'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[r.state]}`}>{APPROVAL_LABEL[r.state]}</span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">{empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
