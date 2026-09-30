/**
 * One customs reference, one shipment.
 *
 * A plain module so the comparison rule has a single definition and can be tested without a
 * database: the form and the bulk migration both write shipments, and a guard that lives in only
 * one of them is a guard that the other route walks around.
 *
 * Scoped to a country on purpose. A customs reference is issued by one country's authority, so two
 * countries can legitimately hand out the same string and a global uniqueness rule would refuse a
 * shipment that is perfectly correct.
 */

/**
 * The form the comparison happens in.
 *
 * Trimmed and upper-cased, because the same declaration reached the register as `DECTIM1805…` and
 * ` dectim1805… ` often enough that a literal comparison would have called them different numbers.
 * Returns null for anything with no characters in it: a blank reference is not a duplicate of
 * another blank one, and hundreds of shipments could legitimately carry none.
 */
export function normaliseCustomsReference(value: unknown): string | null {
  const s = String(value ?? '').trim().toUpperCase();
  return s.length ? s : null;
}

/** What a caller is told when the reference is already on another shipment in the same country. */
export function duplicateCustomsReferenceMessage(
  customsReference: string,
  existingReference: string,
): string {
  return `Customs reference ${customsReference.trim()} is already on shipment ${existingReference}. Two shipments cannot share one declaration, so the deposit and the shipment count would both be counted twice.`;
}

/**
 * Thrown from inside the create transaction so the insert rolls back with it.
 *
 * A class rather than a returned value because the check happens under the same advisory lock as
 * the reference-number sequence, several calls deep inside the transaction, and unwinding a result
 * back out through that would mean giving every step in between a way to say "nothing went wrong
 * but stop anyway".
 */
export class DuplicateCustomsReferenceError extends Error {
  readonly existingReference: string;

  constructor(customsReference: string, existingReference: string) {
    super(duplicateCustomsReferenceMessage(customsReference, existingReference));
    this.name = 'DuplicateCustomsReferenceError';
    this.existingReference = existingReference;
  }
}
