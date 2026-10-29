import type { LaptopRequest } from '@/types/laptopProcurement';

/**
 * The WIP Creation Request raised in Freshservice once a laptop request is
 * fully approved.
 *
 * Freshservice holds the form as service catalog item 173 on
 * nesrsap.freshservice.com — NOT on servicedesk.nesr.com, which serves the
 * portal and 404s every /api/v2 path while still returning rate-limit headers,
 * so it looks like a bad path rather than a bad host.
 *
 *   POST /api/v2/service_catalog/items/173/place_request
 *
 * The seven field keys below were read from the item itself and confirmed
 * against a live request (SR-144437). They are bare names — `country`, not
 * `cf_country` — and a wrong key does not error: Freshservice accepts the
 * request and silently leaves the field blank. That is why they are pinned
 * here with tests rather than written inline at the call site.
 */

/** Service catalog item id for WIP Creation Request. */
export const WIP_SERVICE_ITEM_ID = 173;

/** Every laptop request is for exactly one device. */
export const WIP_QUANTITY = 1;

/**
 * The item's own fields. All seven are `required: true` on the Freshservice
 * form, which is why `buildWipPayload` refuses to send a partial one.
 *
 * `quantity` is a custom field here, not the native `quantity` on
 * place_request — the item has `allow_quantity: false`.
 */
export interface WipCustomFields {
  country: string;
  company_code: string;
  cost_center: string;
  name: string;
  model: string;
  quantity: number;
  total_value_usd: number;
}

export interface WipPayload {
  /** The Freshservice requester the WIP is raised under. */
  email: string;
  /**
   * Kept in the loop on the ticket thread — the IT Manager(s) for the
   * request's country, from laptop_approver_matrix, which holds up to three
   * named slots per country.
   *
   * Omitted entirely rather than sent empty: Freshservice's Outlook path has
   * form before, where an empty recipient turned into a blank address and the
   * whole message was rejected.
   */
  cc_emails?: string[];
  custom_fields: WipCustomFields;
}

/**
 * Unit price, USD.
 *
 * A placeholder until the per-country cost sheet is filled in. It is a function
 * rather than a constant so the call site is already written against a lookup:
 * when the sheet arrives this reads a `(model, country) -> price` table and
 * nothing above it changes.
 *
 * Returning `number | null` now, even though the placeholder never returns
 * null, keeps the unpriced path built and tested. Two cases will produce it for
 * real: the model 'Other (Exceptional case only)', which the sheet has a row
 * for but will never price, and the country 'Other', which has no column in the
 * sheet at all.
 */
const PLACEHOLDER_UNIT_PRICE_USD = 100;

export function unitPriceUsd(model: string, country: string): number | null {
  if (!model.trim() || !country.trim()) return null;
  return PLACEHOLDER_UNIT_PRICE_USD;
}

/**
 * The WIP's "Name / Description".
 *
 * Freshservice takes one free-text line, so the request's parts are composed
 * here. The reference number is the point: a WIP that cannot be traced back to
 * the request that justified it is the first thing finance will ask about.
 *
 * `computer_for` is not always a person — it holds a rig or unit on a Unit
 * request ("WHM-II ENI") and a name on a New Employee one. It falls back to
 * whoever raised the request rather than leaving a dangling "for".
 */
export function wipName(request: LaptopRequest): string {
  const device = request.type_of_device?.trim() || 'Device';
  const forWhom =
    request.computer_for?.trim() || request.requested_by_name?.trim() || request.requested_by_email;
  return `${device} for ${forWhom} — ${request.reference_number}`;
}

export type WipBuildResult = { ok: true; payload: WipPayload } | { ok: false; missing: string[] };

/**
 * Turns an approved laptop request into the payload, or says what is missing.
 *
 * Deliberately refuses rather than sending blanks. Every field is mandatory on
 * the Freshservice form, Freshservice no longer validates anything it is sent
 * — "keep all the attributes as free text, we will handle the drop downs from
 * our end and send only valid cost centres through the api" — and a WIP with a
 * blank cost centre surfaces as a problem in SAP days later rather than here.
 *
 * Pure and synchronous: the price lookup and the cost-centre check are done by
 * the caller, so this can be tested without a database.
 */
export function buildWipPayload(
  request: LaptopRequest,
  requesterEmail: string,
  priceUsd: number | null,
  ccEmails: (string | null | undefined)[] = [],
): WipBuildResult {
  const country = request.country?.trim() ?? '';
  const companyCode = request.company_code?.trim() ?? '';
  const costCenter = request.cost_center?.trim() ?? '';
  const model = request.requested_model?.trim() ?? '';
  const email = requesterEmail.trim();

  const missing: string[] = [];
  if (!email) missing.push('requester email');
  if (!country) missing.push('country');
  if (!companyCode) missing.push('company code');
  if (!costCenter) missing.push('cost center');
  if (!model) missing.push('model');
  // Zero is as wrong as absent: a WIP reading $0 looks like the device is free.
  if (priceUsd == null || !Number.isFinite(priceUsd) || priceUsd <= 0) {
    missing.push('total value (USD)');
  }
  if (missing.length) return { ok: false, missing };

  /* De-duplicated case-insensitively, and the requester is dropped: they are
     already on the ticket, and Freshservice would otherwise mail them twice. */
  const seen = new Set<string>([email.toLowerCase()]);
  const cc: string[] = [];
  for (const raw of ccEmails) {
    const addr = (raw ?? '').trim();
    const key = addr.toLowerCase();
    if (!addr || seen.has(key)) continue;
    seen.add(key);
    cc.push(addr);
  }

  return {
    ok: true,
    payload: {
      email,
      ...(cc.length ? { cc_emails: cc } : {}),
      custom_fields: {
        country,
        company_code: companyCode,
        cost_center: costCenter,
        name: wipName(request),
        model,
        quantity: WIP_QUANTITY,
        total_value_usd: priceUsd as number,
      },
    },
  };
}

/** Why a request could not be turned into a WIP, as one sentence. */
export function wipBuildError(missing: string[]): string {
  return `This request cannot raise a SAP WIP yet — missing: ${missing.join(', ')}.`;
}
