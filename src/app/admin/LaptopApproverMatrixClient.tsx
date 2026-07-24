'use client';

import { Fragment, useCallback, useEffect, useState, useTransition } from 'react';
import { getLaptopApproverMatrix, updateLaptopApproverMatrix } from '@/app/actions/laptopProcurement';
import type { LaptopApproverMatrixRow } from '@/types/laptopProcurement';

type ApproverEditValues = {
  it_manager_name: string; it_manager_email: string;
  it_manager_2_name: string; it_manager_2_email: string;
  cm_name: string; cm_email: string;
  itd_name: string; itd_email: string;
  scd_name: string; scd_email: string;
  is_active: boolean;
};

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap bg-[#307c4c]/10 text-[#307c4c] border-[#307c4c]/20">
      Active
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap bg-slate-100 text-slate-500 border-slate-200">
      Inactive
    </span>
  );
}

function ApproverEditForm({
  row,
  loading,
  onCancel,
  onConfirm,
}: {
  row: LaptopApproverMatrixRow;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (values: ApproverEditValues) => void;
}) {
  const [itManagerName, setItManagerName] = useState(row.it_manager_name ?? '');
  const [itManagerEmail, setItManagerEmail] = useState(row.it_manager_email ?? '');
  const [itManager2Name, setItManager2Name] = useState(row.it_manager_2_name ?? '');
  const [itManager2Email, setItManager2Email] = useState(row.it_manager_2_email ?? '');
  const [cmName, setCmName] = useState(row.cm_name ?? '');
  const [cmEmail, setCmEmail] = useState(row.cm_email ?? '');
  const [itdName, setItdName] = useState(row.itd_name ?? '');
  const [itdEmail, setItdEmail] = useState(row.itd_email ?? '');
  const [scdName, setScdName] = useState(row.scd_name ?? '');
  const [scdEmail, setScdEmail] = useState(row.scd_email ?? '');
  const [isActive, setIsActive] = useState(row.is_active);

  const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#307c4c]';
  const labelCls = 'mb-1 block text-[11px] font-semibold uppercase text-slate-400';

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="mb-3 text-xs font-semibold text-slate-600">Edit approvers for {row.country}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label>
          <span className={labelCls}>IT Manager Name</span>
          <input className={inputCls} value={itManagerName} onChange={e => setItManagerName(e.target.value)} />
        </label>
        <label>
          <span className={labelCls}>IT Manager Email</span>
          <input className={inputCls} value={itManagerEmail} onChange={e => setItManagerEmail(e.target.value)} />
        </label>
        <label>
          <span className={labelCls}>IT Manager 2 Name</span>
          <input className={inputCls} value={itManager2Name} onChange={e => setItManager2Name(e.target.value)} />
        </label>
        <label>
          <span className={labelCls}>IT Manager 2 Email</span>
          <input className={inputCls} value={itManager2Email} onChange={e => setItManager2Email(e.target.value)} />
        </label>
        <label>
          <span className={labelCls}>Country Manager Name</span>
          <input className={inputCls} value={cmName} onChange={e => setCmName(e.target.value)} />
        </label>
        <label>
          <span className={labelCls}>Country Manager Email</span>
          <input className={inputCls} value={cmEmail} onChange={e => setCmEmail(e.target.value)} />
        </label>
        <label>
          <span className={labelCls}>IT Director Name</span>
          <input className={inputCls} value={itdName} onChange={e => setItdName(e.target.value)} />
        </label>
        <label>
          <span className={labelCls}>IT Director Email</span>
          <input className={inputCls} value={itdEmail} onChange={e => setItdEmail(e.target.value)} />
        </label>
        <label>
          <span className={labelCls}>SC Director Name</span>
          <input className={inputCls} value={scdName} onChange={e => setScdName(e.target.value)} />
        </label>
        <label>
          <span className={labelCls}>SC Director Email</span>
          <input className={inputCls} value={scdEmail} onChange={e => setScdEmail(e.target.value)} />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-700">
        <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-[#307c4c] focus:ring-[#307c4c]" />
        Active
      </label>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => onConfirm({
            it_manager_name: itManagerName, it_manager_email: itManagerEmail,
            it_manager_2_name: itManager2Name, it_manager_2_email: itManager2Email,
            cm_name: cmName, cm_email: cmEmail,
            itd_name: itdName, itd_email: itdEmail,
            scd_name: scdName, scd_email: scdEmail,
            is_active: isActive,
          })}
          className="rounded-lg bg-[#307c4c] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#307c4c]/90 disabled:opacity-60"
        >
          {loading ? 'Saving...' : 'Confirm'}
        </button>
        <button type="button" disabled={loading} onClick={onCancel} className="rounded-lg px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function LaptopApproverMatrixClient() {
  const [rows, setRows] = useState<LaptopApproverMatrixRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const [isPending, startTransition] = useTransition();

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await getLaptopApproverMatrix();
      setRows(data ?? []);
      setLastRefreshed(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    getLaptopApproverMatrix()
      .then(data => {
        setRows(data ?? []);
        setLastRefreshed(new Date());
      })
      .finally(() => setLoading(false));
  }, []);

  function handleSave(row: LaptopApproverMatrixRow, values: ApproverEditValues) {
    setActionError('');
    setProcessingId(row.id);
    startTransition(async () => {
      const result = await updateLaptopApproverMatrix({ id: row.id, ...values });
      if (!result.success) {
        setActionError(result.error ?? 'Failed to update approver matrix.');
        setProcessingId(null);
        return;
      }
      await refreshData();
      setExpandedId(null);
      setProcessingId(null);
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-3 text-slate-500">
        <svg className="h-5 w-5 animate-spin text-[#307c4c]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <span className="text-sm font-medium">Loading Laptop Procurement approver matrix...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Laptop Procurement Access Approval</h2>
          <p className="mt-0.5 text-[12px] text-gray-400">
            Per-country approver routing (IT Manager → Country Manager → IT Director → Supply Chain Director) · Last updated: {lastRefreshed ? lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
          </p>
        </div>
        <button
          type="button"
          disabled={isRefreshing}
          onClick={refreshData}
          className="rounded-md border border-slate-200 px-3.5 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      {actionError && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{actionError}</p>}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Countries</h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{rows.length}</span>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">No approver matrix rows found.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Country</th>
                    <th className="px-4 py-3 text-left font-semibold">IT Manager</th>
                    <th className="px-4 py-3 text-left font-semibold">IT Manager 2</th>
                    <th className="px-4 py-3 text-left font-semibold">Country Manager</th>
                    <th className="px-4 py-3 text-left font-semibold">IT Director</th>
                    <th className="px-4 py-3 text-left font-semibold">SC Director</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(row => {
                    const busy = isPending && processingId === row.id;
                    const expanded = expandedId === row.id;
                    return (
                      <Fragment key={row.id}>
                        <tr className="align-top hover:bg-[#307c4c]/5">
                          <td className="px-4 py-3 font-bold text-slate-900">{row.country}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-800">{row.it_manager_name || '—'}</p>
                            {row.it_manager_email && <p className="text-xs text-slate-500">{row.it_manager_email}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-800">{row.it_manager_2_name || '—'}</p>
                            {row.it_manager_2_email && <p className="text-xs text-slate-500">{row.it_manager_2_email}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-800">{row.cm_name || '—'}</p>
                            {row.cm_email && <p className="text-xs text-slate-500">{row.cm_email}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-800">{row.itd_name || '—'}</p>
                            {row.itd_email && <p className="text-xs text-slate-500">{row.itd_email}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-800">{row.scd_name || '—'}</p>
                            {row.scd_email && <p className="text-xs text-slate-500">{row.scd_email}</p>}
                          </td>
                          <td className="px-4 py-3"><StatusBadge active={row.is_active} /></td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setExpandedId(expanded ? null : row.id)}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                              >
                                Edit
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={8} className="bg-slate-50/60 px-4 pb-4">
                              <ApproverEditForm
                                row={row}
                                loading={busy}
                                onCancel={() => setExpandedId(null)}
                                onConfirm={values => handleSave(row, values)}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
