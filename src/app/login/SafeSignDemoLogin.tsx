'use client';

import { signIn } from 'next-auth/react';
import { DEMO_PERSONAS } from '@/lib/safesign/demo';

/**
 * SafeSign demo sign-in, shown on a developer's machine only.
 *
 * LoginClient renders this behind `process.env.NODE_ENV !== 'production'`, which Next inlines at
 * build time, so a production bundle does not contain it; and the `safesign-demo` provider it
 * calls is not registered in production either (src/lib/auth/options.ts), so even a hand-made
 * request would be refused.
 */
export default function SafeSignDemoLogin() {
  return (
    <div className="w-full border-t border-white/10 pt-6">
      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-amber-400">Local demo · ComplyConnect</p>
      <p className="mb-3 text-xs text-slate-400">Only on a local dev server; never on the live site. Pick a role.</p>
      <div className="grid gap-2">
        {DEMO_PERSONAS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => signIn('safesign-demo', { persona: p.id, callbackUrl: '/safesign' })}
            className="flex items-center justify-between rounded-xl border border-white/15 px-4 py-2.5 text-left text-sm text-white hover:bg-white/10"
          >
            <span className="font-semibold">{p.name}</span>
            <span className="text-xs text-slate-400">{p.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
