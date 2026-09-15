/**
 * TEMPORARY BARREL — the old 4,013-line `'use server'` ProcureGuard module.
 *
 * Everything that used to live here now lives in:
 *   - `src/lib/procure-guard/*` — plain modules (database access, actor/scope resolution, access
 *     predicates, validation, notifications, analytics, constants). Nothing there is an endpoint.
 *   - `src/app/actions/procure-guard/*` — the `'use server'` files, split by concern. Only those
 *     exports are public POST endpoints.
 *
 * This file exists solely so the ~22 client import sites keep working in this commit. It is NOT
 * `'use server'` itself: re-exporting the action modules is enough for Next.js, and a plain module
 * can also carry the type re-exports below (a `'use server'` file may only export async functions).
 *
 * To retire it: repoint those 22 import statements at the split modules and delete this file.
 */
export * from './procure-guard/reads';
export * from './procure-guard/requests';
export * from './procure-guard/documents';
export * from './procure-guard/delegation';
export * from './procure-guard/admin';
export * from './procure-guard/analytics';

export type {
  ApproverCell,
  ApproverMatrixColumn,
  ProcureGuardApproverMatrix,
  ProcureGuardViewerGrant,
} from '@/lib/procure-guard/approver-matrix';
