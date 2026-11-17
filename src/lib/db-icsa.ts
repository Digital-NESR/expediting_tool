import { createPool } from './db/pool';

/**
 * ICSA (Internal Control Self-Assessment) database: cycles, champions, nominations, answers and
 * evidence. The database itself (`ICSA_portal`) was provisioned for this portal; the schema is
 * owned by database/migrations/icsa.
 *
 * `envStyle: 'sns'` for the reason given in db-soa.ts: it is the only style that resolves both on
 * Vercel and against a developer's local `.env`.
 */
const icsaPool = createPool(process.env.ICSA_DB_NAME || 'ICSA_portal', {
  key: 'icsa',
  label: 'icsaPool',
  envStyle: 'sns',
});

export default icsaPool;
