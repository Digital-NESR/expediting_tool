import { createPool } from './db/pool';

/**
 * RFx Officer's database, read by ProcureGuard for its released-PR picker.
 *
 * `sourceguide` env style rather than `standard`: it reads `POSTGRES_*` first and falls back to
 * the platform `DB_*` names, which is the only shape that resolves both on this machine (where
 * only `POSTGRES_*` is set) and on Vercel. The `standard` style is platform names only and would
 * leave the picker empty in local development with no error worth reading.
 *
 * Read-only by convention: ProcureGuard writes nothing here, and `released_prs` is RFx Officer's
 * to maintain.
 */
const rfxOfficerPool = createPool(process.env.RFX_OFFICER_DB_NAME || 'rfx_officer', {
  key: 'rfx-officer',
  label: 'rfxOfficerPool',
  envStyle: 'sourceguide',
});

export default rfxOfficerPool;
