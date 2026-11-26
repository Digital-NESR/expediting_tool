import { createPool } from './db/pool';

/**
 * SafeSign (shown as ComplyConnect): communications sent to suppliers, and what each supplier sent
 * back (an acknowledgment, a signed letter, supporting documents or an action plan).
 *
 * The database (`SafeSign`) is provisioned for this tool alone; the schema is owned by
 * database/migrations/safesign. `envStyle: 'sns'` for the reason given in db-soa.ts: it is
 * the only style that resolves both on Vercel and against a developer's local `.env`.
 */
const safesignPool = createPool(process.env.SAFESIGN_DB_NAME || 'SafeSign', {
  key: 'safesign',
  label: 'safesignPool',
  envStyle: 'sns',
});

export default safesignPool;
