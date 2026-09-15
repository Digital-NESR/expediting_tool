'use server';

/* ─── Who the caller is. Read by the layout and by every page that gates on access view. ─── */

import { getProcureGuardUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import type { LaptopActor } from '@/types/laptopProcurement';
import type { QueryResultRow } from 'pg';
import { scopedWhere } from '@/lib/laptop-procurement/access';
import { getActor } from '@/lib/laptop-procurement/actor';
import { sql } from '@/lib/laptop-procurement/db';

const log = logger('laptop-procurement');

export async function getLaptopActor(): Promise<LaptopActor | null> {
  try {
    return await getActor();
  } catch (err) {
    log.error('getLaptopActor.failed', err);
    return null;
  }
}

// Laptop Procurement is open to every signed-in user — anyone with no
// laptop_permissions row, no approver-matrix presence, and no delegation still gets
// in as a plain Requester (see getActor's fallback role), so there's nothing left to
// gate here beyond being signed in at all.
export async function canAccessLaptopApp(): Promise<boolean> {
  const user = await getProcureGuardUser();
  return Boolean(user?.email);
}

/* ── Scoping ──────────────────────────────────────────────────── */

// For the document-download API route (a plain GET handler, outside the server-action
// boundary) — reuses the exact same scoping getActor()/scopedWhere() already apply
// everywhere else, so a document is downloadable by anyone who could see its request.
export async function canViewLaptopRequest(requestId: number): Promise<boolean> {
  try {
    const actor = await getActor();
    const scope = scopedWhere(actor);
    const where = scope.where ? `${scope.where} AND id = ?` : 'WHERE id = ?';
    const rows = await sql<QueryResultRow[]>(`SELECT id FROM laptop_requests ${where}`, [
      ...scope.params,
      requestId,
    ]);
    return rows.length > 0;
  } catch (err) {
    log.error('canViewLaptopRequest.failed', err);
    return false;
  }
}
