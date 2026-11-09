import { describe, expect, it } from 'vitest';
import { statementCurrencyDecimals } from '@/lib/soa/currency';

describe('statementCurrencyDecimals', () => {
  it('gives three places to the currencies that have thousandths', () => {
    // A Kuwaiti dinar is 1000 fils. Rounding these to the cent misstates the line.
    for (const c of ['KWD', 'OMR', 'BHD', 'IQD', 'JOD', 'LYD', 'TND'])
      expect(statementCurrencyDecimals(c)).toBe(3);
  });

  it('gives two places to everything else', () => {
    for (const c of ['SAR', 'USD', 'AED', 'EGP', 'DZD', 'QAR', 'IDR'])
      expect(statementCurrencyDecimals(c)).toBe(2);
  });

  it('reads the spellings suppliers actually type', () => {
    // The column holds whatever went into the spreadsheet, not an ISO code.
    expect(statementCurrencyDecimals('Kuwaiti Dinar')).toBe(3);
    expect(statementCurrencyDecimals(' omani rial ')).toBe(3);
    expect(statementCurrencyDecimals('KD')).toBe(3);
    expect(statementCurrencyDecimals('RO')).toBe(3);
  });

  it('falls back to two for anything it does not recognise', () => {
    // Two is what the column did before, so an unknown spelling cannot make things worse.
    for (const c of ['SAUDI RIYAL', 'SR', 'LE', '', '   ', null, undefined])
      expect(statementCurrencyDecimals(c)).toBe(2);
  });
});
