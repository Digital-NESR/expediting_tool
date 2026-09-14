import { createPool } from './db/pool';

// Central "delegation hub" database — one DB per tool, like the others.
// Stores only WHO delegates to WHOM, for WHICH app, and WHEN. The actual
// role/scope is always resolved fresh from each app's own permission tables,
// so there is no role duplication or drift.
const delegationPool = createPool(
  process.env.DELEGATION_DB_NAME || 'delegation_db',
  { key: 'delegation', label: 'delegationPool' },
);

export default delegationPool;
