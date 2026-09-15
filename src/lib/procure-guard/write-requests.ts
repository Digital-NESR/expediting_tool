/**
 * The one place adhoc / advance request payloads are validated and written.
 *
 * This replaces six near-identical ~100-line validate-and-write blocks (create, update and
 * admin-create, for each request type) that each restated the same 35-column list.
 *
 * SECURITY, load-bearing: `spend_value_usd` is computed HERE, on the server, as
 * `toUsd(amount, currency)` with the currency validated against CURRENCY_OPTIONS. It is never read
 * from the client. That value decides which approval gates a request must clear, so a client-supplied
 * one let a tampered call skip the Treasury, Corporate Controller and CFO steps. Because the only way
 * to obtain a normalised payload is through normaliseAdhocInput / normaliseAdvanceInput, every write
 * path gets it — there is no longer a path that could forget.
 *
 * A plain module, deliberately NOT `'use server'`: these write rows, so they stay behind the actions'
 * auth guards. The SQL is carried over byte-for-byte from the old actions file.
 */
import { toUsd } from '@/lib/procureGuard-utils';
import type { CreateAdhocPaymentInput, CreateAdvancePaymentInput, ProcureGuardStatus } from '@/types/procureGuard';
import { exec } from './internals';
import type { ExecResult } from './internals';
import { insertProcureGuardPaymentRequest } from './schema';
import {
  blankToNull,
  normalizeRequesterNotificationEmails,
  requireCountryOption,
  requireText,
  validateCurrency,
  validateEmailTestRouting,
  validateMoney,
  validateNonNegativeNumber,
} from './validation';

type EmailTestRouting = { recipients: string[]; overrides: Record<string, string[]> };

interface NormalisedCommon {
  amount: number;
  currency: string;
  /** Server-computed from amount + validated currency. NEVER accepted from the client. */
  spendValueUsd: number;
  requisitionNumber: string;
  country: string;
  segment: string;
  vendorName: string;
  spendCategory: string;
  reason: string;
  requesterNotificationEmails: string[];
  emailTestRouting: EmailTestRouting;
}

export interface NormalisedAdhocInput extends NormalisedCommon {
  vendorTaxId: string;
}

export interface NormalisedAdvanceInput extends NormalisedCommon {
  sapVendorId: string;
  paymentTermsDays: number;
  creditLimitUsd: number;
  contractValue: number | null;
  advancePercentage: number | null;
}

/**
 * Validates an adhoc payload. The field order is the order the old create/update/admin-create blocks
 * validated in, so the first error message a bad payload gets is unchanged.
 *
 * `requesterEmail` is whose address is excluded from the notification list: the actor on create, the
 * stored requester on update, the (possibly overridden) requester on admin-create.
 * `requireAcknowledgement` is false only for admin-create, which never had that check.
 */
export function normaliseAdhocInput(
  input: CreateAdhocPaymentInput,
  options: { requesterEmail: string | null | undefined; requireAcknowledgement: boolean },
): NormalisedAdhocInput {
  const amount = validateMoney(input.amount);
  const currency = validateCurrency(input.currency);
  const requisitionNumber = requireText(input.requisition_number, 'Requisition number');
  const country = requireCountryOption(input.country);
  const segment = requireText(input.segment, 'Segment');
  const vendorName = requireText(input.vendor_name, 'ADHOC vendor name');
  const vendorTaxId = requireText(input.vendor_tax_id, 'Vendor tax ID');
  const spendCategory = requireText(input.spend_category, 'Spend category');
  const reason = requireText(input.payment_reason || input.justification, 'Reason / justification of exception');
  if (options.requireAcknowledgement && !input.acknowledged) throw new Error('Acknowledgement is required.');
  const requesterNotificationEmails = normalizeRequesterNotificationEmails(input.requester_notification_emails, options.requesterEmail);
  const emailTestRouting = validateEmailTestRouting(input.email_test_mode, input.email_test_recipients, input.email_test_recipient_overrides);

  return {
    amount,
    currency,
    spendValueUsd: toUsd(amount, currency),
    requisitionNumber,
    country,
    segment,
    vendorName,
    vendorTaxId,
    spendCategory,
    reason,
    requesterNotificationEmails,
    emailTestRouting,
  };
}

/** Validates an advance payload, in the same field order the three old blocks used. */
export function normaliseAdvanceInput(
  input: CreateAdvancePaymentInput,
  options: { requesterEmail: string | null | undefined },
): NormalisedAdvanceInput {
  const amount = validateMoney(input.amount);
  const currency = validateCurrency(input.currency);
  const requisitionNumber = requireText(input.requisition_number, 'Requisition number');
  const country = requireCountryOption(input.country);
  const segment = requireText(input.segment, 'Segment');
  const sapVendorId = requireText(input.sap_vendor_id || input.vendor_code, 'SAP vendor ID');
  const vendorName = requireText(input.vendor_name, 'SAP vendor name');
  const spendCategory = requireText(input.spend_category, 'Spend category');
  const paymentTermsDays = validateNonNegativeNumber(input.current_payment_terms_days, 'Current payment terms in days');
  const creditLimitUsd = validateNonNegativeNumber(input.current_credit_limit_usd, 'Current credit limit in USD');
  const reason = requireText(input.advance_purpose || input.justification, 'Reason / justification for exception');
  const requesterNotificationEmails = normalizeRequesterNotificationEmails(input.requester_notification_emails, options.requesterEmail);
  const emailTestRouting = validateEmailTestRouting(input.email_test_mode, input.email_test_recipients, input.email_test_recipient_overrides);

  // Neither of these can throw, so computing them here matches all three old call sites regardless
  // of where in the block they used to sit.
  const contractValue = input.contract_value === undefined || input.contract_value === null || Number.isNaN(Number(input.contract_value))
    ? null
    : Number(input.contract_value);
  const advancePercentage = input.advance_percentage === undefined || input.advance_percentage === null || Number.isNaN(Number(input.advance_percentage))
    ? null
    : Number(input.advance_percentage);

  return {
    amount,
    currency,
    spendValueUsd: toUsd(amount, currency),
    requisitionNumber,
    country,
    segment,
    sapVendorId,
    vendorName,
    spendCategory,
    paymentTermsDays,
    creditLimitUsd,
    reason,
    requesterNotificationEmails,
    emailTestRouting,
    contractValue,
    advancePercentage,
  };
}

// The status slot is the ONLY difference between the requester-create and admin-create statements:
// the requester path writes the literal 'Submitted', the admin path binds a parameter. Both produce
// exactly the statement that path sent before, so no query text changed.
const adhocInsertSql = (statusSql: string) => `INSERT INTO procure_guard_adhoc_payments
        (reference_number, requisition_number, status, priority, vendor_name, vendor_code, vendor_tax_id, supplier_email,
         amount, currency, country, segment, department, business_unit, cost_center, project_code,
         po_number, invoice_number, due_date, expense_category, spend_category, spend_value_usd, payment_method,
         payment_reason, justification, notes, attachment_link, cc_email, requester_notification_emails, email_test_mode, email_test_recipients, email_test_recipient_overrides, acknowledged_at,
         requested_by_name, requested_by_email)
       VALUES (?, ?, ${statusSql}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, CURRENT_TIMESTAMP, ?, ?) RETURNING id`;

const advanceInsertSql = (statusSql: string) => `INSERT INTO procure_guard_advance_payments
        (reference_number, requisition_number, status, priority, vendor_name, vendor_code, sap_vendor_id, supplier_email,
         amount, currency, country, segment, department, business_unit, cost_center, project_code,
         contract_reference, po_number, contract_value, advance_percentage, spend_category, spend_value_usd,
         current_payment_terms_days, current_credit_limit_usd,
         expected_invoice_date, expected_settlement_date, recovery_method,
         advance_purpose, justification, notes, attachment_link, cc_email, requester_notification_emails, email_test_mode, email_test_recipients, email_test_recipient_overrides,
         requested_by_name, requested_by_email)
       VALUES (?, ?, ${statusSql}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?) RETURNING id`;

// The follow-up write every create path ran: requester_comments is set after the insert rather than
// in it, so the column list above stays the one shape.
async function writeRequesterComments(
  table: 'procure_guard_adhoc_payments' | 'procure_guard_advance_payments',
  id: number,
  input: { requester_comments?: string | null; notes?: string | null },
): Promise<void> {
  await exec(
    `UPDATE ${table}
       SET requester_comments = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    [blankToNull(input.requester_comments ?? input.notes), id],
  );
}

export async function insertAdhocRequest(params: {
  input: CreateAdhocPaymentInput;
  normalised: NormalisedAdhocInput;
  department: string | null | undefined;
  /** null keeps the requester path's `'Submitted'` literal; a value binds the admin path's parameter. */
  status: ProcureGuardStatus | null;
  requestedByName: string;
  requestedByEmail: string;
}): Promise<ExecResult & { reference: string }> {
  const { input, normalised: n } = params;
  const result = await insertProcureGuardPaymentRequest('ADH', reference => exec(
    adhocInsertSql(params.status === null ? `'Submitted'` : '?'),
    [
      reference,
      n.requisitionNumber,
      ...(params.status === null ? [] : [params.status]),
      input.priority || 'Normal',
      n.vendorName,
      blankToNull(input.vendor_code || n.vendorTaxId),
      n.vendorTaxId,
      blankToNull(input.supplier_email),
      n.amount,
      n.currency,
      n.country,
      n.segment,
      blankToNull(params.department),
      blankToNull(input.business_unit),
      blankToNull(input.cost_center),
      blankToNull(input.project_code),
      blankToNull(input.po_number),
      blankToNull(input.invoice_number),
      blankToNull(input.due_date),
      blankToNull(input.expense_category),
      n.spendCategory,
      n.spendValueUsd,
      blankToNull(input.payment_method),
      n.reason,
      (input.justification || n.reason).trim(),
      blankToNull(input.notes),
      blankToNull(input.attachment_link),
      null,
      n.requesterNotificationEmails,
      Boolean(input.email_test_mode),
      n.emailTestRouting.recipients,
      JSON.stringify(n.emailTestRouting.overrides),
      params.requestedByName,
      params.requestedByEmail,
    ],
  ));
  await writeRequesterComments('procure_guard_adhoc_payments', result.insertId, input);
  return result;
}

export async function insertAdvanceRequest(params: {
  input: CreateAdvancePaymentInput;
  normalised: NormalisedAdvanceInput;
  department: string | null | undefined;
  /** null keeps the requester path's `'Submitted'` literal; a value binds the admin path's parameter. */
  status: ProcureGuardStatus | null;
  requestedByName: string;
  requestedByEmail: string;
}): Promise<ExecResult & { reference: string }> {
  const { input, normalised: n } = params;
  const result = await insertProcureGuardPaymentRequest('ADV', reference => exec(
    advanceInsertSql(params.status === null ? `'Submitted'` : '?'),
    [
      reference,
      n.requisitionNumber,
      ...(params.status === null ? [] : [params.status]),
      input.priority || 'Normal',
      n.vendorName,
      n.sapVendorId,
      n.sapVendorId,
      blankToNull(input.supplier_email),
      n.amount,
      n.currency,
      n.country,
      n.segment,
      blankToNull(params.department),
      blankToNull(input.business_unit),
      blankToNull(input.cost_center),
      blankToNull(input.project_code),
      blankToNull(input.contract_reference),
      blankToNull(input.po_number),
      n.contractValue,
      n.advancePercentage,
      n.spendCategory,
      n.spendValueUsd,
      n.paymentTermsDays,
      n.creditLimitUsd,
      blankToNull(input.expected_invoice_date),
      blankToNull(input.expected_settlement_date),
      blankToNull(input.recovery_method),
      n.reason,
      (input.justification || n.reason).trim(),
      blankToNull(input.notes),
      blankToNull(input.attachment_link),
      null,
      n.requesterNotificationEmails,
      Boolean(input.email_test_mode),
      n.emailTestRouting.recipients,
      JSON.stringify(n.emailTestRouting.overrides),
      params.requestedByName,
      params.requestedByEmail,
    ],
  ));
  await writeRequesterComments('procure_guard_advance_payments', result.insertId, input);
  return result;
}

export async function updateAdhocRequest(id: number, input: CreateAdhocPaymentInput, n: NormalisedAdhocInput): Promise<void> {
  await exec(
    `UPDATE procure_guard_adhoc_payments
       SET requisition_number = ?,
           vendor_name = ?,
           vendor_code = ?,
           vendor_tax_id = ?,
           amount = ?,
           currency = ?,
           country = ?,
           segment = ?,
           expense_category = ?,
           spend_category = ?,
           spend_value_usd = ?,
           payment_method = ?,
           payment_reason = ?,
           justification = ?,
           notes = ?,
           requester_comments = ?,
           cc_email = ?,
           requester_notification_emails = ?,
           email_test_mode = ?,
           email_test_recipients = ?,
           email_test_recipient_overrides = ?::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    [
      n.requisitionNumber,
      n.vendorName,
      blankToNull(input.vendor_code || n.vendorTaxId),
      n.vendorTaxId,
      n.amount,
      n.currency,
      n.country,
      n.segment,
      n.spendCategory,
      n.spendCategory,
      n.spendValueUsd,
      blankToNull(input.payment_method),
      n.reason,
      (input.justification || n.reason).trim(),
      blankToNull(input.notes),
      blankToNull(input.requester_comments ?? input.notes),
      null,
      n.requesterNotificationEmails,
      Boolean(input.email_test_mode),
      n.emailTestRouting.recipients,
      JSON.stringify(n.emailTestRouting.overrides),
      id,
    ],
  );
}

export async function updateAdvanceRequest(id: number, input: CreateAdvancePaymentInput, n: NormalisedAdvanceInput): Promise<void> {
  await exec(
    `UPDATE procure_guard_advance_payments
       SET requisition_number = ?,
           vendor_name = ?,
           vendor_code = ?,
           sap_vendor_id = ?,
           amount = ?,
           currency = ?,
           country = ?,
           segment = ?,
           contract_value = ?,
           advance_percentage = ?,
           spend_category = ?,
           spend_value_usd = ?,
           current_payment_terms_days = ?,
           current_credit_limit_usd = ?,
           advance_purpose = ?,
           justification = ?,
           notes = ?,
           requester_comments = ?,
           cc_email = ?,
           requester_notification_emails = ?,
           email_test_mode = ?,
           email_test_recipients = ?,
           email_test_recipient_overrides = ?::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    [
      n.requisitionNumber,
      n.vendorName,
      n.sapVendorId,
      n.sapVendorId,
      n.amount,
      n.currency,
      n.country,
      n.segment,
      n.contractValue,
      n.advancePercentage,
      n.spendCategory,
      n.spendValueUsd,
      n.paymentTermsDays,
      n.creditLimitUsd,
      n.reason,
      (input.justification || n.reason).trim(),
      blankToNull(input.notes),
      blankToNull(input.requester_comments ?? input.notes),
      null,
      n.requesterNotificationEmails,
      Boolean(input.email_test_mode),
      n.emailTestRouting.recipients,
      JSON.stringify(n.emailTestRouting.overrides),
      id,
    ],
  );
}

/** Resubmit: send a rejected request back to the start of the approval chain and clear the rejection trail. */
export async function resetRejectedRequest(
  table: 'procure_guard_adhoc_payments' | 'procure_guard_advance_payments',
  id: number,
): Promise<void> {
  await exec(
    `UPDATE ${table}
           SET status = 'Submitted', rejection_reason = NULL, reviewed_by_name = NULL,
               reviewed_by_email = NULL, reviewed_at = NULL, review_comments = NULL,
               reminder_7d_sent_at = NULL, reminder_14d_sent_at = NULL,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
    [id],
  );
}
