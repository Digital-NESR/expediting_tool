/* ─── Validation and the INSERT behind a new request, plus the per-stage column maps the status
   transitions write through. ─── */

import type {
  CreateLaptopRequestInput,
  LaptopRequestStatus,
  UpdateLaptopExistingDeviceInput,
} from '@/types/laptopProcurement';
import type { PoolClient } from 'pg';
import { execTx } from '@/lib/laptop-procurement/db';
import {
  blankToNull,
  getPendingWithLabel,
  requireOneOf,
  requireText,
} from '@/lib/laptop-procurement/internals';
import {
  COUNTRY_OPTIONS,
  DEVICE_TYPE_OPTIONS,
  REQUEST_TYPE_OPTIONS,
} from '@/lib/laptopProcurement-utils';

export function validateCreateInput(input: CreateLaptopRequestInput) {
  return {
    requestType: requireOneOf(input.request_type, REQUEST_TYPE_OPTIONS, 'Type of request'),
    country: requireOneOf(input.country, COUNTRY_OPTIONS, 'Country'),
    companyCode: requireText(input.company_code, 'Company Code'),
    // Optional: the static company-code reference table doesn't cover every real company
    // code an employee's directory record can report, which used to leave requesters with
    // this locked field permanently blank and no way to submit at all.
    companyName: blankToNull(input.company_name),
    costCenter: requireText(input.cost_center, 'Cost Center'),
    typeOfDevice: requireOneOf(input.type_of_device, DEVICE_TYPE_OPTIONS, 'Type of device'),
    // No longer collected from the requester — the IT Team fills this in later, only if
    // the request is actually flagged for new-device procurement (see submitProcureNewDetails).
    requestedModel: blankToNull(input.requested_model),
    reason: requireText(input.special_requirements, 'Special requirements / justification'),
  };
}

export async function insertRequest(
  input: CreateLaptopRequestInput & Partial<UpdateLaptopExistingDeviceInput>,
  opts: {
    // The reference was allocated under the advisory lock on this same client — the
    // insert has to stay on it so the two are one atomic step.
    client: PoolClient;
    reference: string;
    status: LaptopRequestStatus;
    requestedByName: string;
    requestedByEmail: string;
    validated: ReturnType<typeof validateCreateInput>;
  },
): Promise<number> {
  const v = opts.validated;
  // Existing Device fields are only ever set by an admin backfilling a request
  // (AdminCreateLaptopRequestInput) — the normal requester flow never collects
  // them; the IT Manager fills them in once the request reaches that stage.
  const result = await execTx(
    opts.client,
    `INSERT INTO laptop_requests
      (reference_number, employee_id, status, priority, request_type, indirect_request, pending_with, country,
       requested_by_name, requested_by_email, computer_for, computer_for_employee_id, department,
       company_code, company_name, cost_center, type_of_device, requested_model, special_requirements,
       unit_id, current_brand, current_model, serial_no, age_years, sap_number)
     VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      opts.reference,
      blankToNull(input.employee_id),
      opts.status,
      input.priority || 'Normal',
      v.requestType,
      getPendingWithLabel(opts.status),
      v.country,
      opts.requestedByName,
      opts.requestedByEmail,
      blankToNull(input.computer_for),
      blankToNull(input.computer_for_employee_id),
      blankToNull(input.department),
      v.companyCode,
      v.companyName,
      v.costCenter,
      v.typeOfDevice,
      v.requestedModel,
      v.reason,
      blankToNull(input.unit_id),
      blankToNull(input.current_brand),
      blankToNull(input.current_model),
      blankToNull(input.serial_no),
      blankToNull(input.age_years),
      blankToNull(input.sap_number),
    ],
  );
  return result.insertId;
}

export const STAGE_COMMENT_COLUMN: Partial<Record<LaptopRequestStatus, string>> = {
  Submitted: 'itm_comments',
  'IT Approval': 'itm_comments',
  'CM Approval': 'cm_comments',
  'IT Director Approval': 'itd_comments',
  'Supply Chain Director Approval': 'scd_comments',
};

// Same keying as STAGE_COMMENT_COLUMN — records which action a stage actually took
// (not just that it commented), so "Decisions" on the detail page can show the
// decision itself, not just infer it from other columns after the fact.
export const STAGE_DECISION_COLUMN: Partial<Record<LaptopRequestStatus, string>> = {
  Submitted: 'itm_decision',
  'IT Approval': 'itm_decision',
  'CM Approval': 'cm_decision',
  'IT Director Approval': 'itd_decision',
  'Supply Chain Director Approval': 'scd_decision',
};

// Human-readable name of whoever is rejecting, for the activity log — only stages with
// a reject option appear here (see getRejectStatusForStage).
export const REJECTING_STAGE_LABEL: Partial<Record<LaptopRequestStatus, string>> = {
  'CM Approval': 'Country Manager',
  'CM Confirm Device': 'Country Manager',
  'IT Director Approval': 'IT Director',
  'Supply Chain Director Approval': 'Supply Chain Director',
};
