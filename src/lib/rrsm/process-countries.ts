import type { QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { logger } from '@/lib/logger';
import type { ProcessSettings } from './process-map';

/**
 * The live countries and how each runs RRSM, for the process map on Help & Training.
 *
 * Read by the PUBLIC help page too (no sign-in). Only country names and on/off settings leave
 * here, nothing about people, suppliers or money, so that is safe to show anybody. A plain module
 * rather than a server action, so it is not a POST endpoint of its own.
 */

export interface ProcessCountry extends ProcessSettings {
  code: string;
  name: string;
}

const log = logger('rrsm-process-countries');

export async function readProcessCountries(): Promise<ProcessCountry[]> {
  try {
    const { rows } = await rrsmPool.query<QueryResultRow>(
      `SELECT code, name, supplier_validation, ops_validation, rentals_enabled, recurrent_enabled,
              recurrent_reminders
         FROM rrsm_countries
        WHERE live
        ORDER BY sort_order, name`,
    );
    return rows.map((r) => ({
      code: String(r.code),
      name: String(r.name),
      supplier: Boolean(r.supplier_validation),
      ops: Boolean(r.ops_validation),
      rentals: Boolean(r.rentals_enabled),
      recurrent: Boolean(r.recurrent_enabled),
      reminders: Boolean(r.recurrent_reminders),
    }));
  } catch (err) {
    /* Help must still render; the map then offers the on/off switches instead of countries. */
    log.error('readProcessCountries.failed', err);
    return [];
  }
}
