import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ADVANCE_COUNTRY_CONTROLLER_ONLY_MAX_USD,
  APPROVAL_ACTIVE_STATUSES,
  CURRENCY_TO_USD,
  PERMISSION_PROFILES,
  PERMISSION_ROLE_OPTIONS,
  canUseProcureGuardAdmin,
  canUseProcureGuardAnalytics,
  canUseProcureGuardOperationalPages,
  canUseProcureGuardReviewerQueue,
  formatProcureGuardStatusLabel,
  getCountryControllerEmail,
  getNextApprovalStatus,
  getPermissionProfile,
  getProcureGuardAccessView,
  getProcureGuardAvailableActions,
  getProcureGuardCountryScopeCountries,
  getRequiredPermissionForTransition,
  getStatusOptionsForRequestType,
  getWorkflowSteps,
  isActiveApprovalStatus,
  normalizeProcureGuardCountry,
  procureGuardThreshold,
  thresholdUsd,
  normalizeProcureGuardCountryScope,
  roleRequiresProcureGuardCountryScope,
  safeNum,
  timeAgo,
  toUsd,
  usdEquivalentFmt,
  usdFmt,
} from '@/lib/procureGuard-utils';
import {
  canActorViewRequest,
  grantCoversRequest,
  scopedRequestWhere,
} from '@/lib/procure-guard/access';
import type {
  ProcureGuardAccessView,
  ProcureGuardActor,
  ProcureGuardPermissionRole,
  ProcureGuardReviewGrant,
  ProcureGuardStatus,
} from '@/types/procureGuard';

/** The two USD gates the approval engine is built around. */
const CONTROLLER_ONLY_MAX = 50_000;
const CFO_GATE = 500_000;

describe('currency conversion (toUsd)', () => {
  it('treats USD as identity and defaults to USD', () => {
    expect(toUsd(1234.56, 'USD')).toBe(1234.56);
    expect(toUsd(1234.56)).toBe(1234.56);
  });

  it('applies the posted rate for each supported currency', () => {
    expect(toUsd(20_000, 'KWD')).toBe(65_000);
    expect(toUsd(187_500, 'SAR')).toBe(50_000);
    expect(toUsd(183_625, 'AED')).toBe(50_000);
    expect(toUsd(100, 'EUR')).toBeCloseTo(108, 10);
    expect(toUsd(100, 'GBP')).toBeCloseTo(127, 10);
  });

  it('is case-insensitive on the currency code', () => {
    expect(toUsd(1000, 'aed')).toBe(toUsd(1000, 'AED'));
    expect(toUsd(1000, 'kWd')).toBe(3250);
  });

  it('falls back to a 1:1 rate for an unknown currency, so the amount is read as USD', () => {
    // Documents a real risk: a currency that is not in CURRENTY_TO_USD is
    // silently treated as USD rather than rejected, so a 60,000 XYZ advance is
    // tiered as 60,000 USD.
    expect(CURRENCY_TO_USD.XYZ).toBeUndefined();
    expect(toUsd(60_000, 'XYZ')).toBe(60_000);
    expect(getNextApprovalStatus('advance', 'Submitted', 60_000, 'XYZ')).toBe('Approved by Country Controller');
  });

  it('coerces junk amounts to 0 rather than NaN', () => {
    expect(toUsd(null, 'USD')).toBe(0);
    expect(toUsd(undefined, 'USD')).toBe(0);
    expect(toUsd('', 'USD')).toBe(0);
    expect(toUsd('not a number', 'USD')).toBe(0);
    expect(toUsd(Number.NaN, 'USD')).toBe(0);
    expect(toUsd(Number.POSITIVE_INFINITY, 'USD')).toBe(0);
  });

  it('accepts numeric strings, as pg returns for NUMERIC columns', () => {
    expect(toUsd('50000', 'USD')).toBe(50_000);
    expect(toUsd('20000', 'KWD')).toBe(65_000);
  });

  it('converts with binary floating point, so a converted amount can land just under an exact gate', () => {
    // 182,000 QAR is exactly 50,000 USD at the posted 3.64 rate, but the
    // reciprocal-rate multiplication lands a hair below. The engine compares
    // this float directly against the threshold.
    expect(toUsd(182_000, 'QAR')).toBeLessThan(CONTROLLER_ONLY_MAX);
    expect(toUsd(182_000, 'QAR')).toBeCloseTo(CONTROLLER_ONLY_MAX, 6);
  });
});

describe('the 50,000 USD country-controller-only gate', () => {
  it('pins the exported constant to 50,000', () => {
    expect(ADVANCE_COUNTRY_CONTROLLER_ONLY_MAX_USD).toBe(CONTROLLER_ONLY_MAX);
  });

  it.each([
    [0, 'Approved'],
    [1, 'Approved'],
    [49_999, 'Approved'],
    [CONTROLLER_ONLY_MAX, 'Approved'],
    [50_000.01, 'Approved by Country Controller'],
    [50_001, 'Approved by Country Controller'],
    [1_000_000, 'Approved by Country Controller'],
  ])('an advance of %d USD at Submitted goes to %s', (amount, expected) => {
    expect(getNextApprovalStatus('advance', 'Submitted', amount, 'USD')).toBe(expected);
  });

  it('applies the same gate to legacy Under Review records', () => {
    expect(getNextApprovalStatus('advance', 'Under Review', CONTROLLER_ONLY_MAX, 'USD')).toBe('Approved');
    expect(getNextApprovalStatus('advance', 'Under Review', 50_001, 'USD')).toBe('Approved by Country Controller');
  });

  it.each([
    [49_999, 'canReviewAdvanceCountryController'],
    [CONTROLLER_ONLY_MAX, 'canReviewAdvanceCountryController'],
  ])('lets the country controller close out %d USD on their own', (amount, permission) => {
    expect(getRequiredPermissionForTransition('advance', 'Submitted', 'Approved', amount, 'USD')).toBe(permission);
  });

  it.each([50_000.01, 50_001, 500_000])(
    'refuses a jump straight to Approved at %d USD — no permission can authorise it',
    amount => {
      expect(getRequiredPermissionForTransition('advance', 'Submitted', 'Approved', amount, 'USD')).toBeNull();
      expect(getRequiredPermissionForTransition('advance', 'Under Review', 'Approved', amount, 'USD')).toBeNull();
    },
  );

  it('applies the gate after currency conversion, not to the raw amount', () => {
    // 15,000 KWD = 48,750 USD -> under the gate; 20,000 KWD = 65,000 USD -> over it.
    expect(getNextApprovalStatus('advance', 'Submitted', 15_000, 'KWD')).toBe('Approved');
    expect(getNextApprovalStatus('advance', 'Submitted', 20_000, 'KWD')).toBe('Approved by Country Controller');
    // The raw number 20,000 would have been under the gate if it were read as USD.
    expect(getNextApprovalStatus('advance', 'Submitted', 20_000, 'USD')).toBe('Approved');
  });

  it('reads numeric strings the same as numbers at the boundary', () => {
    expect(getNextApprovalStatus('advance', 'Submitted', '50000', 'USD')).toBe('Approved');
    expect(getNextApprovalStatus('advance', 'Submitted', '50001', 'USD')).toBe('Approved by Country Controller');
  });

  it('defaults a missing currency to USD rather than throwing', () => {
    expect(getNextApprovalStatus('advance', 'Submitted', 50_001, null)).toBe('Approved by Country Controller');
    expect(getNextApprovalStatus('advance', 'Submitted', 50_001, undefined)).toBe('Approved by Country Controller');
  });
});

describe('the 500,000 USD CFO gate', () => {
  it.each([
    [50_001, 'Approved'],
    [100_000, 'Approved'],
    [499_999, 'Approved'],
    [499_999.99, 'Approved'],
    [CFO_GATE, 'Approved by Corporate Controller'],
    [500_001, 'Approved by Corporate Controller'],
  ])('after Treasury, %d USD goes to %s', (amount, expected) => {
    expect(getNextApprovalStatus('advance', 'Approved by Treasury Director', amount, 'USD')).toBe(expected);
  });

  it('lets the corporate controller release below 500,000 USD', () => {
    expect(
      getRequiredPermissionForTransition('advance', 'Approved by Treasury Director', 'Approved', 499_999, 'USD'),
    ).toBe('canReviewAdvanceCorporateController');
  });

  it('never lets a payment of 500,000 USD or more skip the CFO', () => {
    // The regression this whole suite exists for: at exactly the gate, no
    // permission may take a request from Treasury straight to Approved.
    expect(
      getRequiredPermissionForTransition('advance', 'Approved by Treasury Director', 'Approved', CFO_GATE, 'USD'),
    ).toBeNull();
    expect(
      getRequiredPermissionForTransition('advance', 'Approved by Treasury Director', 'Approved', 500_001, 'USD'),
    ).toBeNull();
    // ...and not from the Country Controller step either.
    expect(
      getRequiredPermissionForTransition('advance', 'Approved by Country Controller', 'Approved', CFO_GATE, 'USD'),
    ).toBeNull();
  });

  it('requires the CFO permission for the final release above the gate', () => {
    expect(
      getRequiredPermissionForTransition('advance', 'Approved by Corporate Controller', 'Approved', CFO_GATE, 'USD'),
    ).toBe('canReviewAdvanceCfo');
  });

  it('applies the CFO gate after currency conversion', () => {
    // 150,000 KWD = 487,500 USD (under); 200,000 KWD = 650,000 USD (over).
    expect(getNextApprovalStatus('advance', 'Approved by Treasury Director', 150_000, 'KWD')).toBe('Approved');
    expect(getNextApprovalStatus('advance', 'Approved by Treasury Director', 200_000, 'KWD')).toBe(
      'Approved by Corporate Controller',
    );
    // 1,875,000 SAR is exactly 500,000 USD.
    expect(toUsd(1_875_000, 'SAR')).toBe(CFO_GATE);
    expect(getNextApprovalStatus('advance', 'Approved by Treasury Director', 1_875_000, 'SAR')).toBe(
      'Approved by Corporate Controller',
    );
  });
});

describe('advance approval chain', () => {
  it('walks the full chain for a 1,000,000 USD advance', () => {
    const walk: ProcureGuardStatus[] = [];
    let status: ProcureGuardStatus | null = 'Submitted';
    while (status) {
      walk.push(status);
      status = getNextApprovalStatus('advance', status, 1_000_000, 'USD');
    }
    expect(walk).toEqual([
      'Submitted',
      'Approved by Country Controller',
      'Approved by Supply Chain Director',
      'Approved by Treasury Director',
      'Approved by Corporate Controller',
      'Approved',
    ]);
  });

  it('skips the CFO step for a 100,000 USD advance', () => {
    const walk: ProcureGuardStatus[] = [];
    let status: ProcureGuardStatus | null = 'Submitted';
    while (status) {
      walk.push(status);
      status = getNextApprovalStatus('advance', status, 100_000, 'USD');
    }
    expect(walk).toEqual([
      'Submitted',
      'Approved by Country Controller',
      'Approved by Supply Chain Director',
      'Approved by Treasury Director',
      'Approved',
    ]);
  });

  it.each<ProcureGuardStatus>(['Approved', 'Rejected', 'Cancelled'])('%s is terminal', status => {
    expect(getNextApprovalStatus('advance', status, 1_000_000, 'USD')).toBeNull();
    expect(getNextApprovalStatus('adhoc', status, 1_000_000, 'USD')).toBeNull();
  });

  it('has no advance transition out of an adhoc-only status', () => {
    expect(getNextApprovalStatus('advance', 'Approved by SCM', 1_000_000, 'USD')).toBeNull();
  });
});

describe('adhoc approval chain', () => {
  it('is two steps and ignores the amount entirely', () => {
    for (const amount of [0, 49_999, 50_001, 5_000_000]) {
      expect(getNextApprovalStatus('adhoc', 'Submitted', amount, 'USD')).toBe('Approved by SCM');
      expect(getNextApprovalStatus('adhoc', 'Approved by SCM', amount, 'USD')).toBe('Approved');
    }
  });

  it('treats legacy Under Review like Submitted', () => {
    expect(getNextApprovalStatus('adhoc', 'Under Review', 1000, 'USD')).toBe('Approved by SCM');
    expect(getRequiredPermissionForTransition('adhoc', 'Under Review', 'Approved by SCM', 1000, 'USD')).toBe(
      'canReviewAdhocScm',
    );
  });

  it('maps each adhoc step to its owning permission', () => {
    expect(getRequiredPermissionForTransition('adhoc', 'Submitted', 'Approved by SCM', 1000, 'USD')).toBe(
      'canReviewAdhocScm',
    );
    expect(getRequiredPermissionForTransition('adhoc', 'Approved by SCM', 'Approved', 1000, 'USD')).toBe(
      'canReviewAdhocDirector',
    );
  });

  it('refuses an adhoc request that tries to skip the SCM step', () => {
    expect(getRequiredPermissionForTransition('adhoc', 'Submitted', 'Approved', 1000, 'USD')).toBeNull();
  });

  it('never routes an adhoc request through an advance-only status', () => {
    expect(
      getRequiredPermissionForTransition('adhoc', 'Submitted', 'Approved by Country Controller', 1000, 'USD'),
    ).toBeNull();
  });
});

describe('rejection authority', () => {
  it('requires the permission of the step that currently owns the request', () => {
    expect(getRequiredPermissionForTransition('advance', 'Submitted', 'Rejected', 1_000_000, 'USD')).toBe(
      'canReviewAdvanceCountryController',
    );
    expect(
      getRequiredPermissionForTransition('advance', 'Approved by Treasury Director', 'Rejected', 1_000_000, 'USD'),
    ).toBe('canReviewAdvanceCorporateController');
    expect(
      getRequiredPermissionForTransition('advance', 'Approved by Corporate Controller', 'Rejected', 1_000_000, 'USD'),
    ).toBe('canReviewAdvanceCfo');
    expect(getRequiredPermissionForTransition('adhoc', 'Approved by SCM', 'Rejected', 1000, 'USD')).toBe(
      'canReviewAdhocDirector',
    );
  });

  it('has no owner to reject an already-closed request', () => {
    expect(getRequiredPermissionForTransition('advance', 'Approved', 'Rejected', 1_000_000, 'USD')).toBeNull();
    expect(getRequiredPermissionForTransition('advance', 'Cancelled', 'Rejected', 1_000_000, 'USD')).toBeNull();
  });
});

describe('role x status approval matrix', () => {
  const HIGH_VALUE = 1_000_000;

  /** Exactly one reviewer role owns each advance step at 1,000,000 USD. */
  const ADVANCE_OWNER: Record<string, ProcureGuardPermissionRole> = {
    Submitted: 'Country Controller',
    'Under Review': 'Country Controller',
    'Approved by Country Controller': 'Supply Chain Director',
    'Approved by Supply Chain Director': 'Treasury Director',
    'Approved by Treasury Director': 'Corporate Controller',
    'Approved by Corporate Controller': 'CFO',
  };

  for (const [status, owner] of Object.entries(ADVANCE_OWNER)) {
    for (const role of PERMISSION_ROLE_OPTIONS) {
      const shouldApprove = role === owner || role === 'Admin';
      it(`${role} ${shouldApprove ? 'can' : 'cannot'} approve an advance at "${status}"`, () => {
        const actions = getProcureGuardAvailableActions(
          getPermissionProfile(role),
          'advance',
          status as ProcureGuardStatus,
          HIGH_VALUE,
          'USD',
        );
        expect(actions.canApprove).toBe(shouldApprove);
        // Reject follows the same ownership, gated additionally on canReject.
        expect(actions.canReject).toBe(shouldApprove && getPermissionProfile(role).canReject);
      });
    }
  }

  it('gives the Country Controller final say only while the advance is under the 50k gate', () => {
    const cc = getPermissionProfile('Country Controller');
    const low = getProcureGuardAvailableActions(cc, 'advance', 'Submitted', 50_000, 'USD');
    expect(low.nextStatus).toBe('Approved');
    expect(low.canApprove).toBe(true);

    const high = getProcureGuardAvailableActions(cc, 'advance', 'Submitted', 50_001, 'USD');
    expect(high.nextStatus).toBe('Approved by Country Controller');
    expect(high.canApprove).toBe(true);
  });

  it('does not let the Supply Chain Director act on an advance still at Submitted', () => {
    const scd = getPermissionProfile('Supply Chain Director');
    expect(getProcureGuardAvailableActions(scd, 'advance', 'Submitted', 1_000_000, 'USD').canApprove).toBe(false);
  });

  it('does not let the Corporate Controller stand in for the CFO', () => {
    const cc = getPermissionProfile('Corporate Controller');
    const actions = getProcureGuardAvailableActions(cc, 'advance', 'Approved by Corporate Controller', CFO_GATE, 'USD');
    expect(actions.requiredPermission).toBe('canReviewAdvanceCfo');
    expect(actions.canApprove).toBe(false);
  });

  it('does not let the CFO shortcut the Treasury step', () => {
    const cfo = getPermissionProfile('CFO');
    expect(
      getProcureGuardAvailableActions(cfo, 'advance', 'Approved by Supply Chain Director', CFO_GATE, 'USD').canApprove,
    ).toBe(false);
  });

  it('owns adhoc steps with the SCM Manager then the Supply Chain Director', () => {
    for (const role of PERMISSION_ROLE_OPTIONS) {
      const profile = getPermissionProfile(role);
      expect(getProcureGuardAvailableActions(profile, 'adhoc', 'Submitted', 1000, 'USD').canApprove).toBe(
        role === 'SCM Manager' || role === 'Admin',
      );
      expect(getProcureGuardAvailableActions(profile, 'adhoc', 'Approved by SCM', 1000, 'USD').canApprove).toBe(
        role === 'Supply Chain Director' || role === 'Admin',
      );
    }
  });

  it('offers nothing on a closed request, even to an Admin', () => {
    const admin = getPermissionProfile('Admin');
    for (const status of ['Approved', 'Rejected', 'Cancelled'] as ProcureGuardStatus[]) {
      const actions = getProcureGuardAvailableActions(admin, 'advance', status, 1_000_000, 'USD');
      expect(actions).toMatchObject({
        nextStatus: null,
        canApprove: false,
        canReject: false,
        requiredPermission: null,
        ownerLabel: 'No active owner',
      });
    }
  });

  it('labels the current owner of each advance step', () => {
    const admin = getPermissionProfile('Admin');
    expect(getProcureGuardAvailableActions(admin, 'advance', 'Submitted', 1_000_000, 'USD').ownerLabel).toBe(
      'Country Controller',
    );
    expect(
      getProcureGuardAvailableActions(admin, 'advance', 'Approved by Corporate Controller', 1_000_000, 'USD')
        .ownerLabel,
    ).toBe('CFO');
    expect(getProcureGuardAvailableActions(admin, 'adhoc', 'Approved by SCM', 1000, 'USD').ownerLabel).toBe(
      'Supply Chain Director',
    );
  });

  it('never lets a Requester or a Viewer approve or reject anything', () => {
    for (const role of ['Requester', 'Viewer', 'Analyst', 'Read Only'] as ProcureGuardPermissionRole[]) {
      const profile = getPermissionProfile(role);
      for (const status of APPROVAL_ACTIVE_STATUSES) {
        const advance = getProcureGuardAvailableActions(profile, 'advance', status, 1_000_000, 'USD');
        const adhoc = getProcureGuardAvailableActions(profile, 'adhoc', status, 1000, 'USD');
        expect(advance.canApprove || advance.canReject).toBe(false);
        expect(adhoc.canApprove || adhoc.canReject).toBe(false);
      }
    }
  });
});

describe('permission profiles', () => {
  it('falls back to Requester for an unknown, empty or missing role', () => {
    expect(getPermissionProfile('Chief Vibes Officer').role).toBe('Requester');
    expect(getPermissionProfile('').role).toBe('Requester');
    expect(getPermissionProfile(null).role).toBe('Requester');
    expect(getPermissionProfile(undefined).role).toBe('Requester');
  });

  it('keeps every role in PERMISSION_ROLE_OPTIONS backed by a profile', () => {
    for (const role of PERMISSION_ROLE_OPTIONS) {
      expect(PERMISSION_PROFILES[role]?.role).toBe(role);
    }
    expect(Object.keys(PERMISSION_PROFILES).sort()).toEqual([...PERMISSION_ROLE_OPTIONS].sort());
  });

  it('grants exactly one review permission to each single-step reviewer role', () => {
    const reviewKeys = [
      'canReviewAdhocScm',
      'canReviewAdhocDirector',
      'canReviewAdvanceCountryController',
      'canReviewAdvanceSupplyChainDirector',
      'canReviewAdvanceTreasuryDirector',
      'canReviewAdvanceCorporateController',
      'canReviewAdvanceCfo',
    ] as const;
    const count = (role: ProcureGuardPermissionRole) =>
      reviewKeys.filter(k => PERMISSION_PROFILES[role][k]).length;

    expect(count('SCM Manager')).toBe(1);
    expect(count('Country Controller')).toBe(1);
    expect(count('Treasury Director')).toBe(1);
    expect(count('Corporate Controller')).toBe(1);
    expect(count('CFO')).toBe(1);
    // The Supply Chain Director deliberately owns both director steps.
    expect(count('Supply Chain Director')).toBe(2);
    expect(count('Admin')).toBe(reviewKeys.length);
    expect(count('Requester')).toBe(0);
    expect(count('Viewer')).toBe(0);
    expect(count('Analyst')).toBe(0);
  });

  it('only lets Admin manage data, permissions and deletions', () => {
    for (const role of PERMISSION_ROLE_OPTIONS) {
      const p = PERMISSION_PROFILES[role];
      expect(p.canManageData).toBe(role === 'Admin');
      expect(p.canManagePermissions).toBe(role === 'Admin');
      expect(p.canDeleteRecords).toBe(role === 'Admin');
    }
  });

  it('blocks request creation for the read-only analyst roles', () => {
    expect(PERMISSION_PROFILES.Analyst.canCreateRequests).toBe(false);
    expect(PERMISSION_PROFILES['Read Only'].canCreateRequests).toBe(false);
    expect(PERMISSION_PROFILES.Requester.canCreateRequests).toBe(true);
    expect(PERMISSION_PROFILES.Viewer.canCreateRequests).toBe(true);
  });
});

describe('access views and page predicates', () => {
  it.each<[string, ProcureGuardAccessView]>([
    ['Requester', 'requester'],
    ['Analyst', 'analyst'],
    ['Read Only', 'analyst'],
    ['Viewer', 'viewer'],
    ['SCM Manager', 'reviewer'],
    ['Country Controller', 'reviewer'],
    ['Supply Chain Director', 'reviewer'],
    ['Treasury Director', 'reviewer'],
    ['Corporate Controller', 'reviewer'],
    ['CFO', 'reviewer'],
    ['Admin', 'admin'],
    ['nonsense', 'requester'],
  ])('%s maps to the %s view', (role, view) => {
    expect(getProcureGuardAccessView(role)).toBe(view);
  });

  const views: ProcureGuardAccessView[] = ['requester', 'analyst', 'viewer', 'reviewer', 'admin'];

  it.each(views)('gates the admin pages for the %s view', view => {
    expect(canUseProcureGuardAdmin(view)).toBe(view === 'admin');
  });

  it.each(views)('gates analytics for the %s view', view => {
    expect(canUseProcureGuardAnalytics(view)).toBe(view !== 'requester');
  });

  it.each(views)('gates the operational pages for the %s view', view => {
    expect(canUseProcureGuardOperationalPages(view)).toBe(view !== 'analyst');
  });

  it.each(views)('gates the reviewer queue for the %s view', view => {
    expect(canUseProcureGuardReviewerQueue(view)).toBe(view === 'reviewer' || view === 'admin');
  });

  it('keeps an analyst out of operational pages and a requester out of analytics', () => {
    expect(canUseProcureGuardOperationalPages('analyst')).toBe(false);
    expect(canUseProcureGuardAnalytics('requester')).toBe(false);
  });
});

describe('country scope', () => {
  it('flags only the country-scoped roles', () => {
    expect(roleRequiresProcureGuardCountryScope('SCM Manager')).toBe(true);
    expect(roleRequiresProcureGuardCountryScope('Country Controller')).toBe(true);
    expect(roleRequiresProcureGuardCountryScope('Supply Chain Director')).toBe(false);
    expect(roleRequiresProcureGuardCountryScope('Admin')).toBe(false);
    expect(roleRequiresProcureGuardCountryScope('')).toBe(false);
    expect(roleRequiresProcureGuardCountryScope(null)).toBe(false);
    expect(roleRequiresProcureGuardCountryScope(undefined)).toBe(false);
  });

  it.each([
    ['Egypt', 'Egypt'],
    ['ksa', 'Saudi Arabia (KSA)'],
    ['KSA', 'Saudi Arabia (KSA)'],
    ['Saudi Arabia', 'Saudi Arabia (KSA)'],
    ['  uae  ', 'United Arab Emirates (UAE)'],
    ['united arab emirates', 'United Arab Emirates (UAE)'],
    ['dubai', 'HQ Dubai'],
    ['hq', 'HQ Dubai'],
    ['Narnia', 'Other'],
    ['egypt', 'Other'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizeProcureGuardCountry(input)).toBe(expected);
  });

  it('returns null for a blank country', () => {
    expect(normalizeProcureGuardCountry('')).toBeNull();
    expect(normalizeProcureGuardCountry('   ')).toBeNull();
    expect(normalizeProcureGuardCountry(null)).toBeNull();
    expect(normalizeProcureGuardCountry(undefined)).toBeNull();
  });

  it.each([
    ['Egypt', ['Egypt']],
    ['EOS + Chad + Congo', ['EOS', 'Chad', 'Congo']],
    ['Egypt, Chad', ['Egypt', 'Chad']],
    ['Egypt; Chad', ['Egypt', 'Chad']],
    ['Egypt | Chad', ['Egypt', 'Chad']],
    ['Egypt and Libya', ['Egypt', 'Libya']],
    ['Egypt, Egypt', ['Egypt']],
    ['ksa, uae', ['Saudi Arabia (KSA)', 'United Arab Emirates (UAE)']],
    ['Narnia', ['Other']],
  ])('expands the scope string %s', (input, expected) => {
    expect(getProcureGuardCountryScopeCountries(input)).toEqual(expected);
  });

  it('returns an empty scope for blank input', () => {
    expect(getProcureGuardCountryScopeCountries('')).toEqual([]);
    expect(getProcureGuardCountryScopeCountries(null)).toEqual([]);
    expect(getProcureGuardCountryScopeCountries(undefined)).toEqual([]);
  });

  it('round-trips a multi-country scope into a canonical comma list', () => {
    expect(normalizeProcureGuardCountryScope('EOS + Chad + Congo')).toBe('EOS, Chad, Congo');
    expect(normalizeProcureGuardCountryScope('ksa')).toBe('Saudi Arabia (KSA)');
    expect(normalizeProcureGuardCountryScope('')).toBeNull();
    expect(normalizeProcureGuardCountryScope(null)).toBeNull();
  });

  it('routes the controller email by normalised country', () => {
    expect(getCountryControllerEmail('ksa')).toBe('ksa.controller@nesr.local');
    expect(getCountryControllerEmail('Saudi Arabia')).toBe('ksa.controller@nesr.local');
    expect(getCountryControllerEmail('Egypt')).toBe('egypt.controller@nesr.local');
    expect(getCountryControllerEmail('Narnia')).toBe('corporate.controller@nesr.local');
    expect(getCountryControllerEmail(null)).toBe('corporate.controller@nesr.local');
    // EOS / HQ Dubai are valid countries but have no controller mailbox of their
    // own, so they land on the corporate controller.
    expect(getCountryControllerEmail('EOS')).toBe('corporate.controller@nesr.local');
    expect(getCountryControllerEmail('HQ Dubai')).toBe('corporate.controller@nesr.local');
  });
});

describe('workflow steps', () => {
  it('shows a fixed four-step adhoc workflow', () => {
    const steps = getWorkflowSteps('adhoc', 5_000_000, 'USD');
    expect(steps.map(s => s.status)).toEqual(['Submitted', 'Under Review', 'Approved by SCM', 'Approved']);
  });

  it('collapses to country finance only at or below the 50k gate', () => {
    for (const amount of [0, 49_999, CONTROLLER_ONLY_MAX]) {
      const steps = getWorkflowSteps('advance', amount, 'USD');
      expect(steps.map(s => s.status)).toEqual(['Submitted', 'Under Review', 'Approved']);
      expect(steps.some(s => s.owner === 'CFO')).toBe(false);
    }
  });

  it('opens the full chain one cent above the 50k gate', () => {
    const steps = getWorkflowSteps('advance', 50_000.01, 'USD');
    expect(steps.map(s => s.status)).toContain('Approved by Country Controller');
    expect(steps.some(s => s.owner === 'CFO')).toBe(false);
  });

  it.each([
    [499_999, false],
    [CFO_GATE, true],
    [500_001, true],
  ])('includes the CFO step for %d USD: %s', (amount, expected) => {
    const steps = getWorkflowSteps('advance', amount, 'USD');
    expect(steps.some(s => s.status === 'Approved by Corporate Controller' && s.owner === 'CFO')).toBe(expected);
  });

  it('agrees with getNextApprovalStatus about whether the CFO is involved', () => {
    for (const amount of [10_000, 50_000, 50_001, 499_999, CFO_GATE, 1_000_000]) {
      const hasCfoStep = getWorkflowSteps('advance', amount, 'USD').some(s => s.owner === 'CFO');
      const reachesCorporateController =
        getNextApprovalStatus('advance', 'Approved by Treasury Director', amount, 'USD') ===
        'Approved by Corporate Controller';
      expect(hasCfoStep).toBe(reachesCorporateController);
    }
  });

  it('always ends on Approved', () => {
    for (const amount of [0, 50_000, 50_001, CFO_GATE]) {
      const steps = getWorkflowSteps('advance', amount, 'USD');
      expect(steps.at(-1)?.status).toBe('Approved');
    }
  });
});

describe('status helpers', () => {
  it('lists only the statuses a request type can reach', () => {
    expect(getStatusOptionsForRequestType('adhoc')).not.toContain('Approved by Country Controller');
    expect(getStatusOptionsForRequestType('advance')).not.toContain('Approved by SCM');
    expect(getStatusOptionsForRequestType('advance')).toContain('Approved by Corporate Controller');
  });

  it('treats only in-flight statuses as active', () => {
    expect(isActiveApprovalStatus('Submitted')).toBe(true);
    expect(isActiveApprovalStatus('Approved by Corporate Controller')).toBe(true);
    expect(isActiveApprovalStatus('Approved')).toBe(false);
    expect(isActiveApprovalStatus('Rejected')).toBe(false);
    expect(isActiveApprovalStatus('Cancelled')).toBe(false);
  });

  it('relabels intermediate "Approved by" statuses so they do not read as final', () => {
    expect(formatProcureGuardStatusLabel('Approved by SCM')).toBe('Approval by SCM');
    expect(formatProcureGuardStatusLabel('Approved by Treasury Director')).toBe('Approval by Treasury Director');
    expect(formatProcureGuardStatusLabel('Approved')).toBe('Approved');
    expect(formatProcureGuardStatusLabel(null)).toBe('-');
    expect(formatProcureGuardStatusLabel('')).toBe('-');
  });
});

describe('formatting helpers', () => {
  it('formats USD with no decimals', () => {
    expect(usdFmt(1234.5, 'USD')).toBe('$1,235');
    expect(usdFmt(0, 'USD')).toBe('$0');
    expect(usdFmt(null)).toBe('$0');
    expect(usdFmt('not a number')).toBe('$0');
  });

  it('degrades gracefully for a currency Intl does not know', () => {
    expect(usdFmt(1000, 'XYZZY')).toBe('XYZZY 1,000');
  });

  it('shows the USD equivalent of a foreign amount', () => {
    expect(usdEquivalentFmt(20_000, 'KWD')).toBe('$65,000');
    expect(usdEquivalentFmt(187_500, 'SAR')).toBe('$50,000');
  });

  it('coerces junk to 0 in safeNum', () => {
    expect(safeNum(12)).toBe(12);
    expect(safeNum('12.5')).toBe(12.5);
    expect(safeNum('')).toBe(0);
    expect(safeNum('abc')).toBe(0);
    expect(safeNum(null)).toBe(0);
    expect(safeNum(undefined)).toBe(0);
    expect(safeNum(Number.NaN)).toBe(0);
    expect(safeNum(Number.POSITIVE_INFINITY)).toBe(0);
    expect(safeNum({})).toBe(0);
  });
});

describe('timeAgo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('buckets by minutes, hours then days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
    expect(timeAgo('2026-09-14T11:59:30Z')).toBe('just now');
    expect(timeAgo('2026-09-14T11:59:00Z')).toBe('1m ago');
    expect(timeAgo('2026-09-14T11:01:00Z')).toBe('59m ago');
    expect(timeAgo('2026-09-14T11:00:00Z')).toBe('1h ago');
    expect(timeAgo('2026-09-13T13:00:00Z')).toBe('23h ago');
    expect(timeAgo('2026-09-13T12:00:00Z')).toBe('1d ago');
    expect(timeAgo('2026-09-04T12:00:00Z')).toBe('10d ago');
    expect(timeAgo(null)).toBe('-');
  });
});

/* ── The single view predicate (src/lib/procure-guard/access.ts) ──────────────
 * Three implementations of "may this actor see this request" used to disagree, which put a country
 * controller on a 404 for a request he was the approver for. These lock the one predicate down.
 */

function reviewGrant(overrides: Partial<ProcureGuardReviewGrant> = {}): ProcureGuardReviewGrant {
  return {
    source: 'self',
    fromEmail: 'approver@nesr.com',
    fromName: 'Approver',
    role: 'Country Controller',
    country: null,
    segment: null,
    isAdmin: false,
    ...overrides,
  };
}

function actorWith(grants: ProcureGuardReviewGrant[], overrides: Partial<ProcureGuardActor> = {}): ProcureGuardActor {
  const role = overrides.role ?? grants[0]?.role ?? 'Requester';
  return {
    email: 'approver@nesr.com',
    name: 'Approver',
    isAdmin: role === 'Admin',
    role,
    permissions: getPermissionProfile(role),
    country: grants[0]?.country ?? null,
    segment: grants[0]?.segment ?? null,
    reviewGrants: grants,
    ...overrides,
  };
}

describe('grantCoversRequest', () => {
  it('covers every country a MULTI-COUNTRY scope names', () => {
    // The live Country Controller scope the incident was about.
    const eosChadCongo = reviewGrant({ country: 'EOS, Chad, Congo' });
    expect(grantCoversRequest(eosChadCongo, { country: 'EOS' })).toBe(true);
    expect(grantCoversRequest(eosChadCongo, { country: 'Chad' })).toBe(true);
    expect(grantCoversRequest(eosChadCongo, { country: 'Congo' })).toBe(true);
    expect(grantCoversRequest(eosChadCongo, { country: 'Qatar' })).toBe(false);
    expect(grantCoversRequest(eosChadCongo, { country: null })).toBe(false);
  });

  it('does not collapse a multi-country scope to "Other"', () => {
    // Comparing the whole scope string through normalizeProcureGuardCountry() yields 'Other', which
    // then matched the literal country 'Other' and nothing else. Both halves are asserted here.
    const multi = reviewGrant({ role: 'SCM Manager', country: 'Bahrain, Saudi Arabia (KSA)' });
    expect(grantCoversRequest(multi, { country: 'Bahrain' })).toBe(true);
    expect(grantCoversRequest(multi, { country: 'Saudi Arabia (KSA)' })).toBe(true);
    expect(grantCoversRequest(multi, { country: 'ksa' })).toBe(true);
    expect(grantCoversRequest(multi, { country: 'Other' })).toBe(false);
  });

  it('accepts separators and aliases inside a multi-country scope', () => {
    expect(grantCoversRequest(reviewGrant({ country: 'EOS + Chad + Congo' }), { country: 'Chad' })).toBe(true);
    const aliased = reviewGrant({ country: 'ksa, uae' });
    expect(grantCoversRequest(aliased, { country: 'Saudi Arabia (KSA)' })).toBe(true);
    expect(grantCoversRequest(aliased, { country: 'United Arab Emirates (UAE)' })).toBe(true);
    expect(grantCoversRequest(aliased, { country: 'Qatar' })).toBe(false);
  });

  it('an admin grant covers everything; a country-scoped grant with NO country covers nothing', () => {
    expect(grantCoversRequest(reviewGrant({ role: 'Admin', isAdmin: true }), { country: 'Qatar' })).toBe(true);
    expect(grantCoversRequest(reviewGrant({ role: 'Country Controller', country: null }), { country: 'Qatar' })).toBe(false);
    expect(grantCoversRequest(reviewGrant({ role: 'SCM Manager', country: '' }), { country: 'Qatar' })).toBe(false);
  });

  it('an unscoped non-country role covers every country', () => {
    expect(grantCoversRequest(reviewGrant({ role: 'CFO', country: null }), { country: 'Qatar' })).toBe(true);
    expect(grantCoversRequest(reviewGrant({ role: 'Treasury Director', country: null }), { country: null })).toBe(true);
  });

  it('narrows by segment as well as country', () => {
    const segmented = reviewGrant({ country: 'EOS, Chad, Congo', segment: 'Production Solutions' });
    expect(grantCoversRequest(segmented, { country: 'Chad', segment: 'Production Solutions' })).toBe(true);
    expect(grantCoversRequest(segmented, { country: 'Chad', segment: 'Drilling' })).toBe(false);
    expect(grantCoversRequest(segmented, { country: 'Chad', segment: null })).toBe(false);
  });
});

describe('canActorViewRequest', () => {
  const scoped = actorWith([reviewGrant({ country: 'EOS, Chad, Congo' })]);

  it('lets a scoped reviewer see requests inside their scope and not outside it', () => {
    expect(canActorViewRequest(scoped, { country: 'Chad', requested_by_email: 'someone@nesr.com' })).toBe(true);
    expect(canActorViewRequest(scoped, { country: 'Qatar', requested_by_email: 'someone@nesr.com' })).toBe(false);
  });

  it('THE INCIDENT: a scoped reviewer can still open a request they raised OUTSIDE their scope', () => {
    // The detail page used to check the requester side only for actors WITHOUT canViewAll, so this
    // returned 404 on a row the actor's own list had just shown them.
    expect(canActorViewRequest(scoped, { country: 'Qatar', requested_by_email: 'approver@nesr.com' })).toBe(true);
  });

  it('honours per-request viewer grants regardless of scope, case-insensitively', () => {
    expect(canActorViewRequest(scoped, {
      country: 'Qatar',
      requested_by_email: 'someone@nesr.com',
      requester_notification_emails: ['Approver@NESR.com'],
    })).toBe(true);
  });

  it('covers a DELEGATE through the delegator multi-country scope', () => {
    // A delegate holds no scope of their own; the delegation grant carries the delegator's.
    const delegate = actorWith(
      [reviewGrant({ source: 'delegation', fromEmail: 'controller@nesr.com', country: 'EOS, Chad, Congo' })],
      { email: 'delegate@nesr.com', name: 'Delegate' },
    );
    expect(canActorViewRequest(delegate, { country: 'Congo', requested_by_email: 'someone@nesr.com' })).toBe(true);
    expect(canActorViewRequest(delegate, { country: 'Qatar', requested_by_email: 'someone@nesr.com' })).toBe(false);
  });

  it('a plain requester sees only their own requests', () => {
    const requester = actorWith([], { email: 'requester@nesr.com', role: 'Requester' });
    expect(canActorViewRequest(requester, { country: 'Chad', requested_by_email: 'requester@nesr.com' })).toBe(true);
    expect(canActorViewRequest(requester, { country: 'Chad', requested_by_email: 'someone@nesr.com' })).toBe(false);
  });
});

describe('scopedRequestWhere', () => {
  it('is the SQL form of the same predicate: own requests OR each grant scope', () => {
    const scoped = scopedRequestWhere(actorWith([reviewGrant({ country: 'EOS, Chad, Congo' })]));
    expect(scoped.where).toContain('LOWER(requested_by_email) = ?');
    expect(scoped.where).toContain('country IN (?, ?, ?)');
    expect(scoped.params).toEqual(['approver@nesr.com', 'approver@nesr.com', 'EOS', 'Chad', 'Congo']);
  });

  it('does not restrict an admin, and restricts a requester to their own rows', () => {
    expect(scopedRequestWhere(actorWith([reviewGrant({ role: 'Admin', isAdmin: true })])).where).toBe('');
    const requester = scopedRequestWhere(actorWith([], { email: 'requester@nesr.com', role: 'Requester' }));
    expect(requester.params).toEqual(['requester@nesr.com', 'requester@nesr.com']);
  });

  it('agrees with canActorViewRequest about which countries a multi-country scope reaches', () => {
    const actor = actorWith([reviewGrant({ country: 'EOS, Chad, Congo' })]);
    const sqlCountries = scopedRequestWhere(actor).params.slice(2);
    for (const country of ['EOS', 'Chad', 'Congo', 'Qatar']) {
      expect(canActorViewRequest(actor, { country, requested_by_email: 'someone@nesr.com' }))
        .toBe(sqlCountries.includes(country));
    }
  });
});

describe('procureGuardThreshold', () => {
  it('prefers the server-computed USD value over the entered amount/currency', () => {
    expect(procureGuardThreshold({ amount: 90_000, currency: 'EUR', spend_value_usd: 97_200 }))
      .toEqual({ amount: 97_200, currency: 'USD' });
    expect(thresholdUsd({ amount: 90_000, currency: 'EUR', spend_value_usd: 97_200 })).toBe(97_200);
  });

  it('falls back to the entered amount on a legacy row with no stored USD value', () => {
    expect(procureGuardThreshold({ amount: 1_000, currency: 'EUR', spend_value_usd: null }))
      .toEqual({ amount: 1_000, currency: 'EUR' });
    expect(thresholdUsd({ amount: 1_000, currency: 'EUR', spend_value_usd: null })).toBeCloseTo(1_080, 6);
    expect(procureGuardThreshold({ amount: 500, currency: null, spend_value_usd: null }))
      .toEqual({ amount: 500, currency: 'USD' });
  });

  it('files a request under the same approver that routing picked', () => {
    // An advance row's `amount` is the contract value while `spend_value_usd` is the advance itself,
    // so the two land in different threshold buckets. Analytics used to read amount+currency and
    // routing the stored USD value, filing the request under an approver nobody was waiting on.
    const row = { amount: 30_000, currency: 'USD', spend_value_usd: 97_200 };
    const nextStatus = (amount: number | string | null, currency: string) => getProcureGuardAvailableActions(
      getPermissionProfile('Admin'), 'advance', 'Submitted', amount, currency,
    ).nextStatus;
    expect(thresholdUsd(row)).toBeGreaterThan(ADVANCE_COUNTRY_CONTROLLER_ONLY_MAX_USD);
    const stored = procureGuardThreshold(row);
    expect(nextStatus(stored.amount, stored.currency)).toBe(nextStatus(97_200, 'USD'));
    // The raw amount+currency the analytics used to read puts the request in the other bucket.
    expect(nextStatus(row.amount, row.currency)).not.toBe(nextStatus(97_200, 'USD'));
  });
});
