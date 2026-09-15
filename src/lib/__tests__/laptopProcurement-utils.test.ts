import { describe, expect, it } from 'vitest';

import {
  APPROVAL_ACTIVE_STATUSES,
  APPROVER_MATRIX_ROLES,
  COUNTRY_OPTIONS,
  IT_MANAGER_STATUSES,
  PERMISSION_PROFILES,
  PERMISSION_ROLE_OPTIONS,
  STATUS_OPTIONS,
  TERMINAL_STATUSES,
  WORKFLOW_STEPS,
  bestAccessView,
  canUseLaptopAdmin,
  canUseLaptopAnalytics,
  canUseLaptopReviewerQueue,
  getLaptopAccessView,
  getLaptopApprovalStage,
  getLaptopAvailableActions,
  getNextApprovalStatus,
  getPermissionProfile,
  getRejectStatusForStage,
  getRequiredPermissionForStage,
  getWorkflowStepIndex,
  isActiveApprovalStatus,
  laptopHasAssignedUnit,
  laptopIsProcureNewFlow,
  normaliseLaptopCountry,
  resolveLaptopMatrixCountry,
  safeNum,
} from '@/lib/laptopProcurement-utils';
import type {
  LaptopAccessView,
  LaptopPermissionRole,
  LaptopRequestStatus,
} from '@/types/laptopProcurement';

describe('approval state machine (getNextApprovalStatus)', () => {
  it('routes intake to the Country Manager regardless of flags', () => {
    for (const assigned of [false, true]) {
      for (const procureNew of [false, true]) {
        expect(getNextApprovalStatus('Submitted', assigned, procureNew)).toBe('CM Approval');
        expect(getNextApprovalStatus('IT Approval', assigned, procureNew)).toBe('CM Approval');
      }
    }
  });

  it.each<[boolean, boolean, LaptopRequestStatus]>([
    [false, false, 'Approved'],
    [true, false, 'Assign from Inventory'],
    [false, true, 'IT Director Approval'],
    [true, true, 'IT Director Approval'],
  ])(
    'branches CM Approval with assigned=%s procureNew=%s to %s',
    (hasAssignedUnit, isProcureNewFlow, expected) => {
      expect(getNextApprovalStatus('CM Approval', hasAssignedUnit, isProcureNewFlow)).toBe(
        expected,
      );
    },
  );

  it('lets the procure-new flag win over a stale assigned unit at CM Approval', () => {
    expect(getNextApprovalStatus('CM Approval', true, true)).toBe('IT Director Approval');
  });

  it('always continues from CM Confirm Device to the IT Director', () => {
    for (const assigned of [false, true]) {
      for (const procureNew of [false, true]) {
        expect(getNextApprovalStatus('CM Confirm Device', assigned, procureNew)).toBe(
          'IT Director Approval',
        );
      }
    }
  });

  it('always continues from the IT Director to the SC Director', () => {
    expect(getNextApprovalStatus('IT Director Approval', false, false)).toBe(
      'Supply Chain Director Approval',
    );
    expect(getNextApprovalStatus('IT Director Approval', true, true)).toBe(
      'Supply Chain Director Approval',
    );
  });

  it.each<[boolean, boolean, LaptopRequestStatus]>([
    [false, false, 'Approved'],
    [true, false, 'Assign from Inventory'],
    [false, true, 'Procure New'],
    [true, true, 'Procure New'],
  ])(
    'branches the final SC Director sign-off with assigned=%s procureNew=%s to %s',
    (hasAssignedUnit, isProcureNewFlow, expected) => {
      expect(
        getNextApprovalStatus('Supply Chain Director Approval', hasAssignedUnit, isProcureNewFlow),
      ).toBe(expected);
    },
  );

  it('has no forward transition out of Procure New Details (IT fills in the device instead)', () => {
    expect(getNextApprovalStatus('Procure New Details', false, true)).toBeNull();
  });

  it.each(TERMINAL_STATUSES)('leaves the terminal status %s with nowhere to go', (status) => {
    expect(getNextApprovalStatus(status, false, false)).toBeNull();
    expect(getNextApprovalStatus(status, true, true)).toBeNull();
  });

  it('walks a full procure-new request from intake to Procure New', () => {
    const walk: LaptopRequestStatus[] = [];
    let status: LaptopRequestStatus | null = 'Submitted';
    while (status) {
      walk.push(status);
      status = getNextApprovalStatus(status, false, true);
    }
    expect(walk).toEqual([
      'Submitted',
      'CM Approval',
      'IT Director Approval',
      'Supply Chain Director Approval',
      'Procure New',
    ]);
  });

  it('ends an inventory-assignment request at the Country Manager', () => {
    const walk: LaptopRequestStatus[] = [];
    let status: LaptopRequestStatus | null = 'Submitted';
    while (status) {
      walk.push(status);
      status = getNextApprovalStatus(status, true, false);
    }
    expect(walk).toEqual(['Submitted', 'CM Approval', 'Assign from Inventory']);
  });
});

describe('request flags', () => {
  it('treats any assigned device field as an assigned unit', () => {
    expect(laptopHasAssignedUnit({ assigned_serial_no: 'SN-1' })).toBe(true);
    expect(laptopHasAssignedUnit({ assigned_model: 'X1' })).toBe(true);
    expect(laptopHasAssignedUnit({ assigned_age: '1-3 years' })).toBe(true);
    expect(laptopHasAssignedUnit({})).toBe(false);
    expect(
      laptopHasAssignedUnit({ assigned_serial_no: null, assigned_model: null, assigned_age: null }),
    ).toBe(false);
    // Empty strings are falsy, so a blank serial does not count as an assignment.
    expect(laptopHasAssignedUnit({ assigned_serial_no: '' })).toBe(false);
  });

  it('reads the sticky procure-new flag', () => {
    expect(laptopIsProcureNewFlow({ procure_new_requested: true })).toBe(true);
    expect(laptopIsProcureNewFlow({ procure_new_requested: false })).toBe(false);
    expect(laptopIsProcureNewFlow({ procure_new_requested: null })).toBe(false);
    expect(laptopIsProcureNewFlow({})).toBe(false);
  });
});

describe('rejection routing (getRejectStatusForStage)', () => {
  it.each<LaptopRequestStatus>([
    'CM Approval',
    'CM Confirm Device',
    'IT Director Approval',
    'Supply Chain Director Approval',
  ])('bounces %s back to the IT Manager', (status) => {
    expect(getRejectStatusForStage(status)).toBe('IT Approval');
  });

  it.each<LaptopRequestStatus>(['Submitted', 'IT Approval', 'Procure New Details'])(
    'gives the IT Manager nothing to bounce back to at %s',
    (status) => {
      expect(getRejectStatusForStage(status)).toBeNull();
    },
  );

  it.each(TERMINAL_STATUSES)('cannot reject the terminal status %s', (status) => {
    expect(getRejectStatusForStage(status)).toBeNull();
  });
});

describe('stage and permission resolvers', () => {
  it.each<[LaptopRequestStatus, string]>([
    ['Submitted', 'IT Manager'],
    ['IT Approval', 'IT Manager'],
    ['Procure New Details', 'IT Manager'],
    ['CM Approval', 'Country Manager'],
    ['CM Confirm Device', 'Country Manager'],
    ['IT Director Approval', 'IT Director'],
    ['Supply Chain Director Approval', 'Supply Chain Director'],
  ])('%s is owned by the %s', (status, stage) => {
    expect(getLaptopApprovalStage(status)).toBe(stage);
  });

  it.each(TERMINAL_STATUSES)('has no owning stage for the terminal status %s', (status) => {
    expect(getLaptopApprovalStage(status)).toBeNull();
  });

  it.each<[LaptopRequestStatus, string]>([
    ['Submitted', 'canReviewItManager'],
    ['IT Approval', 'canReviewItManager'],
    ['Procure New Details', 'canReviewItManager'],
    ['CM Approval', 'canReviewCountryManager'],
    ['CM Confirm Device', 'canReviewCountryManager'],
    ['IT Director Approval', 'canReviewItDirector'],
    ['Supply Chain Director Approval', 'canReviewScmDirector'],
  ])('%s requires %s', (status, permission) => {
    expect(getRequiredPermissionForStage(status)).toBe(permission);
  });

  it.each(TERMINAL_STATUSES)('requires no permission on the terminal status %s', (status) => {
    expect(getRequiredPermissionForStage(status)).toBeNull();
  });

  it('keeps the stage and permission resolvers in lockstep over every active status', () => {
    for (const status of APPROVAL_ACTIVE_STATUSES) {
      expect(getLaptopApprovalStage(status)).not.toBeNull();
      expect(getRequiredPermissionForStage(status)).not.toBeNull();
    }
  });
});

describe('available actions (getLaptopAvailableActions)', () => {
  it('offers nothing at all when the actor does not own the current step', () => {
    for (const status of APPROVAL_ACTIVE_STATUSES) {
      const actions = getLaptopAvailableActions(false, status, true, true, 'Upgrade/Replacement');
      expect(actions.canApprove).toBe(false);
      expect(actions.canReject).toBe(false);
      expect(actions.canAssignInventory).toBe(false);
      expect(actions.canProcureNew).toBe(false);
      expect(actions.canMarkRepaired).toBe(false);
      expect(actions.canSubmitProcureDetails).toBe(false);
    }
  });

  it('lets only the IT Manager stage assign inventory', () => {
    for (const status of APPROVAL_ACTIVE_STATUSES) {
      expect(getLaptopAvailableActions(true, status).canAssignInventory).toBe(
        IT_MANAGER_STATUSES.includes(status),
      );
    }
  });

  it('hides "mark repaired" for a New Employee request (there is no device to repair)', () => {
    expect(
      getLaptopAvailableActions(true, 'IT Approval', false, false, 'New Employee').canMarkRepaired,
    ).toBe(false);
    expect(
      getLaptopAvailableActions(true, 'IT Approval', false, false, 'Upgrade/Replacement')
        .canMarkRepaired,
    ).toBe(true);
    expect(
      getLaptopAvailableActions(true, 'IT Approval', false, false, 'Unit').canMarkRepaired,
    ).toBe(true);
    expect(getLaptopAvailableActions(true, 'IT Approval', false, false, null).canMarkRepaired).toBe(
      true,
    );
  });

  it('offers "procure new" only to the Country Manager, and only once', () => {
    expect(getLaptopAvailableActions(true, 'CM Approval', false, false).canProcureNew).toBe(true);
    // Stays available so the CM can override the IT Manager's inventory pick.
    expect(getLaptopAvailableActions(true, 'CM Approval', true, false).canProcureNew).toBe(true);
    // Already flagged — nothing left to flag.
    expect(getLaptopAvailableActions(true, 'CM Approval', false, true).canProcureNew).toBe(false);
    expect(getLaptopAvailableActions(true, 'CM Confirm Device', false, false).canProcureNew).toBe(
      false,
    );
    expect(
      getLaptopAvailableActions(true, 'IT Director Approval', false, false).canProcureNew,
    ).toBe(false);
  });

  it('gives the IT Manager only the device-details action at Procure New Details', () => {
    const actions = getLaptopAvailableActions(
      true,
      'Procure New Details',
      false,
      true,
      'Upgrade/Replacement',
    );
    expect(actions.canSubmitProcureDetails).toBe(true);
    expect(actions.nextStatus).toBeNull();
    expect(actions.canApprove).toBe(false);
    expect(actions.canReject).toBe(false);
    expect(actions.canAssignInventory).toBe(false);
  });

  it('exposes the reject target alongside canReject', () => {
    const cm = getLaptopAvailableActions(true, 'CM Approval', false, false);
    expect(cm.canReject).toBe(true);
    expect(cm.rejectStatus).toBe('IT Approval');

    const it = getLaptopAvailableActions(true, 'IT Approval', false, false);
    expect(it.canReject).toBe(false);
    expect(it.rejectStatus).toBeNull();
  });

  it('names the owning role for the current stage', () => {
    expect(getLaptopAvailableActions(true, 'Submitted').ownerLabel).toBe('IT Manager');
    expect(getLaptopAvailableActions(true, 'CM Approval').ownerLabel).toBe('Country Manager');
    expect(getLaptopAvailableActions(true, 'IT Director Approval').ownerLabel).toBe('IT Director');
    expect(getLaptopAvailableActions(true, 'Supply Chain Director Approval').ownerLabel).toBe(
      'Supply Chain Director',
    );
    expect(getLaptopAvailableActions(true, 'Approved').ownerLabel).toBe('No active owner');
  });

  it('offers nothing on a terminal status even to an owner', () => {
    for (const status of TERMINAL_STATUSES) {
      const actions = getLaptopAvailableActions(true, status, true, true, 'Upgrade/Replacement');
      expect(actions.nextStatus).toBeNull();
      expect(actions.canApprove).toBe(false);
      expect(actions.canReject).toBe(false);
      expect(actions.canAssignInventory).toBe(false);
      expect(actions.canProcureNew).toBe(false);
      expect(actions.canSubmitProcureDetails).toBe(false);
    }
  });
});

describe('permission profiles and access views', () => {
  it.each<[string, LaptopAccessView]>([
    ['Requester', 'requester'],
    ['IT Manager', 'reviewer'],
    ['Country Manager', 'reviewer'],
    ['IT Director', 'reviewer'],
    ['Supply Chain Director', 'reviewer'],
    ['Admin', 'admin'],
    ['Viewer', 'viewer'],
    ['nonsense', 'requester'],
    ['', 'requester'],
  ])('%s maps to the %s view', (role, view) => {
    expect(getLaptopAccessView(role)).toBe(view);
  });

  it('falls back to Requester for a missing role', () => {
    expect(getPermissionProfile(null).role).toBe('Requester');
    expect(getPermissionProfile(undefined).role).toBe('Requester');
  });

  it('keeps every listed role backed by a profile', () => {
    expect(Object.keys(PERMISSION_PROFILES).sort()).toEqual([...PERMISSION_ROLE_OPTIONS].sort());
    for (const role of PERMISSION_ROLE_OPTIONS) {
      expect(PERMISSION_PROFILES[role].role).toBe(role);
    }
  });

  it('grants each approver-matrix role exactly one review permission', () => {
    const keys = [
      'canReviewItManager',
      'canReviewCountryManager',
      'canReviewItDirector',
      'canReviewScmDirector',
    ] as const;
    for (const role of APPROVER_MATRIX_ROLES) {
      expect(keys.filter((k) => PERMISSION_PROFILES[role][k]).length).toBe(1);
    }
    expect(keys.filter((k) => PERMISSION_PROFILES.Admin[k]).length).toBe(keys.length);
    expect(keys.filter((k) => PERMISSION_PROFILES.Requester[k]).length).toBe(0);
    expect(keys.filter((k) => PERMISSION_PROFILES.Viewer[k]).length).toBe(0);
  });

  it('gives the read-only Viewer sight of everything but authority over nothing', () => {
    const viewer = PERMISSION_PROFILES.Viewer;
    expect(viewer.canViewAll).toBe(true);
    expect(viewer.canViewEveryCountry).toBe(true);
    expect(viewer.canCreateRequests).toBe(false);
    expect(viewer.canReject).toBe(false);
    expect(viewer.canManageData).toBe(false);
    expect(viewer.canManagePermissions).toBe(false);
    expect(viewer.canDeleteRecords).toBe(false);
  });

  it('only lets Admin manage data, permissions and deletions', () => {
    for (const role of PERMISSION_ROLE_OPTIONS) {
      const p = PERMISSION_PROFILES[role];
      expect(p.canManageData).toBe(role === 'Admin');
      expect(p.canManagePermissions).toBe(role === 'Admin');
      expect(p.canDeleteRecords).toBe(role === 'Admin');
    }
  });

  const views: LaptopAccessView[] = ['requester', 'viewer', 'reviewer', 'admin'];

  it.each(views)('gates the admin pages for the %s view', (view) => {
    expect(canUseLaptopAdmin(view)).toBe(view === 'admin');
  });

  it.each(views)('gates analytics for the %s view', (view) => {
    expect(canUseLaptopAnalytics(view)).toBe(view !== 'requester');
  });

  it.each(views)('gates the reviewer queue for the %s view', (view) => {
    // Viewer is deliberately excluded: it holds no approval authority.
    expect(canUseLaptopReviewerQueue(view)).toBe(view === 'reviewer' || view === 'admin');
  });
});

describe('bestAccessView', () => {
  it('falls back to requester for an empty set', () => {
    expect(bestAccessView([])).toBe('requester');
  });

  it('picks the highest-privilege view regardless of order', () => {
    expect(bestAccessView(['requester', 'viewer'])).toBe('viewer');
    expect(bestAccessView(['viewer', 'requester'])).toBe('viewer');
    expect(bestAccessView(['requester', 'reviewer', 'viewer'])).toBe('reviewer');
    expect(bestAccessView(['admin', 'requester'])).toBe('admin');
    expect(bestAccessView(['reviewer', 'admin', 'viewer'])).toBe('admin');
  });

  it('never downgrades a single view', () => {
    for (const view of ['requester', 'viewer', 'reviewer', 'admin'] as LaptopAccessView[]) {
      expect(bestAccessView([view])).toBe(view);
    }
  });

  it('lets a delegated reviewer role lift a plain requester into the reviewer queue', () => {
    const own = getLaptopAccessView('Requester' as LaptopPermissionRole);
    const delegated = getLaptopAccessView('IT Director' as LaptopPermissionRole);
    expect(canUseLaptopReviewerQueue(bestAccessView([own, delegated]))).toBe(true);
  });
});

describe('approver-matrix country resolution', () => {
  it('normalises case and surrounding whitespace', () => {
    expect(normaliseLaptopCountry('  Oman ')).toBe('oman');
    expect(normaliseLaptopCountry('OMAN')).toBe('oman');
    expect(normaliseLaptopCountry(null)).toBe('');
    expect(normaliseLaptopCountry(undefined)).toBe('');
  });

  it('canonicalises a COUNTRY_OPTIONS entry typed in any casing or padding', () => {
    for (const country of COUNTRY_OPTIONS) {
      expect(resolveLaptopMatrixCountry(country)).toBe(country);
      expect(resolveLaptopMatrixCountry(country.toUpperCase())).toBe(country);
      expect(resolveLaptopMatrixCountry(country.toLowerCase())).toBe(country);
      expect(resolveLaptopMatrixCountry(`  ${country}  `)).toBe(country);
    }
  });

  it('rejects a country that is neither a standard option nor already on the matrix', () => {
    expect(resolveLaptopMatrixCountry('Atlantis')).toBeNull();
    expect(resolveLaptopMatrixCountry('Om an')).toBeNull();
    expect(resolveLaptopMatrixCountry('')).toBeNull();
    expect(resolveLaptopMatrixCountry('   ')).toBeNull();
    expect(resolveLaptopMatrixCountry(null)).toBeNull();
  });

  it('keeps legacy matrix countries editable even though they are not COUNTRY_OPTIONS', () => {
    const existing = ['EOS', 'Jordan', 'Malaysia'];
    expect(COUNTRY_OPTIONS).not.toContain('EOS');
    expect(resolveLaptopMatrixCountry('eos', existing)).toBe('EOS');
    expect(resolveLaptopMatrixCountry(' Malaysia ', existing)).toBe('Malaysia');
    expect(resolveLaptopMatrixCountry('Jordan', [])).toBeNull();
  });

  // The bug this guards: a second row spelled ' oman' authorises its reviewer (matching is
  // case-insensitive) while notifications and Assigned Approvers keep reading 'Oman'.
  it('folds a case variant onto the spelling already stored, never a second row', () => {
    const existing = [' oman '];
    expect(resolveLaptopMatrixCountry('Oman', existing)).toBe(' oman ');
    expect(resolveLaptopMatrixCountry('OMAN', existing)).toBe(' oman ');
  });

  it('prefers the stored spelling over the COUNTRY_OPTIONS one when they differ', () => {
    expect(resolveLaptopMatrixCountry('qatar', ['QATAR'])).toBe('QATAR');
    expect(resolveLaptopMatrixCountry('qatar', [])).toBe('Qatar');
  });

  it('resolves every stored country to itself, so a save is idempotent', () => {
    const existing = ['Oman', 'EOS', 'HQ Dubai'];
    for (const country of existing) {
      expect(resolveLaptopMatrixCountry(country, existing)).toBe(country);
    }
  });
});

describe('status catalogue invariants', () => {
  it('partitions STATUS_OPTIONS into active and terminal with no overlap and no gaps', () => {
    const active = new Set<string>(APPROVAL_ACTIVE_STATUSES);
    const terminal = new Set<string>(TERMINAL_STATUSES);
    for (const status of STATUS_OPTIONS) {
      expect(active.has(status) !== terminal.has(status)).toBe(true);
    }
    expect(APPROVAL_ACTIVE_STATUSES.length + TERMINAL_STATUSES.length).toBe(STATUS_OPTIONS.length);
  });

  it('treats only the active statuses as in-flight', () => {
    for (const status of STATUS_OPTIONS) {
      expect(isActiveApprovalStatus(status)).toBe(APPROVAL_ACTIVE_STATUSES.includes(status));
    }
  });

  it('indexes the workflow steps, folding IT Approval onto intake', () => {
    expect(getWorkflowStepIndex('IT Approval')).toBe(0);
    expect(getWorkflowStepIndex('Submitted')).toBe(0);
    expect(getWorkflowStepIndex('CM Approval')).toBe(1);
    expect(getWorkflowStepIndex('Procure New')).toBe(WORKFLOW_STEPS.length - 1);
    expect(getWorkflowStepIndex('Cancelled')).toBe(-1);
  });

  it('keeps the workflow steps in strictly increasing order', () => {
    const indexes = WORKFLOW_STEPS.map((s) => getWorkflowStepIndex(s.status));
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    expect(new Set(indexes).size).toBe(indexes.length);
  });
});

describe('safeNum', () => {
  it('coerces junk to 0', () => {
    expect(safeNum('7')).toBe(7);
    expect(safeNum(null)).toBe(0);
    expect(safeNum('abc')).toBe(0);
    expect(safeNum(Number.NaN)).toBe(0);
    expect(safeNum(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
