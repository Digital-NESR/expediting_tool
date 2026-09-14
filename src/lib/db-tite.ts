import { createPool } from './db/pool';

const titePool = createPool(
  process.env.TITE_DB_NAME || 'nesr_tite_db',
  {
    key: 'tite',
    label: 'titePool',
    onConnect: () => console.log('[titePool] connected to:', process.env.TITE_DB_NAME || 'nesr_tite_db'),
  },
);

export default titePool;
