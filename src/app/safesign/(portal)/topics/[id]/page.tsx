import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Download } from 'lucide-react';
import { currentSafeSignActor, shellUser } from '@/lib/safesign/access';
import { topicMatrix } from '@/lib/safesign/read';
import { formatDay, formatStamp } from '@/lib/safesign/model';
import SafeSignShell, { BANNER_BUTTON_GHOST, CARD, Empty } from '../../../components/SafeSignShell';
import StatusPill from '../../../components/StatusPill';

/** One topic: suppliers down the side, the topic's communications across the top. */
export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await currentSafeSignActor();
  if (!actor?.role) redirect('/login');
  const { id } = await params;
  const matrix = await topicMatrix(Number(id));
  if (!matrix) notFound();

  const done = matrix.rows.reduce((s, r) => s + r.done, 0);
  const total = matrix.rows.reduce((s, r) => s + r.total, 0);

  return (
    <SafeSignShell
      user={shellUser(actor)}
      title={matrix.topic.name}
      subtitle={
        total
          ? `${done} of ${total} responses complete across ${matrix.columns.length} communication${matrix.columns.length === 1 ? '' : 's'}.`
          : matrix.topic.description || 'Nothing has been sent under this topic yet.'
      }
      actions={
        <a href={`/api/safesign/export?topic=${matrix.topic.id}`} className={BANNER_BUTTON_GHOST}>
          <Download className="h-4 w-4" /> Export to Excel
        </a>
      }
    >
      {matrix.columns.length === 0 ? (
        <Empty title="Nothing sent under this topic" body="Communications you send under this topic will appear here, with each supplier's status." />
      ) : (
        <div className={`${CARD} overflow-x-auto`}>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3">Supplier</th>
                <th className="px-3 py-3">Complete</th>
                {matrix.columns.map((c) => (
                  <th key={c.id} className="min-w-[160px] px-3 py-3 align-bottom">
                    <Link href={`/safesign/communications/${c.id}`} className="block font-semibold text-slate-700 hover:text-[#307c4c]">
                      {c.title}
                    </Link>
                    <span className="font-normal text-slate-400">
                      Due {formatDay(c.deadline)}
                      {c.status === 'closed' ? ' · closed' : ''}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {matrix.rows.map((r) => (
                <tr key={r.vendorId} className="hover:bg-slate-50/60">
                  <td className="sticky left-0 z-10 bg-white px-4 py-3">
                    <p className="font-medium text-slate-800">{r.vendorName}</p>
                    <p className="text-xs text-slate-400">{r.category}</p>
                  </td>
                  <td className="px-3 py-3 text-xs font-semibold text-slate-700">
                    {r.done} / {r.total}
                  </td>
                  {matrix.columns.map((c) => {
                    const cell = r.cells[c.id];
                    return (
                      <td key={c.id} className="px-3 py-3">
                        {cell ? (
                          <Link href={`/safesign/communications/${c.id}#request-${cell.requestId}`} className="inline-block">
                            <StatusPill status={cell.status} />
                            {cell.respondedAt && (
                              <span className="mt-0.5 block text-[11px] text-slate-400">
                                {cell.respondedName} · {formatStamp(cell.respondedAt)}
                              </span>
                            )}
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-300">Not included</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SafeSignShell>
  );
}
