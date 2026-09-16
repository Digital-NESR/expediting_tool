/**
 * Which databases exist, what they are called, and where their credentials come from.
 *
 * This mirrors the `src/lib/db-*.ts` modules deliberately rather than importing them: the
 * migration runner is plain Node and cannot load the app's TypeScript, and pulling in a pool
 * module would open a pool as a side effect of reading a name. The duplication is pinned by
 * `src/lib/db/__tests__/migration-manifest.test.ts`, which fails if a pool is added here
 * without a folder, or added to the app without appearing here.
 *
 * `key` matches the pool's cache key in `createPool`, and is also the migration folder name,
 * so there is one spelling of "which database is this" across the runner, the folders and the
 * runtime guard.
 *
 * The env chains are copied from the pool modules down to `??` vs `||` — they differ on an
 * explicitly empty value, and getting it wrong points a migration at the wrong server.
 */

/** @typedef {'standard' | 'sns' | 'sourceguide'} EnvStyle */

/** @type {Array<{ key: string, database: () => string | undefined, envStyle: EnvStyle }>} */
export const DATABASES = [
  { key: 'default', database: () => process.env.DB_NAME, envStyle: 'standard' },
  {
    key: 'catalog-manager',
    database: () => process.env.CATALOG_MANAGER_DB_NAME || 'catalog_manager_db',
    envStyle: 'standard',
  },
  {
    key: 'delegation',
    database: () => process.env.DELEGATION_DB_NAME || 'delegation_db',
    envStyle: 'standard',
  },
  {
    key: 'emp-directory',
    database: () => process.env.EMP_DB_NAME || 'azure_emp_directory',
    envStyle: 'standard',
  },
  {
    key: 'expediting',
    database: () => process.env.EXPEDITING_DB_NAME || 'nesr_expediting_db',
    envStyle: 'standard',
  },
  {
    key: 'laptop-procurement',
    database: () => process.env.LAPTOP_PROCUREMENT_DB_NAME || 'laptop_procurement_db',
    envStyle: 'standard',
  },
  {
    key: 'learning-hub',
    database: () => process.env.LEARNING_HUB_DB_NAME || 'learning_hub_db',
    envStyle: 'standard',
  },
  {
    key: 'procureguard',
    database: () => process.env.PROCURE_GUARD_DB_NAME || 'procureguard_db',
    envStyle: 'standard',
  },
  {
    key: 'sns',
    database: () => process.env.SNS_REGISTRY_DB_NAME ?? process.env.SnS_DB ?? 'sns_registry_db',
    envStyle: 'sns',
  },
  {
    key: 'soa',
    database: () => process.env.SOA_DB_NAME || 'soa_consolidation',
    envStyle: 'sns',
  },
  {
    key: 'sourceguide',
    database: () =>
      process.env.SourceGuide_DB || process.env.SOURCEGUIDE_DB_NAME || 'sourceguide_db',
    envStyle: 'sourceguide',
  },
  { key: 'tite', database: () => process.env.TITE_DB_NAME || 'nesr_tite_db', envStyle: 'standard' },
];

/** Credentials for a pool style. Copied from `credentials()` in src/lib/db/pool.ts. */
export function credentials(style) {
  switch (style) {
    case 'sns': {
      const sslFlag = process.env.DB_SSL ?? process.env.PGSSL ?? '';
      return {
        host: process.env.DB_HOST ?? process.env.POSTGRES_HOST,
        port: Number(process.env.DB_PORT ?? process.env.POSTGRES_PORT) || 5432,
        user: process.env.DB_USER ?? process.env.POSTGRES_USER,
        password: process.env.DB_PASSWORD ?? process.env.POSTGRES_PASSWORD,
        ssl: sslFlag === 'true' || sslFlag === 'require' ? { rejectUnauthorized: false } : false,
      };
    }
    case 'sourceguide':
      return {
        host: process.env.POSTGRES_HOST || process.env.DB_HOST,
        port: Number(process.env.POSTGRES_PORT || process.env.DB_PORT) || 5432,
        user: process.env.POSTGRES_USER || process.env.DB_USER,
        password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
        ssl:
          process.env.PGSSL === 'true' || process.env.DB_SSL === 'true'
            ? { rejectUnauthorized: false }
            : false,
      };
    default:
      return {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      };
  }
}
