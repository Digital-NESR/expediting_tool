import { redirect } from 'next/navigation';
import {
  activeCountry,
  canSend,
  currentSafeSignActor,
  hasAccess,
  isApprover,
  type Country,
  type SafeSignActor,
} from './access';
import { pendingApprovalCount } from './approvals';
import type { ShellUser } from '@/app/safesign/components/SafeSignShell';

/**
 * What every staff page starts with: the signed-in person, the country being worked on and the
 * props the shell needs. The (portal) layout has already turned away anybody without access;
 * this re-checks because layouts and pages render in parallel.
 *
 * An approver who sends nothing (no country of their own) only has the Approvals pages, so the
 * sender pages send them there.
 */
export async function safesignPage(): Promise<{ actor: SafeSignActor; country: Country; shell: ShellUser }> {
  const actor = await currentSafeSignActor();
  if (!actor) redirect('/login');
  if (!canSend(actor) || !actor.role) redirect(isApprover(actor) ? '/safesign/approvals' : '/home');
  const country = await activeCountry(actor);
  return { actor, country, shell: await shellFor(actor, country) };
}

/** For the Approvals pages: senders and approvers alike, with or without a country. */
export async function safesignApproverPage(): Promise<{ actor: SafeSignActor; shell: ShellUser }> {
  const actor = await currentSafeSignActor();
  if (!actor) redirect('/login');
  if (!hasAccess(actor)) redirect('/home');
  const country = canSend(actor) ? await activeCountry(actor) : null;
  return { actor, shell: await shellFor(actor, country) };
}

async function shellFor(actor: SafeSignActor, country: Country | null): Promise<ShellUser> {
  return {
    name: actor.name,
    email: actor.email,
    role: actor.role ?? 'sender',
    countries: actor.countries,
    country,
    canSend: canSend(actor),
    approver: isApprover(actor),
    pendingApprovals: await pendingApprovalCount(actor),
  };
}
