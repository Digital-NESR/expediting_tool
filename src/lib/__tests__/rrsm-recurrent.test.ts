import { describe, expect, it } from 'vitest';
import {
  EMPTY_RECURRENT_DRAFT,
  canDecideRenewal,
  cleanEmails,
  cleanPeople,
  peopleShort,
  poIssue,
  checkRecurrent,
  parsePeriod,
  recurrentStatus,
  suggestNextExpiry,
} from '../rrsm/recurrent';

const d = (iso: string) => new Date(iso + 'T00:00:00Z');
const today = d('2026-11-23');

describe('recurrentStatus', () => {
  const base = { stored: 'active' as const, today, renewal: null };
  it('reads due, expired and active off the expiry date', () => {
    expect(recurrentStatus({ ...base, expiry: d('2027-06-30') })).toBe('active');
    expect(recurrentStatus({ ...base, expiry: d('2027-02-21') })).toBe('due');
    expect(recurrentStatus({ ...base, expiry: d('2026-11-23') })).toBe('due');
    expect(recurrentStatus({ ...base, expiry: d('2026-11-22') })).toBe('expired');
    expect(recurrentStatus({ ...base, expiry: null })).toBe('no_expiry');
  });
  it('says the buyer has it once the requester has decided', () => {
    expect(
      recurrentStatus({
        ...base,
        expiry: d('2026-12-10'),
        renewal: { decision: 'renew', completed: false },
      }),
    ).toBe('awaiting_buyer');
  });
  it('lets a stored cancel win over everything', () => {
    expect(recurrentStatus({ ...base, stored: 'cancelled', expiry: d('2025-01-01') })).toBe(
      'cancelled',
    );
  });
});

describe('suggestNextExpiry', () => {
  it('adds one renewal period, keeping the day of month where it exists', () => {
    expect(suggestNextExpiry(d('2026-05-31'), 'yearly')?.toISOString().slice(0, 10)).toBe(
      '2027-05-31',
    );
    expect(suggestNextExpiry(d('2026-08-31'), 'half_yearly')?.toISOString().slice(0, 10)).toBe(
      '2027-02-28',
    );
    expect(suggestNextExpiry(d('2026-06-30'), 'other')).toBeNull();
    expect(suggestNextExpiry(null, 'yearly')).toBeNull();
  });
});

describe('parsePeriod', () => {
  it('reads the sheet spellings', () => {
    expect(parsePeriod('Yearly')).toBe('yearly');
    expect(parsePeriod('Half Yearly')).toBe('half_yearly');
    expect(parsePeriod('half-yearly')).toBe('half_yearly');
    expect(parsePeriod('every so often')).toBe('other');
    expect(parsePeriod('')).toBeNull();
  });
});

describe('canDecideRenewal', () => {
  const two = [
    { name: 'Riswan Parambath', email: 'rparambath@nesr.com' },
    { name: 'Deborah Dionio', email: 'ddionio@nesr.com' },
  ];
  it('lets any of the service requesters or a buyer decide, nobody else', () => {
    expect(
      canDecideRenewal({ actorEmail: 'RPARAMBATH@nesr.com', requesters: two, canBuy: false }),
    ).toBe(true);
    expect(
      canDecideRenewal({ actorEmail: 'ddionio@nesr.com', requesters: two, canBuy: false }),
    ).toBe(true);
    expect(canDecideRenewal({ actorEmail: 'x@nesr.com', requesters: two, canBuy: false })).toBe(
      false,
    );
    expect(canDecideRenewal({ actorEmail: 'x@nesr.com', requesters: [], canBuy: true })).toBe(true);
  });
});

describe('cleanPeople and peopleShort', () => {
  it('trims, lower-cases emails, drops blanks and repeats', () => {
    expect(
      cleanPeople([
        { name: ' Riswan  Parambath ', email: 'RParambath@nesr.com ' },
        { name: 'Riswan P', email: 'rparambath@nesr.com' },
        { name: '', email: '' },
        { name: 'Deborah Dionio', email: '' },
      ]),
    ).toEqual([
      { name: 'Riswan Parambath', email: 'rparambath@nesr.com' },
      { name: 'Deborah Dionio', email: '' },
    ]);
  });
  it('shortens a list for a table cell', () => {
    expect(peopleShort([])).toBe('—');
    expect(peopleShort([{ name: 'A', email: 'a@x.com' }])).toBe('A');
    expect(
      peopleShort([
        { name: 'A', email: 'a@x.com' },
        { name: '', email: 'b@x.com' },
      ]),
    ).toBe('A +1');
  });
});

describe('checkRecurrent', () => {
  const ok = { ...EMPTY_RECURRENT_DRAFT, description: 'LMS' };
  it('accepts a minimal service', () => {
    expect(checkRecurrent(ok)).toBeNull();
  });
  it('refuses bad dates, emails, values and PO numbers', () => {
    expect(checkRecurrent({ ...ok, description: ' ' })).toMatch(/Describe/);
    expect(checkRecurrent({ ...ok, contractExpiry: '5/31/2026' })).toMatch(/date/);
    expect(checkRecurrent({ ...ok, requesters: [{ name: 'Riswan', email: 'riswan' }] })).toMatch(
      /email/,
    );
    expect(checkRecurrent({ ...ok, annualValue: 'lots' })).toMatch(/number/);
    expect(checkRecurrent({ ...ok, annualValue: '1000' })).toMatch(/currency/);
    expect(checkRecurrent({ ...ok, lastPoNumber: 'PO-1' })).toMatch(/PO number/);
  });
});

describe('poIssue', () => {
  const base = {
    active: true,
    poNumber: '5160001121',
    period: 'yearly' as const,
    sapRead: true,
    createdOn: '2026-06-18',
    today: new Date('2026-11-23T00:00:00Z'),
  };
  it('flags a missing, unknown or out-of-date PO on an active service', () => {
    expect(poIssue({ ...base, poNumber: ' ' })).toBe('missing');
    expect(poIssue({ ...base, createdOn: null })).toBe('not_in_sap');
    expect(poIssue({ ...base, createdOn: '2025-09-30' })).toBe('old');
    expect(poIssue(base)).toBeNull();
  });
  it('allows one billing period plus a month, and leaves cancelled services alone', () => {
    expect(poIssue({ ...base, createdOn: '2025-10-30' })).toBeNull();
    expect(poIssue({ ...base, period: 'quarterly', createdOn: '2026-07-01' })).toBe('old');
    expect(poIssue({ ...base, active: false, poNumber: '' })).toBeNull();
  });
  it('flags only a missing number when SAP could not be read', () => {
    expect(poIssue({ ...base, sapRead: false, createdOn: null })).toBeNull();
    expect(poIssue({ ...base, sapRead: false, poNumber: '' })).toBe('missing');
  });
});

describe('cleanEmails', () => {
  it('keeps each valid address once, lower-cased, separated by "; "', () => {
    expect(cleanEmails('A@x.com,b@y.com ; a@x.com  not-an-email')).toBe('a@x.com; b@y.com');
    expect(cleanEmails('')).toBe('');
  });
});

describe('checkRecurrent supplier contact emails', () => {
  const ok = { ...EMPTY_RECURRENT_DRAFT, description: 'LMS' };
  it('accepts several addresses and names the bad one', () => {
    expect(checkRecurrent({ ...ok, supplierContactEmail: 'a@x.com; b@y.com' })).toBeNull();
    expect(checkRecurrent({ ...ok, supplierContactEmail: 'a@x.com; bob' })).toMatch(/"bob"/);
  });
});
