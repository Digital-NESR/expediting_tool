import { describe, expect, it } from 'vitest';
import {
  RRSM_NAV,
  activeNavId,
  legacyViewPath,
  meetsNeed,
  rrsmHref,
  visibleNav,
} from '@/lib/rrsm/nav';

const ids = (roles: { canBuy: boolean; canValidate: boolean }) =>
  visibleNav(roles).map((i) => i.id);

describe('visibleNav', () => {
  it('shows an Ops validator only Ops validation and Help (they see just the lines sent to them)', () => {
    expect(ids({ canBuy: false, canValidate: true })).toEqual(['validation', 'help']);
  });

  it('shows a buyer PR & PO and the invitations they send, not Ops validation', () => {
    const seen = ids({ canBuy: true, canValidate: false });
    expect(seen).toContain('purchasing');
    expect(seen).not.toContain('validation');
    expect(seen).toContain('suppliers');
  });

  it('shows somebody holding both roles every page, in sidebar order', () => {
    const both = { canBuy: true, canValidate: true };
    expect(
      visibleNav(both, { supplier: true, ops: true, rentals: true, recurrent: true }).map(
        (i) => i.id,
      ),
    ).toEqual(RRSM_NAV.map((i) => i.id));
    // Recurrent services is a module of its own, off unless the country runs it.
    expect(ids(both)).toEqual(RRSM_NAV.map((i) => i.id).filter((id) => id !== 'recurrent'));
  });

  it('shows a recurrent-only country (HQ Dubai) its dashboard, Recurrent services and Help', () => {
    const both = { canBuy: true, canValidate: true };
    expect(
      visibleNav(both, { supplier: true, ops: true, rentals: false, recurrent: true }).map(
        (i) => i.id,
      ),
    ).toEqual(['dashboard', 'recurrent', 'help']);
  });

  it('shows a service requester only Recurrent services and Help', () => {
    const requester = { canBuy: false, canValidate: false };
    expect(
      visibleNav(requester, { supplier: true, ops: true, rentals: true, recurrent: true }).map(
        (i) => i.id,
      ),
    ).toEqual(['recurrent', 'help']);
  });

  it('keeps renewals, the register, history and help open to buyers, with or without Ops', () => {
    for (const roles of [
      { canBuy: true, canValidate: false },
      { canBuy: true, canValidate: true },
    ]) {
      const seen = ids(roles);
      for (const id of ['dashboard', 'renewals', 'register', 'history', 'help'] as const) {
        expect(seen).toContain(id);
      }
    }
  });

  it('agrees with meetsNeed for every item, so the sidebar and the pages ask one question', () => {
    const roles = { canBuy: true, canValidate: false };
    const steps = { supplier: true, ops: true, rentals: true, recurrent: true };
    for (const item of RRSM_NAV) {
      expect(visibleNav(roles, steps).includes(item)).toBe(meetsNeed(item.needs, roles));
    }
  });
});

describe('rrsmHref', () => {
  it('carries the country', () => {
    expect(rrsmHref('/rrsm/register', 'KW')).toBe('/rrsm/register?country=KW');
  });

  it('leaves the path bare when there is no country', () => {
    expect(rrsmHref('/rrsm', null)).toBe('/rrsm');
    expect(rrsmHref('/rrsm', '  ')).toBe('/rrsm');
  });

  it('encodes what it is given rather than trusting it', () => {
    expect(rrsmHref('/rrsm', 'K&W')).toBe('/rrsm?country=K%26W');
  });
});

describe('activeNavId', () => {
  it('matches the dashboard only at /rrsm itself', () => {
    expect(activeNavId('/rrsm')).toBe('dashboard');
    expect(activeNavId('/rrsm/')).toBe('dashboard');
    expect(activeNavId('/rrsm/register')).not.toBe('dashboard');
  });

  it('matches a page and anything beneath it', () => {
    expect(activeNavId('/rrsm/renewals')).toBe('renewals');
    expect(activeNavId('/rrsm/history/3')).toBe('history');
  });

  it('does not match a path that merely starts with the same letters', () => {
    expect(activeNavId('/rrsm/registers')).toBeNull();
  });

  it('matches nothing outside the tool', () => {
    expect(activeNavId('/procure-guard')).toBeNull();
  });
});

describe('legacyViewPath', () => {
  /* Renewal reminders sent before the split link to /rrsm?view=renew. */
  it('sends every old tab to its new page', () => {
    expect(legacyViewPath('ops')).toBe('/rrsm/validation');
    expect(legacyViewPath('buyer')).toBe('/rrsm/purchasing');
    expect(legacyViewPath('invite')).toBe('/rrsm/suppliers');
    expect(legacyViewPath('renew')).toBe('/rrsm/renewals');
  });

  it('leaves the dashboard standing for anything else', () => {
    expect(legacyViewPath(undefined)).toBeNull();
    expect(legacyViewPath('')).toBeNull();
    expect(legacyViewPath('admin')).toBeNull();
  });
});
