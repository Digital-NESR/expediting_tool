import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileText } from 'lucide-react';
import { canUseCountry, listCountries } from '@/lib/safesign/access';
import { safesignApproverPage } from '@/lib/safesign/page';
import { approvalInfo, approvalsFor, approverCanView } from '@/lib/safesign/approvals';
import { getCommunication } from '@/lib/safesign/read';
import { recipientsFor } from '@/lib/safesign/suppliers';
import {
  ATTACHMENT_LABEL,
  RESPONSE_TYPE_LABEL,
  formatBytes,
  formatDay,
} from '@/lib/safesign/model';
import SafeSignShell from '../../../components/SafeSignShell';
import ApprovalTrack from '../../../components/ApprovalTrack';
import { CARD } from '../../../components/ui';
import ApprovalDecision from './ApprovalDecision';

/**
 * What an approver reviews: everything the suppliers would receive and who it would go to, the
 * chain so far, and (when it is their turn) Approve or Reject with a comment.
 */
export default async function ApprovalReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, shell } = await safesignApproverPage();
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();
  const comm = await getCommunication(id);
  if (!comm) notFound();
  if (!canUseCountry(actor, comm.countryId) && !(await approverCanView(actor, id))) notFound();

  const [info, mine, recipients, countries] = await Promise.all([
    approvalInfo(id),
    approvalsFor(actor).then((list) => list.find((a) => a.id === id)?.mine ?? false),
    recipientsFor(comm.requests.map((r) => r.vendorId)),
    listCountries(),
  ]);
  if (!info) notFound();
  const countryName = countries.find((c) => c.id === comm.countryId)?.name ?? comm.countryId;

  return (
    <SafeSignShell
      user={shell}
      title={comm.title}
      subtitle={`${countryName} · ${comm.topicName} · ${RESPONSE_TYPE_LABEL[comm.responseType]} · due ${formatDay(comm.deadline)}`}
    >
      <Link href="/safesign/approvals" className="inline-flex items-center gap-1 text-sm font-semibold text-[#307c4c] hover:underline">
        <ArrowLeft className="h-4 w-4" /> All approvals
      </Link>

      <ApprovalTrack info={info} createdBy={comm.createdBy} />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={`${CARD} p-5 lg:col-span-2`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">What the suppliers will receive</p>
          <h2 className="mt-2 text-base font-semibold text-slate-900">{comm.title}</h2>
          {comm.message ? (
            <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{comm.message}</p>
          ) : (
            <p className="mt-2 text-sm italic text-slate-400">No message.</p>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Fact label="Response" value={RESPONSE_TYPE_LABEL[comm.responseType]} />
            <Fact label="Supplier files" value={ATTACHMENT_LABEL[comm.attachments]} />
            <Fact label="Deadline" value={formatDay(comm.deadline)} />
            <Fact label="Created by" value={comm.createdBy} />
          </dl>
          {comm.documents.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {comm.documents.map((d) => (
                <li key={d.id}>
                  <a
                    href={`/api/safesign/files/document/${d.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:border-[#307c4c]/40 hover:text-[#307c4c]"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {d.filename}
                    <span className="text-slate-400">{formatBytes(d.sizeBytes)}</span>
                    {d.isLetter && <span className="rounded bg-[#307c4c]/10 px-1 text-[10px] font-semibold text-[#1d4f31]">to sign</span>}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${CARD} flex flex-col p-5`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Your decision</p>
          {mine ? (
            <ApprovalDecision id={id} />
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              {info.state === 'approved'
                ? 'Fully approved. The sender can now send it.'
                : info.state === 'rejected'
                  ? 'Rejected. The sender has been told why.'
                  : info.state === 'not_submitted'
                    ? 'Not submitted for approval.'
                    : 'This is not waiting for your approval right now.'}
            </p>
          )}
        </section>
      </div>

      <section className={`${CARD} overflow-hidden`}>
        <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
          Suppliers ({comm.requests.length})
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Supplier</th>
                <th className="px-4 py-2.5">To</th>
                <th className="px-4 py-2.5">CC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {comm.requests.map((r) => {
                const rec = recipients.get(r.vendorId);
                const to = r.sentAt ? r.sentTo : rec?.to ?? [];
                const cc = r.sentAt ? r.sentCc : [...new Set([...(rec?.cc ?? []), comm.createdBy.toLowerCase()])];
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{r.vendorName}</p>
                      <p className="text-xs text-slate-500">{r.category}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">{to.join(', ') || <span className="text-rose-600">No address</span>}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{cc.join(', ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </SafeSignShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-400">{label}</dt>
      <dd className="truncate font-semibold text-slate-700" title={value}>{value}</dd>
    </div>
  );
}
