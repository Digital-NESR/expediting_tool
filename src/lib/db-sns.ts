import { createPool } from './db/pool';

/**
 * Connection settings for the S&S Registry database.
 *
 * Accepts two naming schemes: the platform-standard DB_* variables the other
 * tools read, and the POSTGRES_* / SnS_DB / PGSSL names used in local .env.local.
 * DB_* wins where both are present, so a deployment that already sets the
 * platform variables needs no extra configuration. (See the 'sns' envStyle in
 * ./db/pool for the host/user/password/ssl half of that resolution.)
 */
const snsPool = createPool(
  process.env.SNS_REGISTRY_DB_NAME ?? process.env.SnS_DB ?? 'sns_registry_db',
  { key: 'sns', label: 'snsPool', envStyle: 'sns' },
);

export default snsPool;
