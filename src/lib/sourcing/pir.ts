/**
 * SAP purchasing info records — the contracted price a material was supposed to be bought at.
 *
 * ── THE CROSS-DATABASE PROBLEM ──────────────────────────────────────────────────────────────
 * `pir_catalog` lives in `catalog_manager_db`. The spend it must be compared against lives in
 * `core.supplychain` in `materials_db`. Postgres cannot join across two databases, so one side
 * has to travel — and the info records are tiny: 5,288 rows against 756,086 PO lines. So the
 * whole PIR table is loaded once into a JS map keyed on material+supplier, and the PO side is
 * never moved. This is the pattern `src/lib/travel-analytics/queries.ts` documents for the same
 * problem, reached by the same reasoning: move the small side.
 *
 * ── WHAT WAS VERIFIED BEFORE THIS WAS WRITTEN ───────────────────────────────────────────────
 *  - THE KEY MATCHES VERBATIM. `pir_catalog.product_number` and `core.supplychain.material` are
 *    both 18-character zero-padded (`000001100000031272`). No normalisation is needed, and
 *    adding any would be a liability.
 *  - COVERAGE IS NARROW AND MUST BE REPORTED. Over a trailing 24 months, 3,020 PO lines worth
 *    $124.2M match a non-expired material+supplier record, against $1,163.6M of spend on lines
 *    that carry any material at all — about 11%. The board states this the way the travel board
 *    states its savings coverage: a floor, not a total.
 *  - THREE QUARTERS OF THE RECORDS ARE EXPIRED — 3,971 of 5,288. An expired record cannot price
 *    a purchase made today, so it never produces a leakage finding; it is surfaced separately
 *    as a finding in its own right.
 *  - 21% ARE NOT IN USD (SAR, OMR, EGP, KWD, AED). They must be converted before comparison,
 *    and a record whose currency cannot be converted is dropped rather than compared wrongly.
 */

import { cache } from 'react';
import catalogManagerPool from '@/lib/db-catalog-manager';
import { logger } from '@/lib/logger';

const log = logger('sourcing-pir');

export interface InfoRecord {
  material: string;
  supplierNum: string;
  /** Contracted unit price converted to USD, or null when conversion was not possible. */
  unitPriceUsd: number | null;
  currency: string;
  expired: boolean;
  infoRecordNumber: string;
  country: string | null;
}

export interface PirIndex {
  /** Keyed `material\0supplier`. */
  byMaterialSupplier: Map<string, InfoRecord>;
  /** Keyed `material` — any record for the material, for the "exists but not with this vendor" case. */
  byMaterial: Map<string, InfoRecord[]>;
  totalRecords: number;
  activeRecords: number;
  expiredRecords: number;
  /** Records dropped because their currency could not be converted. */
  unconvertible: number;
}

const EMPTY: PirIndex = {
  byMaterialSupplier: new Map(),
  byMaterial: new Map(),
  totalRecords: 0,
  activeRecords: 0,
  expiredRecords: 0,
  unconvertible: 0,
};

/**
 * Indicative USD rates for the five non-USD currencies the info records use.
 *
 * STATIC, AND THAT IS A DELIBERATE LIMITATION. The contracted price is a standing rate rather
 * than a dated transaction, so there is no "rate on the day" to look up, and `core.supplychain`
 * carries `exchang_rate` only for the paid side. Three of the five are hard pegs (SAR, OMR,
 * AED) and are exact; EGP and KWD float, so a leakage finding on an Egyptian or Kuwaiti record
 * carries real FX uncertainty and is flagged `indicative` rather than `benchmarked` by the
 * caller. Replacing this with a dated rate table is the right fix if PIR comparison proves
 * valuable; it is not worth building before then.
 */
const USD_PER: Record<string, number> = {
  USD: 1,
  SAR: 0.2666, // pegged 3.75
  AED: 0.2723, // pegged 3.6725
  OMR: 2.6008, // pegged 0.3845
  KWD: 3.26,
  EGP: 0.0205,
};

/** Currencies whose rate floats, so a comparison against them is indicative only. */
export const FLOATING = new Set(['EGP', 'KWD']);

function toUsd(amount: number, currency: string): number | null {
  const rate = USD_PER[currency?.toUpperCase?.() ?? ''];
  if (!rate || !Number.isFinite(amount)) return null;
  return amount * rate;
}

/**
 * Loads and indexes every info record.
 *
 * `cache` dedupes within a render pass. Not cached beyond it: the table is reloaded nightly by
 * an n8n job and 5,288 rows is a cheap read.
 *
 * A failure here returns an empty index rather than throwing. The PIR lane is one of four
 * project types; losing it should cost the board that lane, not the board.
 */
export const loadPirIndex = cache(async (): Promise<PirIndex> => {
  try {
    const { rows } = await catalogManagerPool.query(
      `SELECT info_record_number, product_number, suppliers_account_number,
              unit_price, currency_key, status, country,
              order_unit, base_unit_of_measure, numerator_for_conversion
         FROM pir_catalog
        WHERE product_number IS NOT NULL
          AND TRIM(product_number) <> ''
          AND suppliers_account_number IS NOT NULL
          AND unit_price IS NOT NULL
          AND COALESCE(deletion_flag, '') = ''`,
    );

    const index: PirIndex = {
      byMaterialSupplier: new Map(),
      byMaterial: new Map(),
      totalRecords: rows.length,
      activeRecords: 0,
      expiredRecords: 0,
      unconvertible: 0,
    };

    for (const r of rows) {
      const material = String(r.product_number).trim();
      const supplierNum = String(r.suppliers_account_number).trim();
      const currency = String(r.currency_key ?? '').trim().toUpperCase();
      const expired = String(r.status ?? '').toLowerCase() === 'expired';

      /* A record priced per a pack of N must be divided down before it can be compared with a
         per-unit paid price. Only 27 of 5,288 records carry a numerator other than 1, but the
         ones that do would otherwise read as a huge overpayment. */
      const numerator = Number(r.numerator_for_conversion ?? 1) || 1;
      const unitPrice = Number(r.unit_price) / numerator;
      const usd = toUsd(unitPrice, currency);

      if (usd === null) index.unconvertible += 1;
      if (expired) index.expiredRecords += 1;
      else index.activeRecords += 1;

      const rec: InfoRecord = {
        material,
        supplierNum,
        unitPriceUsd: usd,
        currency,
        expired,
        infoRecordNumber: String(r.info_record_number ?? ''),
        country: r.country ? String(r.country) : null,
      };

      /* Where a material+supplier pair has several records, an active one always wins — an
         expired record cannot price a purchase made today. */
      const key = `${material}\u0000${supplierNum}`;
      const existing = index.byMaterialSupplier.get(key);
      if (!existing || (existing.expired && !rec.expired)) {
        index.byMaterialSupplier.set(key, rec);
      }

      const list = index.byMaterial.get(material) ?? [];
      list.push(rec);
      index.byMaterial.set(material, list);
    }

    return index;
  } catch (err) {
    log.error('pir.load_failed', err);
    return EMPTY;
  }
});

/**
 * The live contracted price for a material across the suppliers that actually supplied it.
 *
 * Returns the cheapest live record among them — if a buyer holds contracts with three vendors,
 * the one they should have been buying at is the cheapest, not an arbitrary pick.
 */
export function contractPriceFor(
  index: PirIndex,
  material: string | null,
  supplierNums: string[],
): { priceUsd: number | null; expired: boolean; infoRecordNumber: string | null; indicative: boolean } {
  if (!material) return { priceUsd: null, expired: false, infoRecordNumber: null, indicative: false };

  const matches = supplierNums
    .map((sn) => index.byMaterialSupplier.get(`${material}\u0000${sn}`))
    .filter((r): r is InfoRecord => Boolean(r) && r!.unitPriceUsd !== null);

  if (!matches.length) {
    /* No record with any supplier who actually supplied it. A record may still exist for this
       material with some other vendor, which is itself worth knowing. */
    const any = index.byMaterial.get(material) ?? [];
    const live = any.find((r) => !r.expired && r.unitPriceUsd !== null);
    return {
      priceUsd: null,
      expired: any.length > 0 && !live,
      infoRecordNumber: live?.infoRecordNumber ?? any[0]?.infoRecordNumber ?? null,
      indicative: false,
    };
  }

  const live = matches.filter((r) => !r.expired);
  const pool = live.length ? live : matches;
  const best = pool.reduce((a, b) => ((a.unitPriceUsd ?? Infinity) <= (b.unitPriceUsd ?? Infinity) ? a : b));

  return {
    priceUsd: best.unitPriceUsd,
    expired: !live.length,
    infoRecordNumber: best.infoRecordNumber,
    indicative: FLOATING.has(best.currency),
  };
}
