import { describe, expect, it } from 'vitest';
import {
  EMPTY_LINE_DRAFT,
  checkOffHireDate,
  checkServiceLine,
  checkSupplier,
  diffValues,
  draftFromValues,
  isIsoDate,
  normalizeVendorCode,
  parseRate,
  splitEmails,
  type ServiceLineDraft,
} from '@/lib/rrsm/register';

const UOMS = ['month', 'day', 'hour', 'headcount', 'unit'];

const good: ServiceLineDraft = {
  ...EMPTY_LINE_DRAFT,
  supplierCode: '100482',
  description: 'CT-TOYOTA PRADO -23X70474',
  assetRef: '23x70474',
  segment: 'cpven_ct',
  costCenter: 'c541110101',
  rate: '250',
  startsOn: '2026-01-01',
  contractEndsOn: '2026-12-31',
};

describe('checkServiceLine', () => {
  it('accepts a complete line and cleans it', () => {
    const r = checkServiceLine(good, UOMS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.assetRef).toBe('23X70474');
    expect(r.value.segment).toBe('CPVEN_CT');
    expect(r.value.costCenter).toBe('C541110101');
    expect(r.value.rate).toBe(250);
    expect(r.value.serviceNumber).toBeNull();
  });

  it('names every missing required field at once, not one per save', () => {
    const r = checkServiceLine({ ...EMPTY_LINE_DRAFT }, UOMS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(
      ['costCenter', 'description', 'segment', 'supplierCode'].sort(),
    );
  });

  it('allows a blank rate, which means "not agreed yet"', () => {
    const r = checkServiceLine({ ...good, rate: '' }, UOMS);
    expect(r.ok && r.value.rate).toBeNull();
  });

  it('refuses a unit the database does not hold', () => {
    const r = checkServiceLine({ ...good, uom: 'fortnight' }, UOMS);
    expect(!r.ok && r.errors.uom).toBeTruthy();
  });

  it('refuses a contract that ends before it starts', () => {
    const r = checkServiceLine({ ...good, contractEndsOn: '2025-12-31' }, UOMS);
    expect(!r.ok && r.errors.contractEndsOn).toBe('Ends before it starts.');
  });

  it('refuses an impossible date rather than letting Postgres roll it over', () => {
    const r = checkServiceLine({ ...good, contractEndsOn: '2026-02-30' }, UOMS);
    expect(!r.ok && r.errors.contractEndsOn).toBe('Not a date.');
  });

  it('collapses the non-breaking spaces Excel leaves behind', () => {
    const r = checkServiceLine({ ...good, description: '  Staff house,  Mangaf ' }, UOMS);
    expect(r.ok && r.value.description).toBe('Staff house, Mangaf');
  });

  it('lower-cases and checks the owner and requester addresses', () => {
    const ok = checkServiceLine({ ...good, ownerEmail: 'A.Person@NESR.com' }, UOMS);
    expect(ok.ok && ok.value.ownerEmail).toBe('a.person@nesr.com');
    const bad = checkServiceLine({ ...good, requesterEmail: 'not-an-email' }, UOMS);
    expect(!bad.ok && bad.errors.requesterEmail).toBeTruthy();
  });

  it('round-trips through the form unchanged', () => {
    const r = checkServiceLine(good, UOMS);
    if (!r.ok) throw new Error('expected ok');
    const again = checkServiceLine(draftFromValues(r.value), UOMS);
    expect(again).toEqual(r);
  });
});

describe('parseRate', () => {
  it('takes pasted thousands separators', () => {
    expect(parseRate('1,450.5')).toEqual({ ok: true, value: 1450.5 });
  });
  it('refuses negatives, text and a fourth decimal', () => {
    expect(parseRate('-5').ok).toBe(false);
    expect(parseRate('abc').ok).toBe(false);
    expect(parseRate('1.2345').ok).toBe(false);
  });
  it('refuses what NUMERIC(14,3) cannot hold', () => {
    expect(parseRate('100000000000').ok).toBe(false);
  });
});

describe('normalizeVendorCode', () => {
  it('unpads an all-digit SAP code so 0000100482 and 100482 are one supplier', () => {
    expect(normalizeVendorCode('0000100482')).toBe('100482');
    expect(normalizeVendorCode(' 100482 ')).toBe('100482');
  });
  it('leaves a lone zero and alphanumeric codes alone', () => {
    expect(normalizeVendorCode('0')).toBe('0');
    expect(normalizeVendorCode('v00123')).toBe('V00123');
  });
});

describe('isIsoDate', () => {
  it('accepts real dates only', () => {
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('29/02/2028')).toBe(false);
  });
});

describe('checkOffHireDate', () => {
  const today = new Date('2026-11-18T09:00:00Z');
  it('accepts today and the past', () => {
    expect(checkOffHireDate('2026-11-18', '2026-01-01', today).ok).toBe(true);
    expect(checkOffHireDate('2026-10-31', null, today).ok).toBe(true);
  });
  /* Opening a cycle skips any line with an off-hire date, so a future one would drop it early. */
  it('refuses a date in the future', () => {
    expect(checkOffHireDate('2026-11-19', null, today).ok).toBe(false);
  });
  it('refuses a date before the line started', () => {
    expect(checkOffHireDate('2025-12-31', '2026-01-01', today).ok).toBe(false);
  });
});

describe('diffValues', () => {
  it('reports only what moved, as [before, after]', () => {
    expect(diffValues({ a: 1, b: 'x', c: null }, { a: 2, b: 'x', c: null })).toEqual({ a: [1, 2] });
  });
  it('treats undefined and null as the same nothing', () => {
    expect(diffValues({ a: undefined as unknown }, { a: null as unknown })).toEqual({});
  });
});

describe('suppliers', () => {
  it('splits contact addresses however they were pasted, and de-duplicates', () => {
    expect(splitEmails('a@x.com; B@x.com,\n a@x.com  c@x.com')).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
    ]);
  });

  it('accepts a supplier with no contacts yet', () => {
    const r = checkSupplier({ code: '0000100911', name: 'Gulf Guarding', contactEmails: '' });
    expect(r).toEqual({ ok: true, value: { code: '100911', name: 'Gulf Guarding', contactEmails: [] } });
  });

  it('names the address that is wrong', () => {
    const r = checkSupplier({ code: '1', name: 'X', contactEmails: 'ok@x.com, nope' });
    expect(!r.ok && r.errors.contactEmails).toContain('nope');
  });

  it('refuses a code with spaces or symbols in it', () => {
    const r = checkSupplier({ code: '100 482', name: 'X', contactEmails: '' });
    expect(!r.ok && r.errors.code).toBeTruthy();
  });
});
