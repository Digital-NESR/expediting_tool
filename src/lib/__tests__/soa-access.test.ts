import { describe, expect, it } from 'vitest';
import {
  canAccessCountry,
  countriesFor,
  holdsRole,
  isApOnlyFor,
  type SoaActor,
} from '@/lib/soa/access';
import { parseAvlEmails, windowFor } from '@/lib/soa/extract';

/**
 * SOA's access rules decide who can mark a vendor a non-responder and who can only look, so the
 * cases worth pinning are the ones where a wrong answer is quiet: an all-countries grant that
 * silently stops covering a new country, a champion of one country reaching into another, and a
 * viewer being treated as a champion because both are "approved".
 */

function actor(partial: Partial<SoaActor> = {}): SoaActor {
  return {
    email: 'someone@nesr.com',
    name: 'Someone',
    isAdmin: false,
    grants: [],
    role: null,
    requestStatus: null,
    ...partial,
  };
}

describe('holdsRole', () => {
  it('treats a higher role as satisfying a lower requirement', () => {
    const champion = actor({ role: 'champion' });
    expect(holdsRole(champion, 'viewer')).toBe(true);
    expect(holdsRole(champion, 'champion')).toBe(true);
  });

  it('does not let a viewer pass as a champion', () => {
    expect(holdsRole(actor({ role: 'viewer' }), 'champion')).toBe(false);
  });

  it('gives someone with no grant nothing', () => {
    expect(holdsRole(actor(), 'viewer')).toBe(false);
  });

  it('puts an admin above a champion', () => {
    expect(holdsRole(actor({ role: 'admin', isAdmin: true }), 'champion')).toBe(true);
    expect(holdsRole(actor({ role: 'champion' }), 'admin')).toBe(false);
  });
});

describe('countriesFor', () => {
  it('returns the countries a champion was granted', () => {
    const a = actor({
      role: 'champion',
      grants: [
        { role: 'champion', countryId: 'SA' },
        { role: 'champion', countryId: 'OM' },
      ],
    });
    expect(countriesFor(a, 'champion')).toEqual(['SA', 'OM']);
  });

  it("reports an all-countries grant as 'all', never as a list of today's countries", () => {
    // The distinction is the point: a list would stop covering a country added next quarter.
    const a = actor({ role: 'champion', grants: [{ role: 'champion', countryId: null }] });
    expect(countriesFor(a, 'champion')).toBe('all');
  });

  it('gives an admin every country without needing a grant row', () => {
    expect(countriesFor(actor({ role: 'admin', isAdmin: true }), 'champion')).toBe('all');
  });

  it('does not count a viewer grant towards champion scope', () => {
    const a = actor({
      role: 'champion',
      grants: [
        { role: 'champion', countryId: 'SA' },
        { role: 'viewer', countryId: 'OM' },
      ],
    });
    expect(countriesFor(a, 'champion')).toEqual(['SA']);
    // ...but champion is above viewer, so both countries are readable.
    expect(countriesFor(a, 'viewer')).toEqual(['SA', 'OM']);
  });

  it('collapses duplicate grants', () => {
    const a = actor({
      role: 'champion',
      grants: [
        { role: 'champion', countryId: 'SA' },
        { role: 'champion', countryId: 'SA' },
      ],
    });
    expect(countriesFor(a, 'champion')).toEqual(['SA']);
  });
});

describe('canAccessCountry', () => {
  const championOfSaudi = actor({
    role: 'champion',
    grants: [{ role: 'champion', countryId: 'SA' }],
  });

  it('lets a champion act on their own country', () => {
    expect(canAccessCountry(championOfSaudi, 'SA', 'champion')).toBe(true);
  });

  it('stops a champion of one country acting on another', () => {
    expect(canAccessCountry(championOfSaudi, 'OM', 'champion')).toBe(false);
  });

  it('lets an all-countries grant act on a country nobody has heard of yet', () => {
    const regional = actor({ role: 'champion', grants: [{ role: 'champion', countryId: null }] });
    expect(canAccessCountry(regional, 'ZZ', 'champion')).toBe(true);
  });

  it('stops a viewer of a country acting as its champion', () => {
    const viewer = actor({ role: 'viewer', grants: [{ role: 'viewer', countryId: 'SA' }] });
    expect(canAccessCountry(viewer, 'SA', 'viewer')).toBe(true);
    expect(canAccessCountry(viewer, 'SA', 'champion')).toBe(false);
  });
});

describe('parseAvlEmails', () => {
  it('collapses the Approved Vendor List habit of repeating one address', () => {
    // A real value from supplier_avl, verbatim.
    expect(parseAvlEmails('islam.h@mn-chem.com,islam.h@mn-chem.com,islam.h@mn-chem.com')).toEqual([
      'islam.h@mn-chem.com',
    ]);
  });

  it('splits on both commas and semicolons, and trims', () => {
    expect(parseAvlEmails(' a@x.com ; b@y.com , c@z.com ')).toEqual([
      'a@x.com',
      'b@y.com',
      'c@z.com',
    ]);
  });

  it('lowercases, so one address is one address', () => {
    expect(parseAvlEmails('A@X.com,a@x.COM')).toEqual(['a@x.com']);
  });

  it('drops values that are not addresses at all', () => {
    expect(parseAvlEmails('n/a')).toEqual([]);
    expect(parseAvlEmails('')).toEqual([]);
    expect(parseAvlEmails(null)).toEqual([]);
    expect(parseAvlEmails(undefined)).toEqual([]);
  });

  it('keeps a real address that sits beside junk', () => {
    expect(parseAvlEmails('TBC, buyer@vendor.com')).toEqual(['buyer@vendor.com']);
  });
});

describe('windowFor', () => {
  it('runs the lookback back from the period end, not from today', () => {
    // Re-running an extract after the quarter closes must reproduce the same window rather than
    // sliding forward, or last quarter's coverage number changes after it was reported.
    const w = windowFor({ id: 1, period_end: '2026-09-30', lookback_months: 18 });
    expect(w.from.toISOString().slice(0, 10)).toBe('2025-04-01');
    expect(w.to.toISOString().slice(0, 10)).toBe('2026-10-01');
  });

  it('makes the upper bound exclusive so the last day of the period is included', () => {
    const w = windowFor({ id: 1, period_end: '2026-09-30', lookback_months: 18 });
    // A line released on 30 Sep falls inside [from, to).
    expect(new Date('2026-09-30T23:00:00Z') < w.to).toBe(true);
    expect(new Date('2026-10-01T00:00:00Z') < w.to).toBe(false);
  });

  it('reads a pg DATE the same way it reads a string', () => {
    /* pg hands a DATE back as a Date at LOCAL midnight. The suite runs pinned to Asia/Dubai
       (+04:00), so a naive reading of its UTC parts lands on 29 September and the window loses
       the last four hours of the quarter. */
    const fromDate = windowFor({
      id: 1,
      period_end: new Date(2026, 8, 30),
      lookback_months: 18,
    });
    const fromString = windowFor({ id: 1, period_end: '2026-09-30', lookback_months: 18 });
    expect(fromDate.to.toISOString()).toBe(fromString.to.toISOString());
    expect(fromDate.to.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('honours a lookback other than eighteen months', () => {
    const w = windowFor({ id: 2, period_end: '2026-12-31', lookback_months: 12 });
    expect(w.from.toISOString().slice(0, 10)).toBe('2026-01-01');
  });
});

describe('Accounts Payable', () => {
  it('reads a country without being able to act on it', () => {
    const ap = actor({ role: 'ap', grants: [{ role: 'ap', countryId: 'KW' }] });
    // Level with a viewer for reading...
    expect(canAccessCountry(ap, 'KW', 'viewer')).toBe(true);
    // ...and nowhere near a champion for doing.
    expect(canAccessCountry(ap, 'KW', 'champion')).toBe(false);
    expect(holdsRole(ap, 'champion')).toBe(false);
  });

  it('does not reach into another country', () => {
    const ap = actor({ role: 'ap', grants: [{ role: 'ap', countryId: 'KW' }] });
    expect(canAccessCountry(ap, 'OM', 'viewer')).toBe(false);
    expect(isApOnlyFor(ap, 'OM')).toBe(false);
  });

  it('is AP-only where AP is all they hold', () => {
    const ap = actor({ role: 'ap', grants: [{ role: 'ap', countryId: 'KW' }] });
    expect(isApOnlyFor(ap, 'KW')).toBe(true);
  });

  it('is not AP-only where they are also the champion', () => {
    // Losing the fuller view would be a strange consequence of also being copied on the letters.
    const both = actor({
      role: 'champion',
      grants: [
        { role: 'ap', countryId: 'KW' },
        { role: 'champion', countryId: 'KW' },
      ],
    });
    expect(isApOnlyFor(both, 'KW')).toBe(false);
  });

  it('is not AP-only where an all-countries grant already covers them', () => {
    const regional = actor({
      role: 'champion',
      grants: [
        { role: 'ap', countryId: 'KW' },
        { role: 'champion', countryId: null },
      ],
    });
    expect(isApOnlyFor(regional, 'KW')).toBe(false);
  });

  it('never treats an administrator as AP-only', () => {
    expect(isApOnlyFor(actor({ isAdmin: true, role: 'admin' }), 'KW')).toBe(false);
  });

  it('gives a stable label to somebody who is both AP and viewer', () => {
    // The two share a rank, so without a tie-break the label would follow row order.
    const both = actor({
      role: 'ap',
      grants: [
        { role: 'viewer', countryId: 'KW' },
        { role: 'ap', countryId: 'KW' },
      ],
    });
    // A viewer sees the cycle as it runs, so holding both is strictly more than AP alone.
    expect(isApOnlyFor(both, 'KW')).toBe(false);
  });
});

describe('no role sits between champion and admin', () => {
  it('does not let a read-only grant act on a country', () => {
    // The removed `manager` role ranked above champion, and every guard asks for "champion or
    // better" -- so that single line of ordering let it scope vendors, send requests and close a
    // country. Nothing anywhere said it may. Only champion and admin clear that bar now.
    for (const role of ['viewer', 'ap'] as const) {
      const a = actor({ role, grants: [{ role, countryId: 'SA' }] });
      expect(canAccessCountry(a, 'SA', 'champion'), role).toBe(false);
      expect(canAccessCountry(a, 'SA', 'viewer'), role).toBe(true);
    }
  });

  it('gives an all-countries champion the oversight the manager role existed for', () => {
    const regional = actor({ role: 'champion', grants: [{ role: 'champion', countryId: null }] });
    expect(countriesFor(regional, 'champion')).toBe('all');
  });
});
