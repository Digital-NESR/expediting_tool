import { redirect } from 'next/navigation';
import { activeCountry, currentSafeSignActor, hasAccess, type Country, type SafeSignActor } from './access';
import type { ShellUser } from '@/app/safesign/components/SafeSignShell';

/**
 * What every SafeSign staff page starts with: the signed-in person, the country being worked on
 * and the props the shell needs. The (portal) layout has already turned away anybody without
 * access; this re-checks because layouts and pages render in parallel.
 */
export async function safesignPage(): Promise<{ actor: SafeSignActor; country: Country; shell: ShellUser }> {
  const actor = await currentSafeSignActor();
  if (!actor) redirect('/login');
  if (!hasAccess(actor) || !actor.role) redirect('/home');
  const country = await activeCountry(actor);
  return {
    actor,
    country,
    shell: {
      name: actor.name,
      email: actor.email,
      role: actor.role,
      countries: actor.countries,
      country,
      platformAdmin: actor.platformAdmin,
    },
  };
}
