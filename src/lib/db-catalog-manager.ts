import { createPool } from './db/pool';

const catalogManagerPool = createPool(
  process.env.CATALOG_MANAGER_DB_NAME || 'catalog_manager_db',
  { key: 'catalog-manager', label: 'catalogManagerPool' },
);

export default catalogManagerPool;
