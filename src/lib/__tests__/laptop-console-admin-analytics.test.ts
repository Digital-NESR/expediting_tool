import { describe, expect, it } from 'vitest';
import { buildEffectivePermissions } from '@/lib/laptop-procurement/actor';
import { canUseLaptopAdmin, canUseLaptopAnalytics } from '@/lib/laptopProcurement-utils';
import type { LaptopApproverCapabilities } from '@/types/laptopProcurement';

const NO_CAPS: LaptopApproverCapabilities = {
  'IT Manager': [],
  'Country Manager': [],
  'IT Director': [],
  'Supply Chain Director': [],
};

describe('a platform console admin with no laptop_permissions row', () => {
  const p = buildEffectivePermissions('Requester', NO_CAPS, true);

  it('reaches Analytics — it could already read every request behind it', () => {
    expect(p.canViewAll).toBe(true);
    expect(p.canViewEveryCountry).toBe(true);
    expect(canUseLaptopAnalytics(p.accessView)).toBe(true);
  });

  it('does not become an operational Admin', () => {
    expect(p.accessView).toBe('viewer');
    expect(canUseLaptopAdmin(p.accessView)).toBe(false);
    expect(p.canReject).toBe(false);
    expect(p.canReviewItManager).toBe(false);
    expect(p.canReviewScmDirector).toBe(false);
  });
});

describe('without the console-admin flag', () => {
  const p = buildEffectivePermissions('Requester', NO_CAPS, false);
  it('a plain Requester still cannot reach Analytics', () => {
    expect(p.accessView).toBe('requester');
    expect(canUseLaptopAnalytics(p.accessView)).toBe(false);
  });
});

describe('the other tiers are unchanged', () => {
  it('Admin stays admin, Viewer stays viewer, a matrix approver stays reviewer', () => {
    expect(buildEffectivePermissions('Admin', NO_CAPS, false).accessView).toBe('admin');
    expect(buildEffectivePermissions('Viewer', NO_CAPS, false).accessView).toBe('viewer');
    const approver: LaptopApproverCapabilities = { ...NO_CAPS, 'IT Manager': ['Kuwait'] };
    expect(buildEffectivePermissions('Requester', approver, false).accessView).toBe('reviewer');
  });
});
