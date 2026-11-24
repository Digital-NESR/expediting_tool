import { createPool } from './db/pool';

/*
 * The Supply Chain Health Board's own database, `all_kpis`. Provisioned on the same server and
 * with the same credentials as RRSM and SourceGuide, so it takes the `sourceguide` env style
 * (POSTGRES_* first, DB_* as the fallback).
 */
const allKpisPool = createPool(process.env.ALL_KPIS_DB_NAME || 'all_kpis', {
  key: 'all-kpis',
  label: 'allKpisPool',
  envStyle: 'sourceguide',
});

export default allKpisPool;
