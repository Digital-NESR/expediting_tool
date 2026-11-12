'use client';

import { useActionState } from 'react';
import { icsaDemoSignIn, type DemoSignInState } from '@/app/actions/icsa/demo';

export interface DemoOption {
  username: string;
  label: string;
}

/** "Demo login — testing only": pick an ICSA demo person and enter ICSA as them. */
export default function DemoLogin({ options }: { options: DemoOption[] }) {
  const [state, action, pending] = useActionState<DemoSignInState, FormData>(icsaDemoSignIn, {});

  return (
    <div className="w-full border-t border-white/10 pt-6">
      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-amber-400">
        Demo login — testing only
      </p>
      <p className="mb-3 text-xs text-slate-400">
        ICSA only. Pick a person to see the app as that role.
      </p>
      <form action={action} className="flex gap-2">
        <select
          name="username"
          aria-label="Demo person"
          defaultValue={options[0]?.username}
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-slate-800 px-3 py-2.5 text-sm text-white focus:border-[#307c4c] focus:outline-none"
        >
          {options.map((o) => (
            <option key={o.username} value={o.username}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
        >
          {pending ? '…' : 'Enter'}
        </button>
      </form>
      {state.error && <p className="mt-2 text-xs text-red-400">{state.error}</p>}
    </div>
  );
}
