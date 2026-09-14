import { createPool } from './db/pool';

const laptopProcurementPool = createPool(
  process.env.LAPTOP_PROCUREMENT_DB_NAME || 'laptop_procurement_db',
  { key: 'laptop-procurement', label: 'laptopProcurementPool' },
);

export default laptopProcurementPool;
