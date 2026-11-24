import { requireSchema } from '@/lib/db/schema-version';
import safesignPool from '@/lib/db-safesign';

/**
 * The SafeSign pool and its schema check. A plain module, deliberately NOT
 * `'use server'`: every export of a `'use server'` file is a public endpoint.
 */
export { safesignPool };

export function ensureSafeSignSchema(): Promise<void> {
  return requireSchema(safesignPool, 'safesign', '003_countries');
}
