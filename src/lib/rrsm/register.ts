/**
 * What a valid register line and a valid supplier look like.
 *
 * A plain module, not `'use server'`, so the editor form can run the same checks before it sends
 * anything and the actions can run them again on what actually arrives. The form's copy is a
 * courtesy; the actions' copy is the rule.
 *
 * Kept free of any country's quirks on purpose. Each country's register is loaded separately for
 * now, and the plan is to standardise them later: rules that only hold for one country's source
 * workbook belong in that country's import, not here.
 */

export type OperatingModel = 'shared_support' | 'segment_based';

export const OPERATING_MODEL_LABEL: Record<OperatingModel, string> = {
  segment_based: 'Segment based',
  shared_support: 'Shared support',
};

/** The editable fields of a register line, as the form holds them: strings throughout. */
export interface ServiceLineDraft {
  supplierCode: string;
  description: string;
  assetRef: string;
  serviceNumber: string;
  segment: string;
  costCenter: string;
  costCenterName: string;
  entity: string;
  purchasingGroup: string;
  plant: string;
  operatingModel: string;
  uom: string;
  rate: string;
  paymentTerms: string;
  startsOn: string;
  contractEndsOn: string;
  ownerEmail: string;
  requesterEmail: string;
}

/** The same line, cleaned and typed, as the database takes it. */
export interface ServiceLineValues {
  supplierCode: string;
  description: string;
  assetRef: string | null;
  serviceNumber: string | null;
  segment: string;
  costCenter: string;
  costCenterName: string | null;
  entity: string | null;
  purchasingGroup: string | null;
  plant: string | null;
  operatingModel: OperatingModel;
  uom: string;
  rate: number | null;
  paymentTerms: string | null;
  startsOn: string | null;
  contractEndsOn: string | null;
  ownerEmail: string | null;
  requesterEmail: string | null;
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type Checked<T, K extends string> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldErrors<K> };

export const EMPTY_LINE_DRAFT: ServiceLineDraft = {
  supplierCode: '',
  description: '',
  assetRef: '',
  serviceNumber: '',
  segment: '',
  costCenter: '',
  costCenterName: '',
  entity: '',
  purchasingGroup: '',
  plant: '',
  operatingModel: 'segment_based',
  uom: 'month',
  rate: '',
  paymentTerms: '',
  startsOn: '',
  contractEndsOn: '',
  ownerEmail: '',
  requesterEmail: '',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Trimmed, with runs of whitespace (including the non-breaking spaces Excel leaves) collapsed. */
export function clean(v: unknown): string {
  return String(v ?? '')
    .replace(/[\s ]+/g, ' ')
    .trim();
}

function orNull(v: string): string | null {
  return v ? v : null;
}

/** True for a real calendar date written yyyy-mm-dd. "2026-02-30" is not one. */
export function isIsoDate(v: string): boolean {
  if (!ISO_DATE.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function isEmail(v: string): boolean {
  return EMAIL.test(v);
}

/**
 * A SAP vendor code as the register keys it: trimmed, and unpadded when it is all digits.
 *
 * SAP shows `0000100482` in some extracts and `100482` in others. The register keys suppliers by
 * code, so the two would otherwise be two suppliers with the same name.
 */
export function normalizeVendorCode(v: unknown): string {
  const s = clean(v).toUpperCase();
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s;
}

/**
 * A rate as typed: blank means "not agreed yet", which the register allows (the cycle then values
 * the line at zero and says so). Thousands separators are accepted because people paste them.
 */
export function parseRate(v: string): { ok: true; value: number | null } | { ok: false } {
  const s = clean(v).replace(/,/g, '');
  if (!s) return { ok: true, value: null };
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return { ok: false };
  const n = Number(s);
  /* NUMERIC(14, 3): eleven digits before the point. */
  if (!Number.isFinite(n) || n >= 1e11) return { ok: false };
  return { ok: true, value: n };
}

/**
 * Check and clean one register line.
 *
 * `uoms` is the list of units the database holds, passed in rather than hard-coded because the
 * table is meant to grow (headcount for accommodation was the first example given).
 */
export function checkServiceLine(
  draft: ServiceLineDraft,
  uoms: readonly string[],
): Checked<ServiceLineValues, keyof ServiceLineDraft> {
  const d = Object.fromEntries(
    Object.entries(draft).map(([k, v]) => [k, clean(v)]),
  ) as unknown as ServiceLineDraft;
  const errors: FieldErrors<keyof ServiceLineDraft> = {};

  const supplierCode = normalizeVendorCode(d.supplierCode);
  if (!supplierCode) errors.supplierCode = 'Pick a supplier.';

  if (!d.description) errors.description = 'Describe the asset or service.';
  else if (d.description.length > 200) errors.description = 'Keep it under 200 characters.';

  if (!d.segment) errors.segment = 'The segment the cost lands on.';
  if (!d.costCenter) errors.costCenter = 'The cost center the cost lands on.';

  if (d.operatingModel !== 'shared_support' && d.operatingModel !== 'segment_based')
    errors.operatingModel = 'Pick an operating model.';

  if (!uoms.includes(d.uom)) errors.uom = 'Pick a unit.';

  const rate = parseRate(d.rate);
  if (!rate.ok) errors.rate = 'A number, up to three decimals.';

  if (d.startsOn && !isIsoDate(d.startsOn)) errors.startsOn = 'Not a date.';
  if (d.contractEndsOn && !isIsoDate(d.contractEndsOn)) errors.contractEndsOn = 'Not a date.';
  if (
    !errors.startsOn &&
    !errors.contractEndsOn &&
    d.startsOn &&
    d.contractEndsOn &&
    d.contractEndsOn < d.startsOn
  )
    errors.contractEndsOn = 'Ends before it starts.';

  const ownerEmail = d.ownerEmail.toLowerCase();
  const requesterEmail = d.requesterEmail.toLowerCase();
  if (ownerEmail && !isEmail(ownerEmail)) errors.ownerEmail = 'Not an email address.';
  if (requesterEmail && !isEmail(requesterEmail)) errors.requesterEmail = 'Not an email address.';

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      supplierCode,
      description: d.description,
      assetRef: orNull(d.assetRef.toUpperCase()),
      serviceNumber: orNull(d.serviceNumber),
      segment: d.segment.toUpperCase(),
      costCenter: d.costCenter.toUpperCase(),
      costCenterName: orNull(d.costCenterName),
      entity: orNull(d.entity),
      purchasingGroup: orNull(d.purchasingGroup),
      plant: orNull(d.plant),
      operatingModel: d.operatingModel as OperatingModel,
      uom: d.uom,
      rate: rate.ok ? rate.value : null,
      paymentTerms: orNull(d.paymentTerms.toUpperCase()),
      startsOn: orNull(d.startsOn),
      contractEndsOn: orNull(d.contractEndsOn),
      ownerEmail: orNull(ownerEmail),
      requesterEmail: orNull(requesterEmail),
    },
  };
}

/** The draft a saved line opens as in the form. */
export function draftFromValues(v: ServiceLineValues): ServiceLineDraft {
  return {
    supplierCode: v.supplierCode,
    description: v.description,
    assetRef: v.assetRef ?? '',
    serviceNumber: v.serviceNumber ?? '',
    segment: v.segment,
    costCenter: v.costCenter,
    costCenterName: v.costCenterName ?? '',
    entity: v.entity ?? '',
    purchasingGroup: v.purchasingGroup ?? '',
    plant: v.plant ?? '',
    operatingModel: v.operatingModel,
    uom: v.uom,
    rate: v.rate === null ? '' : String(v.rate),
    paymentTerms: v.paymentTerms ?? '',
    startsOn: v.startsOn ?? '',
    contractEndsOn: v.contractEndsOn ?? '',
    ownerEmail: v.ownerEmail ?? '',
    requesterEmail: v.requesterEmail ?? '',
  };
}

/**
 * The fields that moved between two versions of a line, as {field: [before, after]}.
 *
 * What goes in the register log. Compares cleaned values, so retyping a field with a trailing
 * space is not a change.
 */
export function diffValues<T extends object>(
  before: T,
  after: T,
): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    const a = before[key] ?? null;
    const b = after[key] ?? null;
    if (a !== b) out[String(key)] = [a, b];
  }
  return out;
}

/**
 * An off-hire date: a real date, not before the line started, and not in the future.
 *
 * Not in the future because opening a cycle skips every line that has an off-hire date at all,
 * so a date set ahead of time would drop the line from the very next month while it is still on
 * site. The date is recorded when the asset has actually gone.
 */
export function checkOffHireDate(
  date: string,
  startsOn: string | null,
  today: Date,
): { ok: true } | { ok: false; error: string } {
  const d = clean(date);
  if (!isIsoDate(d)) return { ok: false, error: 'Not a date.' };
  if (startsOn && d < startsOn) return { ok: false, error: 'Before the line started.' };
  if (d > today.toISOString().slice(0, 10))
    return { ok: false, error: 'Record it once it has gone, not ahead of time.' };
  return { ok: true };
}

/* ─── suppliers ──────────────────────────────────────────────────────────────────────────── */

export interface SupplierDraft {
  code: string;
  name: string;
  /** As typed: one or many, separated by commas, semicolons, spaces or new lines. */
  contactEmails: string;
}

export interface SupplierValues {
  code: string;
  name: string;
  contactEmails: string[];
}

/** Every address in what was typed, lower-cased and de-duplicated, in the order given. */
export function splitEmails(v: string): string[] {
  const seen = new Set<string>();
  for (const part of String(v ?? '').split(/[\s,;]+/)) {
    const e = part.trim().toLowerCase();
    if (e) seen.add(e);
  }
  return [...seen];
}

export function checkSupplier(
  draft: SupplierDraft,
): Checked<SupplierValues, keyof SupplierDraft> {
  const errors: FieldErrors<keyof SupplierDraft> = {};
  const code = normalizeVendorCode(draft.code);
  const name = clean(draft.name);
  const emails = splitEmails(draft.contactEmails);

  if (!code) errors.code = 'The SAP vendor code.';
  else if (!/^[A-Z0-9-]{1,20}$/.test(code)) errors.code = 'Letters and digits only, up to 20.';
  if (!name) errors.name = 'The supplier’s name.';
  else if (name.length > 200) errors.name = 'Keep it under 200 characters.';

  const bad = emails.filter((e) => !isEmail(e));
  if (bad.length) errors.contactEmails = `Not an email address: ${bad.join(', ')}`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { code, name, contactEmails: emails } };
}
