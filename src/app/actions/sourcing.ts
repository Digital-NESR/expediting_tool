'use server';

/**
 * What the Sourcing Opportunities board calls when its controls change.
 *
 * Every export of a `'use server'` module is a public POST endpoint, so this re-checks the
 * reader rather than trusting the page that rendered the component. The board is platform-admin
 * only — company-wide purchasing data with no country scoping of its own — and an unauthorised
 * call gets `null` rather than an error: the client renders its "unavailable" card either way,
 * and a 403 would tell a prober that the data exists.
 *
 * The request arrives from a browser and is narrowed by `coerceRequest` before it reaches any
 * query. Nothing from the caller is ever interpolated into SQL.
 */

import { currentActor } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { coerceFilters } from '@/lib/purchase-orders/filters';
import { loadSourcingAnalysis } from '@/lib/sourcing/analysis';
import { loadProjectLines } from '@/lib/sourcing/queries';
import {
  DEFAULT_REQUEST,
  PRESETS,
  type Preset,
  type ProjectType,
  type ProjectEvidence,
  type SourcingAnalysis,
  type SourcingRequest,
} from '@/lib/sourcing/types';

const log = logger('sourcing-actions');

const PROJECT_TYPES: ProjectType[] = ['consolidation', 'tender', 'leakage', 'maverick', 'service'];

/** Longest window the board will accept. The warehouse starts in July 2021. */
const MAX_LOOKBACK_MONTHS = 72;

/** Narrows an unknown payload to a usable request, rebuilding every field rather than spreading. */
function coerceRequest(raw: unknown): SourcingRequest {
  const src = (raw ?? {}) as Partial<Record<keyof SourcingRequest, unknown>>;

  const preset: Preset =
    typeof src.preset === 'string' && src.preset in PRESETS ? (src.preset as Preset) : DEFAULT_REQUEST.preset;

  const months = Number(src.lookbackMonths);
  const lookbackMonths =
    Number.isFinite(months) && months >= 1
      ? Math.min(Math.round(months), MAX_LOOKBACK_MONTHS)
      : DEFAULT_REQUEST.lookbackMonths;

  const spend = Number(src.minSpendUsd);
  const minSpendUsd = Number.isFinite(spend) && spend >= 0 ? spend : null;

  const types = Array.isArray(src.types)
    ? src.types.filter((t): t is ProjectType => PROJECT_TYPES.includes(t as ProjectType))
    : [];

  return {
    filters: coerceFilters(src.filters),
    preset,
    minSpendUsd,
    lookbackMonths,
    types,
    includeServices: src.includeServices === true,
  };
}

export async function fetchSourcingAnalysis(raw: unknown): Promise<SourcingAnalysis | null> {
  const actor = await currentActor();
  if (!actor?.isPlatformAdmin) return null;
  try {
    return await loadSourcingAnalysis(coerceRequest(raw));
  } catch (err) {
    log.error('analysis.failed', err);
    return null;
  }
}

/**
 * The PO lines behind one project.
 *
 * Takes the same request that produced the board so the evidence is drawn from the identical
 * window, filters and hygiene — lines that did not add up to the figures they are supposed to
 * justify would be worse than no evidence at all.
 *
 * `country` and `groupKey` are bound parameters inside the query; neither is interpolated.
 */
export async function fetchProjectEvidence(
  rawRequest: unknown,
  rawTarget: unknown,
): Promise<ProjectEvidence | null> {
  const actor = await currentActor();
  if (!actor?.isPlatformAdmin) return null;

  const t = (rawTarget ?? {}) as Record<string, unknown>;
  const country = typeof t.country === 'string' ? t.country : '';
  const groupKey = typeof t.groupKey === 'string' ? t.groupKey : '';
  if (!country || !groupKey) return null;

  const req = coerceRequest(rawRequest);
  try {
    return await loadProjectLines(
      { filters: req.filters, lookbackMonths: req.lookbackMonths },
      { country, groupKey, isService: t.isService === true },
    );
  } catch (err) {
    log.error('evidence.failed', err);
    return null;
  }
}
