'use server';

import { logger } from '@/lib/logger';
import { currentRrsmActor } from '@/lib/rrsm/access';
import { registryApprovalsEnabled, setRegistryApprovals } from '@/lib/service-registry/registry';

/**
 * Admin → RRSM → Service Registry: switch registry approvals on or off (paused while the registry
 * is being filled; decision 23 Nov 2026). EVERY EXPORT IS A PUBLIC POST ENDPOINT: each re-checks
 * that the caller is an RRSM (or platform) admin.
 *
 * RRSM's existing rows were moved into the registry once, on 24 Nov 2026, by a script; there is
 * no move page.
 */

const log = logger('rrsm-registry-admin');

async function requireAdmin() {
  const actor = await currentRrsmActor();
  if (!actor?.isAdmin) throw new Error('Only an RRSM admin can do this.');
  return { name: actor.email, email: actor.email };
}

export async function getServiceRegistryApprovals(): Promise<{ ok: boolean; enabled: boolean }> {
  try {
    await requireAdmin();
    return { ok: true, enabled: await registryApprovalsEnabled() };
  } catch (err) {
    log.error('getApprovals.failed', err);
    return { ok: false, enabled: true };
  }
}

export async function setServiceRegistryApprovals(
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireAdmin();
    await setRegistryApprovals(actor, enabled === true);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
