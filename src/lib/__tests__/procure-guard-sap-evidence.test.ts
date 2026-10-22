import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PROCURE_GUARD_DOCUMENT_TYPES,
  SAP_VERIFICATION_DOCUMENT_LABEL,
  SAP_VERIFICATION_DOCUMENT_TYPE,
} from '@/lib/procure-guard/constants';
import { getPermissionProfile, getWorkflowSteps } from '@/lib/procureGuard-utils';

/**
 * The SAP Team verification step cannot be completed without evidence.
 *
 * The rule is two halves that have to stay joined. `uploadProcureGuardDocument` is the only
 * place that decides WHO may file under the SAP document type; the transition to
 * `Verified by SAP Team` only checks that a row of that type exists. If the upload guard were
 * ever relaxed, the transition would start accepting a file the requester attached themselves
 * — evidence that nobody with the authority to check ever produced — and nothing would look
 * broken from either side.
 *
 * Both are server actions, so the useful tests here are over the constants they share and the
 * source of the two guards. A client-side check exists as well, but it is a convenience: the
 * actions are public POST endpoints and the form can be bypassed.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const REQUESTS = 'src/app/actions/procure-guard/requests.ts';
const DOCUMENTS = 'src/app/actions/procure-guard/documents.ts';
const DETAIL = 'src/app/procure-guard/components/ProcureGuardRequestDetailClient.tsx';

describe('the SAP evidence document type', () => {
  it('is a type of its own, not a plain request attachment', () => {
    /* The transition looks for THIS type. Were it filed as `request_attachment` the guard could
       not tell it from the quotation the requester uploaded weeks earlier. */
    expect(SAP_VERIFICATION_DOCUMENT_TYPE).toBe('sap_verification');
    expect(PROCURE_GUARD_DOCUMENT_TYPES.has(SAP_VERIFICATION_DOCUMENT_TYPE)).toBe(true);
    expect(PROCURE_GUARD_DOCUMENT_TYPES.has('request_attachment')).toBe(true);
  });

  it('has one label, used by the field, the badge and both refusals', () => {
    expect(SAP_VERIFICATION_DOCUMENT_LABEL).toBe('SAP verification evidence');
    for (const file of [REQUESTS, DOCUMENTS, DETAIL]) {
      expect(read(file), `${file} spells the label itself instead of importing it`).toContain(
        'SAP_VERIFICATION_DOCUMENT_LABEL',
      );
    }
  });
});

describe('the upload guard', () => {
  const src = read(DOCUMENTS);

  it('refuses the SAP type to anyone without SAP Team authority', () => {
    /* This is the whole of the rule. The transition trusts that a row of this type was filed by
       the SAP team, and this is the only thing making that true. */
    expect(src).toContain('canReviewAdhocSapTeam');
    const guard = src.slice(src.indexOf(`documentType === SAP_VERIFICATION_DOCUMENT_TYPE`));
    expect(guard.slice(0, 900)).toContain('!actor.permissions.canReviewAdhocSapTeam');
  });

  it('refuses the SAP type on advance requests, which have no such step', () => {
    const guard = src.slice(src.indexOf(`documentType === SAP_VERIFICATION_DOCUMENT_TYPE`));
    expect(guard.slice(0, 900)).toContain("requestType !== 'adhoc'");
  });
});

describe('the transition guard', () => {
  const src = read(REQUESTS);
  const block = src.slice(src.indexOf('const verifyingSap'), src.indexOf('const setReviewed'));

  it('requires a comment as well as a file', () => {
    /* Asked for explicitly: a comment was previously mandatory only on rejection, so
       "Verified" could be recorded with nothing beside it but a button press. */
    expect(block).toContain('verifyingSap && !comment');
  });

  it('looks for the evidence in the database, not in anything the client sent', () => {
    expect(block).toContain('FROM procure_guard_documents');
    expect(block).toContain('SAP_VERIFICATION_DOCUMENT_TYPE');
    expect(block).toContain('request_type = ? AND request_id = ?');
  });

  it('keys the rule on the target status rather than on the actor"s role', () => {
    /* An Admin holds SAP Team authority too. The requirement belongs to the step, so an Admin
       moving a request through it is held to the same rule. */
    expect(block).toContain("input.status === 'Verified by SAP Team'");
    expect(block).not.toContain('actor.role');
  });

  it('leaves rejection alone', () => {
    /* Decided deliberately: rejecting needs the comment it has always needed and no file. */
    const rejection = src.slice(src.indexOf("input.status === 'Rejected' && !comment"));
    expect(rejection.slice(0, 220)).not.toContain('SAP_VERIFICATION_DOCUMENT_TYPE');
  });
});

describe('the step the rule attaches to', () => {
  it('is a real adhoc step, owned by the SAP Team', () => {
    const step = getWorkflowSteps('adhoc').find((s) => s.status === 'Approved by SCM');
    expect(step?.owner).toBe('SAP Team');
    expect(getWorkflowSteps('adhoc').map((s) => s.status)).toContain('Verified by SAP Team');
  });

  it('does not exist on advance requests', () => {
    expect(getWorkflowSteps('advance', 500_000, 'USD').map((s) => s.status)).not.toContain(
      'Verified by SAP Team',
    );
  });

  it('is held by the two profiles that can act on it, and by nobody else', () => {
    for (const role of ['SAP Team', 'Admin'] as const) {
      expect(
        getPermissionProfile(role)?.canReviewAdhocSapTeam,
        `${role} should be able to verify`,
      ).toBe(true);
    }
    for (const role of ['Requester', 'Viewer', 'SCM Manager', 'Supply Chain Director'] as const) {
      expect(
        getPermissionProfile(role)?.canReviewAdhocSapTeam,
        `${role} should NOT be able to verify`,
      ).toBe(false);
    }
  });
});

describe('the screen', () => {
  const src = read(DETAIL);

  it('shows the upload only at the SAP step, keyed on the status not the role', () => {
    expect(src).toContain("actions.nextStatus === 'Verified by SAP Team'");
    expect(src).toContain('isSapVerificationStep');
  });

  it('disables the button until both the comment and the file are there', () => {
    expect(src).toContain('canSubmitApproval');
    const gate = src.slice(src.indexOf('const canSubmitApproval'));
    expect(gate.slice(0, 260)).toContain('reviewComment.trim().length > 0');
    expect(gate.slice(0, 260)).toContain('sapEvidence.length > 0');
  });

  it('marks the evidence in the attachment list, so it is identifiable later', () => {
    const list = src.slice(src.indexOf('{documents.map((doc) =>'));
    expect(list).toContain('SAP_VERIFICATION_DOCUMENT_TYPE');
  });
});
