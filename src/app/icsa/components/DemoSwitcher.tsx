'use client';

import { useActionState } from 'react';
import { LogOut } from 'lucide-react';
import { icsaDemoSignIn, icsaDemoSignOut, type DemoSignInState } from '@/app/actions/icsa/demo';

export interface DemoSwitcherProps {
  options: { username: string; label: string }[];
  /** The demo person being viewed as, or null when you are yourself. */
  current: string | null;
  /** Signed in with SSO too, so leaving the demo returns to your own account. */
  hasOwnAccount: boolean;
}

/** "View as": become one of the ICSA demo people, and come back. */
export default function DemoSwitcher({ options, current, hasOwnAccount }: DemoSwitcherProps) {
  const [state, action, pending] = useActionState<DemoSignInState, FormData>(icsaDemoSignIn, {});

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
      <p className="mb-1.5 text-[0.6875rem] font-bold uppercase tracking-wide text-amber-800">
        View as demo user
      </p>
      <form action={action} className="flex gap-1.5">
        <select
          name="username"
          aria-label="Demo person"
          defaultValue={current ?? options[0]?.username}
          key={current ?? 'self'}
          className="min-w-0 flex-1 rounded-md border border-amber-300 bg-white px-2 py-1.5 text-xs text-slate-800"
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
          className="rounded-md bg-[#307c4c] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#307c4c]/85 disabled:opacity-60"
        >
          {pending ? '…' : 'Go'}
        </button>
      </form>
      {state.error && <p className="mt-1.5 text-xs text-red-700">{state.error}</p>}
      {current && (
        <form action={icsaDemoSignOut} className="mt-2">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 hover:text-[#307c4c]"
          >
            <LogOut className="h-3.5 w-3.5" />
            {hasOwnAccount ? 'Back to my account' : 'Sign out'}
          </button>
        </form>
      )}
    </div>
  );
}
