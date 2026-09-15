/**
 * TEMPORARY BARREL — the old 4,354-line `'use server'` Laptop Procurement module.
 *
 * Everything that used to live here now lives in:
 *   - `src/lib/laptop-procurement/*` — plain modules (database access, schema, actor and access
 *     resolution, delegation, notifications, aggregation). Nothing there is an endpoint.
 *   - `src/app/actions/laptop-procurement/*` — the `'use server'` files, split by concern. Only
 *     those exports are public POST endpoints.
 *
 * Same shape as the ProcureGuard split, and for the same reason: every export in a 'use server'
 * file is a public POST endpoint, so helpers like `scopedWhere` and `resolveLaptopActing` were
 * one keyword away from being callable over the network.
 *
 * This file exists so the existing client import sites keep working in this commit. It is NOT
 * `'use server'` itself: re-exporting the action modules is enough for Next.js, and a plain
 * module can also carry type re-exports, which a `'use server'` file may not.
 *
 * To retire it: repoint those imports at the split modules and delete this file.
 */
export * from './laptop-procurement/actor';
export * from './laptop-procurement/devices';
export * from './laptop-procurement/reads';
export * from './laptop-procurement/requests';
export * from './laptop-procurement/transitions';
export * from './laptop-procurement/documents';
export * from './laptop-procurement/admin';
export * from './laptop-procurement/access-requests';
export * from './laptop-procurement/delegation';
