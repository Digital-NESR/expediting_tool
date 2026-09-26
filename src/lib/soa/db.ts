import { createSqlHelpers } from '@/lib/db/sql';
import { requireSchema } from '@/lib/db/schema-version';
import soaPool from '@/lib/db-soa';

/**
 * Query helpers for soa_consolidation.
 *
 * A plain module, deliberately NOT `'use server'`: every export of a `'use server'` file is a
 * public POST endpoint, and `exec` taking arbitrary SQL would be the most useful endpoint an
 * attacker has ever been handed.
 */
export const { sql, exec } = createSqlHelpers(soaPool);

export { soaPool };

/** Assert that soa_consolidation has had its migrations applied. */
export function ensureSoaSchema(): Promise<void> {
  return requireSchema(soaPool, 'soa', '007_drop_attachment_store');
}
