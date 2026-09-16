/**
 * Every pool in the app, under one import.
 *
 * The per-tool modules (`src/lib/db-*.ts`) remain the definition sites — each owns
 * its own database-name fallback chain — and each is a thin call to `createPool`.
 * This barrel exists so a reader can see the whole set at once, and so new code can
 * `import { titePool } from '@/lib/db/pools'` instead of memorising a filename.
 *
 * Deliberately NOT named `index.ts`: `@/lib/db` already resolves to `src/lib/db.ts`,
 * and a sibling `src/lib/db/index.ts` would make that specifier ambiguous.
 *
 * Importing this barrel constructs all of them; `new Pool()` opens no sockets, but
 * prefer the specific module in hot paths.
 */
export { default as pool } from '../db';
export { default as catalogManagerPool } from '../db-catalog-manager';
export { default as delegationPool } from '../db-delegation';
export { default as empDirectoryPool } from '../db-emp-directory';
export { default as expeditingPool } from '../db-expediting';
export { default as laptopProcurementPool } from '../db-laptop';
export { default as learningHubPool } from '../db-learning-hub';
export { default as procureGuardPool } from '../db-procureguard';
export { default as snsPool } from '../db-sns';
export { default as soaPool } from '../db-soa';
export { default as sourceGuidePool } from '../db-sourceguide';
export { default as titePool } from '../db-tite';

export { createPool, DEFAULT_POOL_MAX } from './pool';
export type { CreatePoolOptions, PoolEnvStyle } from './pool';
