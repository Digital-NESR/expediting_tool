import { createPool } from './db/pool';

const procureGuardPool = createPool(
  process.env.PROCURE_GUARD_DB_NAME || 'procureguard_db',
  { key: 'procureguard', label: 'procureGuardPool' },
);

export default procureGuardPool;
