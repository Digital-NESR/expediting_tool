import { createPool } from './db/pool';

// PO Expediting / platform-wide pool. Reads DB_NAME (no default) — unlike every
// other tool, which falls back to a literal database name.
//
// FOLLOW-UP: this may point at the same database as db-expediting.ts in production
// (EXPEDITING_DB_NAME='nesr_expediting_db'). DB_NAME is not set locally so it could
// not be verified; they are deliberately kept as two separate pools until it is.
//
// This pool alone had no 'error' handler. `pg` emits 'error' on an idle client whose connection
// the server or the network dropped, and an 'error' event with no listener is how Node is told to
// terminate the process: one closed idle connection could take the whole app down, which is not a
// behaviour worth preserving for its own sake. It now logs like the other eleven.
const pool = createPool(process.env.DB_NAME, { key: 'default', label: 'pool' });

export default pool;
