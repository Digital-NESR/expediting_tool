'use client';

import { useActionState, useState } from 'react';
import { icsaDemoSignIn, type DemoSignInState } from '@/app/actions/icsa/demo';

interface DemoPerson {
  username: string;
  role: string;
  country: string | null;
}

const INPUT =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20';

export default function DemoLoginForm({ people }: { people: DemoPerson[] }) {
  const [state, action, pending] = useActionState<DemoSignInState, FormData>(icsaDemoSignIn, {});
  const [username, setUsername] = useState('');

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-2">
        {people.map((p) => (
          <button
            key={p.username}
            type="button"
            onClick={() => setUsername(p.username)}
            className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
              username === p.username
                ? 'border-[#307c4c] bg-[#307c4c]/5'
                : 'border-slate-200 hover:border-[#307c4c]/50'
            }`}
          >
            <span className="block font-semibold text-slate-900">{p.role}</span>
            <span className="block text-xs text-slate-500">
              {p.country ?? 'All locations'} · {p.username}
            </span>
          </button>
        ))}
      </div>

      <form action={action} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Username</span>
          <input
            name="username"
            className={INPUT}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
          <input
            name="password"
            type="password"
            className={INPUT}
            autoComplete="current-password"
            required
          />
        </label>
        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-[#307c4c] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#307c4c]/85 disabled:opacity-60"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </>
  );
}
