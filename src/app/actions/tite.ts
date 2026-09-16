/**
 * TEMPORARY BARREL — the old 1,428-line `'use server'` TI-TE module.
 *
 * Everything that used to live here now lives in:
 *   - `src/lib/tite/*` — plain modules (country scoping predicates, the column lists each read
 *     projects, and the shapes the screens use). Nothing there is an endpoint.
 *   - `src/app/actions/tite/*` — the `'use server'` files, split by concern. Only those exports
 *     are public POST endpoints.
 *
 * Same shape as the ProcureGuard, Laptop Procurement and SourceGuide splits, and for the same
 * reason: every export in a 'use server' file is a public POST endpoint, so the country-scope
 * predicates were one keyword away from being callable over the network.
 *
 * This file exists so the 17 import sites keep working in this commit. It is NOT `'use server'`
 * itself: re-exporting the action modules is enough for Next.js, and a plain module can also
 * carry the type re-exports, which a `'use server'` file may not.
 *
 * To retire it: repoint those imports at the split modules and delete this file.
 */
export * from './tite/shipments';
export * from './tite/transitions';
export * from './tite/documents';
export * from './tite/access-requests';
export * from './tite/stakeholders';
export * from './tite/notifications';
export * from './tite/activity';

export type {
  CreateShipmentInput,
  NotificationLogRow,
  RecentActivityRow,
  TiteAccessRequestRow,
} from '@/lib/tite/types';
