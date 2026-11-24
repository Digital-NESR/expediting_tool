'use client';

/* Admin → RRSM → Service Registry: the one setting the shared registry has, approvals on or off. */

import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import {
  getServiceRegistryApprovals,
  setServiceRegistryApprovals,
} from '@/app/actions/rrsm/registry-admin';

export default function ServiceRegistryAdminClient() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void getServiceRegistryApprovals().then((r) => {
      if (!live) return;
      if (!r.ok) setError('The Service Registry could not be read.');
      setEnabled(r.enabled);
    });
    return () => {
      live = false;
    };
  }, []);

  async function toggle() {
    setBusy(true);
    setError('');
    const r = await setServiceRegistryApprovals(!enabled);
    if (!r.ok) setError(r.error ?? 'Could not change approvals.');
    else setEnabled(!enabled);
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-bold text-slate-900">Service Registry</h2>
        <p className="mt-1 max-w-3xl text-[13px] text-slate-500">
          RRSM and the Catalog share one Service Registry, kept in the Catalog&apos;s database.
          Items added or changed in either tool are the same items in both.
        </p>
      </header>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
          {error}
        </div>
      )}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          {enabled ? (
            <ShieldCheck className="h-5 w-5 text-[#307c4c]" />
          ) : (
            <ShieldOff className="h-5 w-5 text-amber-600" />
          )}
          <div>
            <p className="text-[13.5px] font-semibold text-slate-800">
              {enabled === null ? 'Reading…' : `Approvals are ${enabled ? 'on' : 'paused'}`}
            </p>
            <p className="text-[12px] text-slate-500">
              {enabled
                ? 'Higher-value items wait for the country approver, in both tools.'
                : 'Items added or changed in either tool are Active straight away.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={busy || enabled === null}
          onClick={() => void toggle()}
          className="rounded-lg border border-slate-200 px-3.5 py-2 text-[13px] font-semibold text-slate-700 hover:border-[#307c4c] disabled:opacity-50"
        >
          {busy ? 'Saving…' : enabled ? 'Pause approvals' : 'Switch approvals on'}
        </button>
      </section>
    </div>
  );
}
