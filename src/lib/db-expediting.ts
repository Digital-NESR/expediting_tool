import { createPool } from './db/pool';

// Read-only access to the NESR expediting tool database (same Azure server) for the
// real SAP supplier master. Catalog Repo only reads supplier_contacts for the picker.
const expeditingPool = createPool(process.env.EXPEDITING_DB_NAME || 'nesr_expediting_db', {
  key: 'expediting',
  label: 'expeditingPool',
});

export default expeditingPool;
