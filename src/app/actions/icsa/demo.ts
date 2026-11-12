'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { logger } from '@/lib/logger';
import { ensureIcsaSchema } from '@/lib/icsa/db';
import {
  DEMO_COOKIE,
  demoCookieMaxAge,
  demoCookieValue,
  demoEnabled,
  demoUserByUsername,
  ensureDemoData,
} from '@/lib/icsa/demo';

const log = logger('icsa-demo-auth');

export interface DemoSignInState {
  error?: string;
}

/**
 * Becomes one of the demo people (see src/lib/icsa/demo.ts). Used with useActionState, so it
 * takes the previous state.
 */
export async function icsaDemoSignIn(
  _prev: DemoSignInState,
  form: FormData,
): Promise<DemoSignInState> {
  if (!demoEnabled()) return { error: 'The demo login is switched off.' };
  const user = demoUserByUsername(String(form.get('username') ?? ''));
  if (!user) return { error: 'Pick a demo person first.' };

  try {
    await ensureIcsaSchema();
    await ensureDemoData();
  } catch (err) {
    log.error('signIn.seed_failed', err);
    return { error: 'The demo data could not be prepared. Try again in a moment.' };
  }

  (await cookies()).set(DEMO_COOKIE, demoCookieValue(user.username), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: demoCookieMaxAge(),
  });
  log.info('signIn', { username: user.username });
  redirect('/icsa');
}

export async function icsaDemoSignOut(): Promise<void> {
  (await cookies()).delete(DEMO_COOKIE);
  redirect('/login');
}
