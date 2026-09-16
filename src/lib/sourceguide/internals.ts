/* ─── Row shaping and the small helpers every query path needs. ─── */

import { logger } from '@/lib/logger';
import type { SgCommodity } from '@/types/sourceguide';

/* ─── helpers ────────────────────────────────────────────────── */

export const log = logger('sourceguide');

/**
 * A read that a server page renders reached its catch block, so the query
 * itself failed: access denial never gets here, because the `canRead()` guard
 * above already returned the empty value — that degrade is what keeps the
 * pending-access overlay rendering and is deliberately untouched.
 *
 * Returning the same empty value for a broken query is what made a database
 * failure indistinguishable from "no rows": the page rendered a legitimate
 * empty state over an outage. Log the detail server-side and throw a generic
 * message, which the SourceGuide error boundary renders as a retryable failure.
 *
 * Only reads a SERVER page renders use this. The reads a client component calls
 * (search, the mappings editor, the admin panels, the /admin pending badge) still
 * degrade to an empty value and log: a throw there is an unhandled rejection in
 * the browser, or a dead /admin for every other tool, not a visible failure.
 */
export function readFailed(event: string, err: unknown, fields?: Record<string, unknown>): never {
  log.error(`${event}.failed`, err, fields);
  throw new Error('SourceGuide could not load this data. Please try again.');
}

export function isoOf(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v ?? '');
}

export function buildPath(c: {
  category: string;
  subCategory: string | null;
  family: string | null;
  name: string;
}): string[] {
  return [c.category, c.subCategory, c.family, c.name].filter(Boolean) as string[];
}

export interface CommodityRow {
  id: number;
  code: string;
  name: string;
  category: string;
  category_id: string;
  sub_category: string | null;
  family: string | null;
  spend_type: string;
  description: string;
}

export function rowToCommodity(r: CommodityRow): SgCommodity {
  const c: SgCommodity = {
    id: r.id,
    code: r.code,
    name: r.name,
    category: r.category,
    categoryId: r.category_id,
    subCategory: r.sub_category,
    family: r.family,
    spendType: r.spend_type,
    description: r.description,
    path: [],
  };
  c.path = buildPath(c);
  return c;
}
