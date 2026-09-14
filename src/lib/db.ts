import { createPool } from './db/pool';

// PO Expediting / platform-wide pool. Reads DB_NAME (no default) — unlike every
// other tool, which falls back to a literal database name.
//
// FOLLOW-UP: this may point at the same database as db-expediting.ts in production
// (EXPEDITING_DB_NAME='nesr_expediting_db'). DB_NAME is not set locally so it could
// not be verified; they are deliberately kept as two separate pools until it is.
//
// NOTE: this pool has never had an 'error' handler, unlike the others. Preserved as-is
// (an unhandled idle-client error still takes the process down) — adding one would be
// a behaviour change and belongs in its own commit.
const pool = createPool(process.env.DB_NAME, { key: 'default', label: null });

export default pool;
