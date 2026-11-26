import { Check, Clock, X } from 'lucide-react';
import type { ApprovalInfo } from '@/lib/safesign/approvals';
import { formatStamp } from '@/lib/safesign/model';
import { CARD } from './ui';

/**
 * The approval chain of one communication as three steps: submitted, the country's SCM, final.
 * A plain module (no hooks), so the sender's page and the approver's review page both use it.
 */

type StepState = 'done' | 'current' | 'rejected' | 'waiting';

const DOT: Record<StepState, string> = {
  done: 'bg-[#307c4c] text-white',
  current: 'bg-amber-100 text-amber-700 ring-2 ring-amber-300',
  rejected: 'bg-rose-600 text-white',
  waiting: 'bg-slate-100 text-slate-400',
};

function Step({ state, title, who, when }: { state: StepState; title: string; who: string; when?: string | null }) {
  const Icon = state === 'done' ? Check : state === 'rejected' ? X : Clock;
  return (
    <li className="flex min-w-0 flex-1 items-start gap-3">
      <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${DOT[state]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="truncate text-xs text-slate-500" title={who}>{who}</p>
        {when && <p className="text-[11px] text-slate-400">{formatStamp(when)}</p>}
      </div>
    </li>
  );
}

export default function ApprovalTrack({ info, createdBy }: { info: ApprovalInfo; createdBy: string }) {
  const s = info.state;
  const names = (list: { name: string }[]) => list.map((a) => a.name).join(' or ') || 'Nobody set up yet';
  const rejectedAt = (step: 'scm' | 'final') => s === 'rejected' && info.rejectionStep === step;

  const scmState: StepState =
    rejectedAt('scm') ? 'rejected'
    : s === 'pending_scm' ? 'current'
    : info.scmDecidedAt && (s === 'pending_final' || s === 'approved' || rejectedAt('final')) ? 'done'
    : 'waiting';
  const finalState: StepState =
    rejectedAt('final') ? 'rejected' : s === 'pending_final' ? 'current' : s === 'approved' ? 'done' : 'waiting';

  return (
    <section className={`${CARD} p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Approval</p>
        <p className="text-xs text-slate-500">
          {s === 'not_submitted' && 'Not submitted yet. Suppliers can only be emailed once both approvals are in.'}
          {s === 'pending_scm' && 'Waiting for the supply chain manager.'}
          {s === 'pending_final' && 'Waiting for the final approval.'}
          {s === 'approved' && 'Approved. It can be sent.'}
          {s === 'rejected' && 'Rejected. It has not been sent.'}
        </p>
      </div>
      <ol className="mt-4 flex flex-col gap-4 sm:flex-row">
        <Step state={info.submittedAt && s !== 'not_submitted' ? 'done' : 'waiting'} title="Submitted" who={createdBy} when={s !== 'not_submitted' ? info.submittedAt : null} />
        <Step
          state={scmState}
          title="Country SCM"
          who={info.scmDecidedBy && scmState !== 'waiting' && scmState !== 'current' ? info.scmDecidedBy : names(info.scm)}
          when={scmState === 'done' || scmState === 'rejected' ? info.scmDecidedAt : null}
        />
        <Step
          state={finalState}
          title="Final approval"
          who={info.finalDecidedBy && (finalState === 'done' || finalState === 'rejected') ? info.finalDecidedBy : names(info.final)}
          when={finalState === 'done' || finalState === 'rejected' ? info.finalDecidedAt : null}
        />
      </ol>
      {s === 'rejected' && info.rejectionComment && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-xs font-semibold text-rose-700">Reason for rejection</p>
          <p className="mt-1 whitespace-pre-line text-sm text-rose-900">{info.rejectionComment}</p>
        </div>
      )}
      {info.history.some((h) => h.comment && !h.kind.endsWith('_rejected')) && (
        <ul className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
          {info.history
            .filter((h) => h.comment && !h.kind.endsWith('_rejected'))
            .map((h, i) => (
              <li key={i}>
                <span className="font-semibold">{h.actor}</span>: {h.comment}
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
