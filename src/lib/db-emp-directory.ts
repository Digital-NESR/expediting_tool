import { createPool } from './db/pool';

// Read-only employee directory (Azure AD users synced into azure_emp_directory).
// Configured on the deployed app via EMP_DB_NAME; unset locally, in which case the
// pool never connects and the search action degrades to empty results.
//
// This is the single pool for azure_emp_directory: db-emp.ts declared a second,
// byte-for-byte identical one against the same database and has been folded in here.
const empDirectoryPool = createPool(process.env.EMP_DB_NAME || 'azure_emp_directory', {
  key: 'emp-directory',
  label: 'empDirectoryPool',
});

export default empDirectoryPool;
