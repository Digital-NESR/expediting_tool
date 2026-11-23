import { describe, expect, it } from 'vitest';
import {
  EMPTY_RECURRENT_DRAFT,
  canDecideRenewal,
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
  it('lets the service requester or a buyer decide, nobody else', () => {
    expect(
      canDecideRenewal({
        actorEmail: 'RPARAMBATH@nesr.com',
        requesterEmail: 'rparambath@nesr.com',
        canBuy: false,
      }),
    ).toBe(true);
    expect(
      canDecideRenewal({
        actorEmail: 'x@nesr.com',
        requesterEmail: 'rparambath@nesr.com',
        canBuy: false,
      }),
    ).toBe(false);
    expect(canDecideRenewal({ actorEmail: 'x@nesr.com', requesterEmail: null, canBuy: true })).toBe(
      true,
    );
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
    expect(checkRecurrent({ ...ok, requesterEmail: 'riswan' })).toMatch(/email/);
    expect(checkRecurrent({ ...ok, annualValue: 'lots' })).toMatch(/number/);
    expect(checkRecurrent({ ...ok, annualValue: '1000' })).toMatch(/currency/);
    expect(checkRecurrent({ ...ok, lastPoNumber: 'PO-1' })).toMatch(/PO number/);
  });
});
