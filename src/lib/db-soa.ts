import { createPool } from './db/pool';

/**
 * SOA Consolidation's own database.
 *
 * The tool reads its PO figures from SourceGuide's `historic_spend` (see `@/lib/db-sourceguide`)
 * because those are the GRN'd lines — goods actually received — which is what a statement of
 * account is reconciled against. Open POs would be the wrong denominator entirely. Everything the
 * tool itself owns (cycles, vendors, outreach state, evidence) lives here.
 *
 * `envStyle: 'sns'` is about environment variables, not about the S&S Registry. That style reads
 * the platform-standard `DB_*` names first and falls back to the `POSTGRES_*` names, which is the
 * only one of the three that resolves both on Vercel and against the local `.env` — the nine pools
 * on plain `'standard'` cannot connect from a developer's machine at all. A new pool has no
 * history to preserve, so it takes the style that works in both places.
 */
const soaPool = createPool(process.env.SOA_DB_NAME || 'soa_consolidation', {
  key: 'soa',
  label: 'soaPool',
  envStyle: 'sns',
});

export default soaPool;
