import { createPool } from './db/pool';

/*
 * Dedicated pool for RRSM — Rental & Recurrent Services Management.
 *
 * `rrsm_db` was provisioned on the same server as SourceGuide and the Travel Portal feed and
 * reads the same credentials, so it takes the `sourceguide` env style: POSTGRES_* first, DB_*
 * as the fallback. That is what makes it reachable from a developer's .env as well as from
 * Vercel — see the note on `credentials()` in ./db/pool, and get it wrong and the migration
 * runner points at a different server than the app does.
 */
const rrsmPool = createPool(process.env.RRSM_DB_NAME || 'rrsm_db', {
  key: 'rrsm',
  label: 'rrsmPool',
  envStyle: 'sourceguide',
});

export default rrsmPool;
