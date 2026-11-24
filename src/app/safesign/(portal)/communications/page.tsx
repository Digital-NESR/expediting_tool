import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { currentSafeSignActor } from '@/lib/safesign/access';
import { listCommunications } from '@/lib/safesign/read';
import { formatDay, RESPONSE_TYPE_LABEL } from '@/lib/safesign/model';
import SafeSignShell, { BANNER_BUTTON, CARD, Empty } from '../../components/SafeSignShell';

const STATE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-slate-800 text-white',
};

export default async function CommunicationsPage() {
  const actor = await currentSafeSignActor();
  if (!actor?.role) redirect('/login');
  const comms = await listCommunications();

  return (
    <SafeSignShell
      user={{ name: actor.name, email: actor.email, role: actor.role }}
      title="Communications"
      subtitle="Every letter, policy and request sent to suppliers."
      actions={
        <Link href="/safesign/communications/new" className={BANNER_BUTTON}>
          <Plus className="h-4 w-4" /> New communication
        </Link>
      }
    >
      {comms.length === 0 ? (
        <Empty
          title="No communications yet"
          body="Create one to send a document to a group of suppliers and track their responses."
          action={
            <Link href="/safesign/communications/new" className="text-sm font-semibold text-[#307c4c] hover:underline">
              New communication →
            </Link>
          }
        />
      ) : (
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
              {comms.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <Link href={`/safesign/communications/${c.id}`} className="font-medium text-slate-800 hover:text-[#307c4c]">
                      {c.title}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{c.topicName}</td>
                  <td className="px-3 py-3 text-slate-600">{RESPONSE_TYPE_LABEL[c.responseType]}</td>
                  <td className="px-3 py-3 text-slate-600">{formatDay(c.deadline)}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATE[c.status]}`}>{c.status}</span>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-700">
                    {c.done} / {c.total}
                  </td>
                  <td className={`px-3 py-3 text-right ${c.overdue ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>{c.overdue}</td>
                  <td className={`px-4 py-3 text-right ${c.toReview ? 'font-semibold text-sky-700' : 'text-slate-400'}`}>{c.toReview}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SafeSignShell>
  );
}
