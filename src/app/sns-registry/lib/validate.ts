import type { Draft } from './types';

/**
 * Completeness rules for leaving Draft.
 *
 * Shared deliberately: the wizard uses it to grey out "Submit" and list what is
 * still missing, and the server actions use it to reject a submission that
 * never went through the wizard. A `'use server'` export is a public POST
 * endpoint, so a browser-only check is no check at all — this module is the one
 * place the rules live so the two sides cannot drift apart.
 *
 * Returns the list of missing items, empty when the draft may be submitted.
 */
export function validateForSubmission(draft: Draft): string[] {
  const missing: string[] = [];
  if (!draft.country) missing.push('country');
  if (!draft.nodes.length) missing.push('taxonomy scope');
  if (!draft.segments.length) missing.push('at least one segment tag');
  if (!draft.supplierId.trim() || !draft.supplierName.trim()) missing.push('supplier SAP ID and name');
  if (!draft.reason) missing.push('reason code');
  if (!draft.justification.trim()) missing.push('justification narrative');
  return missing;
}

/** The same rules phrased as a single sentence, for a server-side error. */
export function submissionError(missing: string[]): string {
  return `This record cannot be submitted yet — still required: ${missing.join(', ')}.`;
}
