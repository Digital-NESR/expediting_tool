import { describe, expect, it } from 'vitest';
import {
  anyMatrixCapabilityForCountry,
  buildEffectivePermissions,
} from '@/lib/laptop-procurement/actor';
import type { LaptopApproverCapabilities } from '@/types/laptopProcurement';

/**
 * The rule uploadLaptopDocument applies: owning the request and approving for its
 * country are independent reasons to be allowed, not branches of a ternary.
 *
 * PLP01572 is the case that exposed it — an IT Manager for Qatar and Chad raised
 * their own HQ Dubai request and was refused an attachment on it, because holding
 * any approver stage sent evaluation down the country branch and the ownership
 * test was never reached.
 */
function canAttach(
  actorEmail: string,
  permissions: { canViewAll: boolean; canViewEveryCountry: boolean },
  caps: LaptopApproverCapabilities,
  request: { requested_by_email: string; country: string },
): boolean {
  return (
    actorEmail.toLowerCase() === request.requested_by_email.toLowerCase() ||
    (permissions.canViewAll &&
      (permissions.canViewEveryCountry || anyMatrixCapabilityForCountry(caps, request.country)))
  );
}

const NO_CAPS: LaptopApproverCapabilities = {
  'IT Manager': [],
  'Country Manager': [],
  'IT Director': [],
  'Supply Chain Director': [],
};

describe('attaching a file to a laptop request', () => {
  const qatarChad: LaptopApproverCapabilities = { ...NO_CAPS, 'IT Manager': ['Qatar', 'Chad'] };
  const approver = buildEffectivePermissions('IT Manager', qatarChad);
  const plain = buildEffectivePermissions('Requester', NO_CAPS);

  it('lets an approver attach to their OWN request outside their countries (PLP01572)', () => {
    expect(
      canAttach('rparambath@nesr.com', approver, qatarChad, {
        requested_by_email: 'rparambath@nesr.com',
        country: 'HQ Dubai',
      }),
    ).toBe(true);
  });

  it('lets a plain requester attach to their own request', () => {
    expect(
      canAttach('someone@nesr.com', plain, NO_CAPS, {
        requested_by_email: 'someone@nesr.com',
        country: 'HQ Dubai',
      }),
    ).toBe(true);
  });

  it('lets an approver attach to someone else request in a country they approve', () => {
    expect(
      canAttach('rparambath@nesr.com', approver, qatarChad, {
        requested_by_email: 'other@nesr.com',
        country: 'Qatar',
      }),
    ).toBe(true);
  });

  it('still refuses someone else request outside their countries', () => {
    expect(
      canAttach('rparambath@nesr.com', approver, qatarChad, {
        requested_by_email: 'other@nesr.com',
        country: 'HQ Dubai',
      }),
    ).toBe(false);
  });

  it('still refuses a plain requester on someone else request', () => {
    expect(
      canAttach('someone@nesr.com', plain, NO_CAPS, {
        requested_by_email: 'other@nesr.com',
        country: 'HQ Dubai',
      }),
    ).toBe(false);
  });
});
