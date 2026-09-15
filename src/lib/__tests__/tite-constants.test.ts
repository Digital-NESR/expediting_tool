import { describe, expect, it } from 'vitest';

import {
  TITE_COUNTRY_CODE,
  TITE_FALLBACK_COUNTRY_CODE,
  TITE_REFERENCE_PAD,
  formatTiteReference,
  titeCountryCode,
} from '@/lib/tite-constants';

describe('titeCountryCode', () => {
  it('resolves every country in the map by its exact label', () => {
    for (const [label, code] of Object.entries(TITE_COUNTRY_CODE)) {
      expect(titeCountryCode(label)).toBe(code);
    }
  });

  it.each([
    ['Oman', 'OMN'],
    ['oman', 'OMN'],
    ['OMAN', 'OMN'],
    ['  Oman  ', 'OMN'],
    ['  oMaN\t', 'OMN'],
    ['egypt', 'EGY'],
    ['qatar', 'QAT'],
  ])('is case- and whitespace-insensitive: %j -> %s', (input, expected) => {
    expect(titeCountryCode(input)).toBe(expected);
  });

  it.each([
    ['Saudi Arabia (KSA)', 'KSA'],
    ['Saudi Arabia', 'KSA'],
    ['saudi arabia', 'KSA'],
    ['  SAUDI ARABIA  ', 'KSA'],
    ['saudi arabia (ksa)', 'KSA'],
    ['United Arab Emirates (UAE)', 'UAE'],
    ['United Arab Emirates', 'UAE'],
    ['united arab emirates', 'UAE'],
  ])('matches the parenthesised alias: %j -> %s', (input, expected) => {
    expect(titeCountryCode(input)).toBe(expected);
  });

  it.each([null, undefined, '', '   ', '\t\n'])('falls back to OTH for blank input %j', (input) => {
    expect(titeCountryCode(input)).toBe(TITE_FALLBACK_COUNTRY_CODE);
    expect(titeCountryCode(input)).toBe('OTH');
  });

  it.each(['Narnia', 'KSA', 'UAE', 'Saudi', 'Arabia', 'United Arab', 'Oman (OMN)'])(
    'falls back to OTH for the unknown label %j',
    (input) => {
      expect(titeCountryCode(input)).toBe('OTH');
    },
  );

  it('maps the explicit "Other" country to OTH as well', () => {
    expect(titeCountryCode('Other')).toBe('OTH');
    expect(titeCountryCode('other')).toBe('OTH');
  });

  it('issues a distinct three-letter code per country', () => {
    const codes = Object.values(TITE_COUNTRY_CODE);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z]{3}$/);
    }
  });
});

describe('formatTiteReference', () => {
  it.each([
    [1, 'OMN-001'],
    [9, 'OMN-009'],
    [10, 'OMN-010'],
    [20, 'OMN-020'],
    [99, 'OMN-099'],
    [100, 'OMN-100'],
    [999, 'OMN-999'],
  ])('pads sequence %d to three digits', (sequence, expected) => {
    expect(formatTiteReference('OMN', sequence)).toBe(expected);
  });

  it('pads a zero sequence rather than emitting a bare dash', () => {
    expect(formatTiteReference('OMN', 0)).toBe('OMN-000');
  });

  it('does not truncate once the sequence outgrows the pad width', () => {
    expect(formatTiteReference('OMN', 1000)).toBe('OMN-1000');
    expect(formatTiteReference('OMN', 12345)).toBe('OMN-12345');
  });

  it('uses whatever prefix it is given, including the fallback', () => {
    expect(formatTiteReference(TITE_FALLBACK_COUNTRY_CODE, 7)).toBe('OTH-007');
    expect(formatTiteReference(titeCountryCode('Saudi Arabia'), 42)).toBe('KSA-042');
  });

  it('pins the pad width the Excel migration and the Add form share', () => {
    expect(TITE_REFERENCE_PAD).toBe(3);
  });

  it('sorts lexicographically in numeric order within the padded range', () => {
    const refs = [1, 2, 10, 20, 100, 999].map((n) => formatTiteReference('OMN', n));
    expect([...refs].sort()).toEqual(refs);
  });
});
