import { describe, expect, it } from 'vitest';
import {
  canRevealIdentityDocuments,
  canSeeOptimisation,
  countryFilterSql,
  resolveScope,
  type TravelGrant,
} from '@/lib/travel-analytics/scope';

/**
 * Who may see whose travel.
 *
 * The failure this guards against is the quiet one: a reader with no grant, or a grant that
 * covers nothing, being shown the whole company's bookings because "no countries" and "all
 * countries" were allowed to mean the same thing. Null is all; an empty array is none; they are
 * never interchangeable.
 */

const g = (role: TravelGrant['role'], country: string | null): TravelGrant => ({ role, country });

describe('resolveScope', () => {
  it('gives nobody a scope without a grant', () => {
    expect(resolveScope([])).toBeNull();
  });

  it('gives an admin every country, including bookings with no country', () => {
    expect(resolveScope([g('admin', null)])).toEqual({
      role: 'admin',
      countries: null,
      includeUnmapped: true,
    });
  });

  it('scopes a country finance reader to their country', () => {
    expect(resolveScope([g('finance', 'Kuwait')])).toEqual({
      role: 'finance',
      countries: ['Kuwait'],
      includeUnmapped: false,
    });
  });

  it('unions the countries held at the same role', () => {
    const s = resolveScope([g('finance', 'Kuwait'), g('finance', 'KSA')]);
    expect(s?.countries).toEqual(['Kuwait', 'KSA']);
  });

  /* Central finance. The NULL row is the grant that was deliberately given, and narrowing it by
     intersecting with their other rows would take away what somebody chose to hand over. */
  it('lets one all-countries row win over the reader\u2019s narrower rows', () => {
    const s = resolveScope([g('finance', 'Kuwait'), g('finance', null)]);
    expect(s?.countries).toBeNull();
  });

  it('takes the strongest role a person holds', () => {
    expect(resolveScope([g('finance', 'KSA'), g('management', 'KSA')])?.role).toBe('management');
    expect(resolveScope([g('management', 'KSA'), g('admin', null)])?.role).toBe('admin');
  });

  /* A finance grant on Kuwait is not a licence to see Kuwait's compliance detail. The countries
     come from the rows at the winning role only. */
  it('does not let a weaker role widen a stronger one', () => {
    const s = resolveScope([g('management', 'KSA'), g('finance', 'Kuwait'), g('finance', null)]);
    expect(s?.role).toBe('management');
    expect(s?.countries).toEqual(['KSA']);
  });

  /* An all-countries grant below admin still does not show the bookings we could not place in a
     country: that is an admin-only view, because it is the one place scoping cannot apply. */
  it('keeps unmapped bookings to admins even when another role has every country', () => {
    expect(resolveScope([g('finance', null)])?.includeUnmapped).toBe(false);
    expect(resolveScope([g('management', null)])?.includeUnmapped).toBe(false);
  });
});

describe('what each role may do', () => {
  it('lets management and admins see the optimisation detail, not finance', () => {
    expect(canSeeOptimisation('finance')).toBe(false);
    expect(canSeeOptimisation('management')).toBe(true);
    expect(canSeeOptimisation('admin')).toBe(true);
  });

  it('lets only an admin reveal identity documents', () => {
    expect(canRevealIdentityDocuments('admin')).toBe(true);
    expect(canRevealIdentityDocuments('management')).toBe(false);
    expect(canRevealIdentityDocuments('finance')).toBe(false);
  });
});

describe('countryFilterSql', () => {
  const C = 'cc.country';

  it('lets an admin through without a country test', () => {
    const f = countryFilterSql({ role: 'admin', countries: null, includeUnmapped: true }, C, 1);
    expect(f.sql).toBe('TRUE');
    expect(f.params).toEqual([]);
  });

  /* All countries, but not the ones with no country: those are the unmapped bookings. */
  it('excludes unplaced bookings from an all-countries reader below admin', () => {
    const f = countryFilterSql({ role: 'finance', countries: null, includeUnmapped: false }, C, 1);
    expect(f.sql).toBe('cc.country IS NOT NULL');
  });

  it('restricts a country reader to their list', () => {
    const f = countryFilterSql(
      { role: 'finance', countries: ['Kuwait', 'KSA'], includeUnmapped: false },
      C,
      3,
    );
    expect(f.sql).toBe('cc.country = ANY($3)');
    expect(f.params).toEqual([['Kuwait', 'KSA']]);
    expect(f.nextIndex).toBe(4);
  });

  /* The one that matters. An empty list must match nothing, never everything. */
  it('matches nothing when the reader holds no country', () => {
    const f = countryFilterSql({ role: 'finance', countries: [], includeUnmapped: false }, C, 1);
    expect(f.sql).toBe('FALSE');
  });
});
