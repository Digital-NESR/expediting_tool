'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import EmployeeAutocomplete from './EmployeeAutocomplete';
import { addProcureGuardRequestViewer, removeProcureGuardRequestViewer } from '@/app/actions/procureGuard';
import type { ProcureGuardRequestType } from '@/types/procureGuard';

export default function ProcureGuardViewersManager({
  requestType,
  requestId,
  viewers,
  canManage,
}: {
  requestType: ProcureGuardRequestType;
  requestId: number;
  viewers: string[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  function add(email: string, name?: string | null) {
    setError('');
    startTransition(async () => {
      const result = await addProcureGuardRequestViewer({ requestType, requestId, email, name });
      if (result.success) router.refresh();
      else setError(result.error ?? 'Failed to add viewer.');
    });
  }

  function remove(email: string) {
    setError('');
    startTransition(async () => {
      const result = await removeProcureGuardRequestViewer({ requestType, requestId, email });
      if (result.success) router.refresh();
      else setError(result.error ?? 'Failed to remove viewer.');
    });
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900">Viewers</h2>
      <p className="mt-1 text-xs text-slate-500">
        People added here can view this request and receive its status updates. Add anyone, anytime.
      </p>

      {canManage && (
        <div className="mt-3">
          <EmployeeAutocomplete
            placeholder="Add a viewer by name or email…"
            onSelect={emp => add(emp.email, emp.name)}
          />
        </div>
      )}

      {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}

      <div className="mt-3">
        {viewers.length === 0 ? (
          <p className="text-sm text-slate-500">No extra viewers yet{canManage ? ' — add one above.' : '.'}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {viewers.map(email => (
              <span key={email} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[0.6875rem] font-semibold text-slate-700">
                {email}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => remove(email)}
                    disabled={isPending}
                    aria-label={`Remove ${email}`}
                    className="rounded p-0.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
