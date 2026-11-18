import { describe, expect, it } from 'vitest';
import {
  COUNTRY_OPTIONS,
  getProcureGuardCountryScopeCountries,
  normalizeProcureGuardCountry,
} from '@/lib/procureGuard-utils';
import { grantCoversRequest } from '@/lib/procure-guard/access';
import { countryRecipientKeys } from '@/lib/procure-guard/internals';
import type { ProcureGuardReviewGrant } from '@/types/procureGuard';

/*
 * KSA Unconventional is its own ProcureGuard country: same approvers as KSA except the SCM.
 * Everything below pins the one thing that would make that wrong, which is the two countries
 * leaking into each other through name matching.
 */

const KSA = 'Saudi Arabia (KSA)';
const UC = 'Saudi Arabia (KSA-UC)';

function grant(role: ProcureGuardReviewGrant['role'], country: string): ProcureGuardReviewGrant {
  return {
    source: 'self',
    fromEmail: 'approver@nesr.com',
    fromName: 'Approver',
    role,
    country,
    segment: null,
    isAdmin: false,
  };
}

describe('KSA Unconventional', () => {
  it('is on the form, right after KSA', () => {
    expect(COUNTRY_OPTIONS).toContain(UC);
    expect(COUNTRY_OPTIONS.indexOf(UC)).toBe(COUNTRY_OPTIONS.indexOf(KSA) + 1);
  });

  it.each(['Saudi Arabia (KSA-UC)', 'KSA-UC', 'ksa uc', 'KSA Unconventional', 'Saudi Arabia UC'])(
    'reads %s as Unconventional',
    (input) => {
      expect(normalizeProcureGuardCountry(input)).toBe(UC);
    },
  );

  it('leaves plain KSA as KSA', () => {
    expect(normalizeProcureGuardCountry('KSA')).toBe(KSA);
    expect(normalizeProcureGuardCountry('Saudi Arabia')).toBe(KSA);
  });

  it("keeps KSA's SCM off Unconventional's requests", () => {
    const wael = grant('SCM Manager', 'Bahrain, Saudi Arabia (KSA)');
    expect(grantCoversRequest(wael, { country: KSA })).toBe(true);
    expect(grantCoversRequest(wael, { country: UC })).toBe(false);
  });

  it("keeps Unconventional's SCM off KSA's requests", () => {
    const hichem = grant('SCM Manager', UC);
    expect(grantCoversRequest(hichem, { country: UC })).toBe(true);
    expect(grantCoversRequest(hichem, { country: KSA })).toBe(false);
  });

  it('lets a controller scoped to both cover both', () => {
    const scope = 'Bahrain, Saudi Arabia (KSA), Saudi Arabia (KSA-UC)';
    expect(getProcureGuardCountryScopeCountries(scope)).toEqual(['Bahrain', KSA, UC]);
    const merghani = grant('Country Controller', scope);
    expect(grantCoversRequest(merghani, { country: UC })).toBe(true);
    expect(grantCoversRequest(merghani, { country: KSA })).toBe(true);
  });

  /* KSA's recipient rows are filed under plain "Saudi Arabia" and reached through an alias.
     Unconventional must not pick that alias up, or its emails would go to KSA's SCM too. */
  it("emails only Unconventional's own recipients", () => {
    expect(countryRecipientKeys(UC)).toEqual([UC]);
    expect(countryRecipientKeys(KSA)).toContain('Saudi Arabia');
  });
});
