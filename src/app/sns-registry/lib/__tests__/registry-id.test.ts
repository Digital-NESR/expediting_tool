import { describe, expect, it } from 'vitest';
import { nextRegistryIdFrom, registryIdPrefix } from '../registry-id';

/** Local dates, matching how the minting code builds them from a DATE column. */
const d = (y: number, m: number, day = 1) => new Date(y, m - 1, day);

describe('registryIdPrefix', () => {
  it('spells the agreed format', () => {
    expect(registryIdPrefix('SGL', 'IRQ', '0001103296', d(2026, 9), d(2027, 9))).toBe(
      'SGL-IRQ-0001103296-26-09-27-09-',
    );
  });

  it('uses SOL for sole-source', () => {
    expect(registryIdPrefix('SOL', 'KWT', '1004521', d(2026, 1), d(2026, 12))).toBe(
      'SOL-KWT-1004521-26-01-26-12-',
    );
  });

  it('zero-pads months and shortens years to two digits', () => {
    expect(registryIdPrefix('SGL', 'EGY', '99', d(2026, 3), d(2027, 11))).toBe(
      'SGL-EGY-99-26-03-27-11-',
    );
  });

  it('keeps the leading zeros SAP prints on a supplier code', () => {
    expect(registryIdPrefix('SGL', 'OMN', '0000001', d(2026, 5), d(2027, 5))).toContain(
      '-0000001-',
    );
  });

  it('strips characters that would make the ID impossible to split back apart', () => {
    expect(registryIdPrefix('SGL', 'BHR', '100 45-21', d(2026, 5), d(2027, 5))).toBe(
      'SGL-BHR-1004521-26-05-27-05-',
    );
  });

  it('falls back to a marker rather than an empty token when there is no SAP ID', () => {
    // An empty token would produce '--' and a segment count nothing can parse.
    expect(registryIdPrefix('SGL', 'GLB', '', d(2026, 5), d(2027, 5))).toBe(
      'SGL-GLB-NOSAP-26-05-27-05-',
    );
  });

  it('handles a validity window that crosses a century boundary', () => {
    expect(registryIdPrefix('SGL', 'IND', '7', d(2099, 12), d(2100, 12))).toBe(
      'SGL-IND-7-99-12-00-12-',
    );
  });
});

describe('nextRegistryIdFrom', () => {
  const prefix = 'SGL-IRQ-0001103296-26-09-27-09-';

  it('starts at 01 when nothing has been issued under the prefix', () => {
    expect(nextRegistryIdFrom(prefix, null)).toBe(`${prefix}01`);
  });

  it('increments the sequence', () => {
    expect(nextRegistryIdFrom(prefix, `${prefix}01`)).toBe(`${prefix}02`);
    expect(nextRegistryIdFrom(prefix, `${prefix}09`)).toBe(`${prefix}10`);
  });

  it('keeps counting past two digits rather than wrapping', () => {
    expect(nextRegistryIdFrom(prefix, `${prefix}99`)).toBe(`${prefix}100`);
  });

  it('treats an unparseable tail as nothing issued, so it cannot mint NaN', () => {
    expect(nextRegistryIdFrom(prefix, `${prefix}XX`)).toBe(`${prefix}01`);
  });

  it('produces an id that starts with the prefix it was given', () => {
    expect(nextRegistryIdFrom(prefix, `${prefix}07`).startsWith(prefix)).toBe(true);
  });
});
