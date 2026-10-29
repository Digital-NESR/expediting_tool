import { describe, expect, it } from 'vitest';
import { APPROVER_MATRIX_COLUMNS } from '@/lib/procure-guard/approver-matrix';
import { getWorkflowSteps } from '@/lib/procureGuard-utils';
import type { ProcureGuardPermissionRole } from '@/types/procureGuard';

/**
 * The approver matrix against the workflow it is supposed to describe.
 *
 * Inserting SAP Team verification between the country SCM and the Supply Chain Director
 * changed three things that live in three places: the chain in procureGuard-utils, the
 * permission role enum in the database, and the `approval_status` written onto a recipient
 * row. Only the first was updated, and the other two failed in ways that looked unrelated —
 * one as "invalid input value for enum", the other as the Director being emailed to perform a
 * verification that is not theirs.
 *
 * These tests tie the matrix to the workflow so the next step inserted into the chain cannot
 * be half-wired in the same way.
 */

const ADHOC_STEPS = getWorkflowSteps('adhoc');
const ADVANCE_STEPS = getWorkflowSteps('advance', 500_000, 'USD');

describe('the approver matrix columns', () => {
  it('every column declares the status it is notified at', () => {
    for (const col of APPROVER_MATRIX_COLUMNS) {
      expect(col.approvalStatus, `${col.key} has no approvalStatus`).toBeTruthy();
    }
  });

  it('every declared status is a step in that request type"s workflow', () => {
    for (const col of APPROVER_MATRIX_COLUMNS) {
      const steps = col.requestType === 'adhoc' ? ADHOC_STEPS : ADVANCE_STEPS;
      expect(
        steps.map((s) => s.status),
        `${col.key} is filed against a status "${col.approvalStatus}" that ${col.requestType} never reaches`,
      ).toContain(col.approvalStatus);
    }
  });

  it('files each column against the step its own role owns', () => {
    /* Spelled out rather than matched by substring: the workflow's `owner` is a human label
       ("Country Supply Chain Manager") and `notificationRole` is a permission role ("SCM
       Manager"), and a fuzzy comparison between the two passes for the wrong reasons as often
       as the right ones. This table is the claim being made. */
    const OWNER_OF: Record<string, string> = {
      'SCM Manager': 'Country Supply Chain Manager',
      'SAP Team': 'SAP Team',
      'Country Controller': 'Country Finance Controller',
      'Supply Chain Director': 'Supply Chain Director',
      'Treasury Director': 'Treasury Director',
      'Corporate Controller': 'Corporate Controller',
      CFO: 'CFO',
    };
    for (const col of APPROVER_MATRIX_COLUMNS) {
      const steps = col.requestType === 'adhoc' ? ADHOC_STEPS : ADVANCE_STEPS;
      const step = steps.find((s) => s.status === col.approvalStatus);
      expect(
        step?.owner,
        `${col.key} (${col.notificationRole}) is filed against a step owned by someone else`,
      ).toBe(OWNER_OF[col.notificationRole]);
    }
  });

  it('puts the SAP team on the step after SCM, and the Director on the step after that', () => {
    const sap = APPROVER_MATRIX_COLUMNS.find((c) => c.key === 'sap');
    const director = APPROVER_MATRIX_COLUMNS.find((c) => c.key === 'sd_adhoc');
    expect(sap?.approvalStatus).toBe('Approved by SCM');
    expect(director?.approvalStatus).toBe('Verified by SAP Team');
  });

  it('marks the SAP team as the one cell that holds several people', () => {
    expect(APPROVER_MATRIX_COLUMNS.filter((c) => c.multi).map((c) => c.key)).toEqual(['sap']);
  });

  it('gives every column a distinct key, since the key addresses a cell', () => {
    const keys = APPROVER_MATRIX_COLUMNS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('names only roles the permission model knows', () => {
    /* The enum in the database is the other half of this, and 003 adds 'SAP Team' to it. A
       role here that the TypeScript union does not carry would not compile; this asserts the
       intent so the list reads as deliberate. */
    const known: ProcureGuardPermissionRole[] = [
      'SCM Manager',
      'SAP Team',
      'Country Controller',
      'Supply Chain Director',
      'Treasury Director',
      'Corporate Controller',
      'CFO',
    ];
    for (const col of APPROVER_MATRIX_COLUMNS) {
      expect(known, `${col.notificationRole} is not a permission role`).toContain(
        col.notificationRole as ProcureGuardPermissionRole,
      );
    }
  });
});
