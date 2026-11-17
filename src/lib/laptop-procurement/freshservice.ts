import {
  EXCEPTIONAL_DEVICE_MODEL,
  EXCEPTIONAL_DEVICE_PRICE_USD,
} from '@/lib/laptopProcurement-utils';
import { stripEnvQuotes } from '@/lib/laptop-procurement/notifications';
import type { LaptopRequest } from '@/types/laptopProcurement';

export { stripEnvQuotes };

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
 * against a live request (INC-144437). They are bare names — `country`, not
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

/**
 * Exactly what place_request accepts, and nothing else.
 *
 * `cc_emails` used to be here, to keep the country's other IT Managers on the
 * thread. Freshservice rejects it outright:
 *
 *   400 {"field":"cc_emails","message":"Unexpected/invalid field in request",
 *        "code":"invalid_field"}
 *
 * It is documented on Tickets, not on service catalog requests, and this
 * endpoint refuses any field it does not know. That went unnoticed for a while
 * because the field is omitted when the list is empty, and in test mode the
 * list is always empty — so the first request with a real second IT Manager was
 * also the first to send it, and the first to fail.
 *
 * Which is why this type is the contract rather than a convenience: the
 * workflow forwards this object to Freshservice verbatim, so any key added here
 * that Freshservice does not accept fails the whole WIP, not just that field.
 */
export interface WipPayload {
  /** The Freshservice requester the WIP is raised under. */
  email: string;
  custom_fields: WipCustomFields;
}

/**
 * What the workflow is posted: the Freshservice payload, plus what only n8n
 * needs and Freshservice must never see.
 *
 * The separation is the point. The workflow names `email` and `custom_fields`
 * explicitly when it calls place_request, so anything added here stays with
 * n8n — which is what makes it safe to send at all, and what the cc_emails
 * failure cost us when the body was forwarded whole.
 */
export interface WipWebhookBody extends WipPayload {
  /**
   * Everyone to tell once the WIP exists.
   *
   * Freshservice mails only the requester, and place_request has no CC field
   * to add anyone else — so the country's other IT Managers would otherwise
   * hear about a failed WIP and never about a successful one.
   */
  notify_emails?: string[];
}

/**
 * Everyone who should be told about this WIP, requester first.
 *
 * De-duplicated case-insensitively so an IT Manager filling two matrix slots,
 * or the slot that is also the requester, is not mailed twice.
 */
export function wipNotifyList(
  requesterEmail: string,
  others: (string | null | undefined)[],
): string[] {
  const email = requesterEmail.trim();
  const rest = otherRecipients(email, others);
  return email ? [email, ...rest] : rest;
}

/**
 * The model a requester picks when no catalogued device fits.
 *
 * Defined in laptopProcurement-utils so the admin price editor can name it
 * without importing this module, which reaches server-only code.
 */
export const EXCEPTIONAL_MODEL = EXCEPTIONAL_DEVICE_MODEL;

/**
 * What an exceptional device is worth on the WIP: one dollar.
 *
 * Not zero, and not blank. The field is a mandatory decimal, so it has to carry
 * a number; zero would read as "this device was free" and is indistinguishable
 * from an unfilled field. A dollar is obviously a placeholder — nobody mistakes
 * it for a real laptop price — so it satisfies the form while telling whoever
 * handles the WIP that the figure still has to be established.
 */
export const EXCEPTIONAL_UNIT_PRICE_USD = EXCEPTIONAL_DEVICE_PRICE_USD;

/**
 * The prices that are rules rather than data.
 *
 * Consulted before the price table and never overridden by it. The exceptional
 * model is a nominal dollar by policy, and no admin should have to key a row
 * for a device nobody can describe yet — by definition it is not known until
 * the request exists.
 *
 * `null` means "no rule applies, ask the table". Country is not a parameter
 * because none of these rules vary by it: an exceptional device is a dollar
 * everywhere.
 */
export function fixedUnitPriceUsd(model: string): number | null {
  return model.trim() === EXCEPTIONAL_MODEL ? EXCEPTIONAL_UNIT_PRICE_USD : null;
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

  return {
    ok: true,
    payload: {
      email,
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

/**
 * De-duplicated case-insensitively, with `primary` dropped: they are already
 * the recipient, and would otherwise be mailed twice.
 */
function otherRecipients(primary: string, candidates: (string | null | undefined)[]): string[] {
  const seen = new Set<string>([primary.trim().toLowerCase()]);
  const out: string[] = [];
  for (const raw of candidates) {
    const addr = (raw ?? '').trim();
    const key = addr.toLowerCase();
    if (!addr || seen.has(key)) continue;
    seen.add(key);
    out.push(addr);
  }
  return out;
}

/** Stands in for a field the request never filled, so the email reads honestly. */
export const WIP_UNKNOWN = '—';

/**
 * What the workflow is sent when the WIP could not even be built.
 *
 * Not a Freshservice payload — it is never forwarded to the service desk. It
 * exists so the three failures that happen *before* the Freshservice call still
 * reach a person: a missing model or price, no IT Manager configured for the
 * country, or test mode left half-configured. n8n's own failure email only
 * fires once Freshservice has rejected something, so without this those three
 * are silent, and the request screen is the only place they exist — visible
 * only to whoever happens to open that request.
 *
 * The field names mirror the real payload so the workflow's existing email can
 * render either one, and the missing values carry a dash rather than an empty
 * string so the table shows what was absent instead of looking merely blank.
 */
export interface WipProblemPayload {
  problem: string;
  email: string;
  cc_emails?: string[];
  custom_fields: Record<string, string | number>;
}

export function buildWipProblemPayload(
  request: LaptopRequest,
  reason: string,
  ownerEmail: string,
  ccEmails: (string | null | undefined)[] = [],
  priceUsd: number | null = null,
): WipProblemPayload {
  const email = ownerEmail.trim();
  const cc = otherRecipients(email, ccEmails);
  return {
    problem: reason,
    email,
    ...(cc.length ? { cc_emails: cc } : {}),
    custom_fields: {
      country: request.country?.trim() || WIP_UNKNOWN,
      company_code: request.company_code?.trim() || WIP_UNKNOWN,
      cost_center: request.cost_center?.trim() || WIP_UNKNOWN,
      name: wipName(request),
      model: request.requested_model?.trim() || WIP_UNKNOWN,
      quantity: WIP_QUANTITY,
      total_value_usd: priceUsd != null && priceUsd > 0 ? priceUsd : WIP_UNKNOWN,
    },
  };
}
