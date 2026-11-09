import { describe, expect, it } from 'vitest';
import { parseAmountText } from '@/lib/soa/parse-amount';

const value = (s: string) => parseAmountText(s).value;

describe('parseAmountText', () => {
  it('reads the English convention', () => {
    expect(value('1,234.56')).toBe(1234.56);
    expect(value('1,234,567.89')).toBe(1234567.89);
    expect(value('1234')).toBe(1234);
    expect(value('1234.5')).toBe(1234.5);
    expect(value('0')).toBe(0);
  });

  it('reads the French convention, which is why this module exists', () => {
    // Algeria and Kuwait send statements like this. The old reader deleted the comma and
    // returned 626479108 -- a hundred times the real balance.
    expect(value('6 264 791,08')).toBe(6264791.08);
    expect(value('696 000,00')).toBe(696000);
    expect(value('1.234,56')).toBe(1234.56);
    expect(value('1.234.567,89')).toBe(1234567.89);
    expect(value('1234,5')).toBe(1234.5);
    expect(value('SAR 1 234,56')).toBe(1234.56);
  });

  it('decides from the digits, not from a locale it cannot see', () => {
    // A lone comma before two or four digits can only be a decimal point.
    expect(value('1,08')).toBe(1.08);
    expect(value('1,2345')).toBe(1.2345);
    // Spaces having done the grouping settles what the comma must be.
    expect(parseAmountText('6 264 791,08').ambiguous).toBe(false);
  });

  it('flags the one case that is genuinely both readings', () => {
    // `1,234` is 1234 or 1.234 and nothing in the cell settles it. Grouping is the commoner
    // intent and was the old behaviour, so that is what it returns -- but it says so.
    const r = parseAmountText('1,234');
    expect(r.value).toBe(1234);
    expect(r.ambiguous).toBe(true);
    expect(parseAmountText('1,234.56').ambiguous).toBe(false);
  });

  it('understands every way a statement writes a negative', () => {
    expect(value('(1,234.56)')).toBe(-1234.56);
    expect(value('1,234.56-')).toBe(-1234.56);
    expect(value('-1,234.56')).toBe(-1234.56);
    expect(value('-30 492,72')).toBe(-30492.72);
  });

  it('accepts a currency marker beside the number', () => {
    expect(value('USD 1,234.56')).toBe(1234.56);
    expect(value('1,234.56 USD')).toBe(1234.56);
    expect(value('75,000 EGP')).toBe(75000);
    expect(value('$1,234.56')).toBe(1234.56);
  });

  it('refuses a cell holding prose rather than an amount', () => {
    // All of these are real cells from stored statements. The old reader turned each into a
    // number and added it to the vendor's balance: 2026, 2, 91000000063741220.
    expect(value('Monthly Rental Equipments Month of July 2026')).toBeNull();
    expect(value('Rental Equipments Month of May 2026')).toBeNull();
    expect(value('(2) Frac Pumps')).toBeNull();
    expect(value('Polytrol FL 45 22,68KG 5M2')).toBeNull();
    expect(value('9100000006374, SLK Trailer 12M for 24 FT container')).toBeNull();
    expect(value('Sales by Credit , Lpo No: 5170018684')).toBeNull();
    expect(value('Goods Sold LX-20288G Material # 2900000005546')).toBeNull();
  });

  it('refuses a date, which has the shape of a number but is not one', () => {
    expect(value('31.07.2026')).toBeNull();
    expect(value('18/8/2026')).toBeNull();
    expect(value('4100005767; Dt: 14/01/2026')).toBeNull();
  });

  it('refuses a reference number dressed as an amount', () => {
    // A hyphen or a trailing dot used to be stripped, turning these into -787 and 4170015974.
    expect(value('INV-000787')).toBeNull();
    expect(value('4170015974...')).toBeNull();
    // But a genuine amount whose dot cannot be grouping keeps its decimal reading.
    expect(value('4170015974.000')).toBe(4170015974);
  });

  it('returns null rather than zero for an empty or non-numeric cell', () => {
    // Storing 0 would read as "nothing owed", which is a different and much worse claim.
    for (const v of ['', '   ', 'n/a', 'N/A', '-', 'see attached']) expect(value(v)).toBeNull();
  });

  it('says why it refused, for the backfill log', () => {
    expect(parseAmountText('31.07.2026').reason).toBe('separators do not group');
    expect(parseAmountText('(2) Frac Pumps').reason).toBe('text, not an amount');
    expect(parseAmountText('9100000006374, SLK Trailer 12M for 24 FT').reason).toBe(
      'more than one number',
    );
    expect(parseAmountText('').reason).toBe('empty');
  });
});
