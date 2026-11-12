import { createSqlHelpers } from '@/lib/db/sql';
import { requireSchema } from '@/lib/db/schema-version';
import icsaPool from '@/lib/db-icsa';

/**
 * Query helpers for the ICSA database. A plain module, deliberately NOT `'use server'`: every
 * export of a `'use server'` file is a public endpoint, and `exec` takes arbitrary SQL.
 */
export const { sql, exec } = createSqlHelpers(icsaPool);

export { icsaPool };

export function ensureIcsaSchema(): Promise<void> {
  return requireSchema(icsaPool, 'icsa', '001_baseline');
}
