import { createPool } from './db/pool';

/**
 * The Travel Portal's database, read by Supply Chain Analytics.
 *
 * A feed from the Travel Portal product, which is a separate system on its own domain. Nothing
 * in this repo writes to it and nothing migrates it: it is marked read-only in the migration
 * manifest for the same reason RFx Officer's is. The analytics tool's own tables (who may look,
 * which country an entity belongs to, and the reveal log) live in the default database.
 *
 * `sourceguide` env style, which reads `POSTGRES_*` first and falls back to the platform `DB_*`
 * names, so it resolves both locally and on Vercel.
 */
const travelPortalPool = createPool(process.env.TRAVEL_PORTAL_DB_NAME || 'travel_portal', {
  key: 'travel-portal',
  label: 'travelPortalPool',
  envStyle: 'sourceguide',
});

export default travelPortalPool;
