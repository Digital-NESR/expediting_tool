import { describe, expect, it } from 'vitest';
import { parseAmountText, parseDayCount } from '@/lib/soa/parse-amount';

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

  it('falls back per separator when a cell is genuinely both readings', () => {
    // Nothing in `1,234` or `332.235` settles which reading is meant, so each character falls
    // back to the convention that uses it as the decimal point -- which is also what the old
    // reader did, so nothing that was right becomes wrong.
    const comma = parseAmountText('1,234');
    expect(comma.value).toBe(1234);
    expect(comma.ambiguous).toBe(true);

    const dot = parseAmountText('332.235');
    expect(dot.value).toBe(332.235);
    expect(dot.ambiguous).toBe(true);

    expect(parseAmountText('1,234.56').ambiguous).toBe(false);
  });

  it('does not inflate a three-decimal currency by a thousand', () => {
    // OMR, KWD and BHD all carry three decimals, so amounts like these are everywhere in Oman
    // and Kuwait statements. Reading the dot as grouping overstated 116 stored cells by 1000x.
    expect(value('332.235')).toBe(332.235);
    expect(value('29.225')).toBe(29.225);
    expect(value('2.125')).toBe(2.125);
    expect(value('454.244')).toBe(454.244);
    // And the grouped reading still wins where the number cannot be a small decimal.
    expect(value('1.234.567,89')).toBe(1234567.89);
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
    // Both of these are real statement rows carrying real amounts. A stricter earlier rule
    // threw them away, which is worse than the bug it was written to prevent.
    expect(value('Total    AED 3,022.11')).toBe(3022.11);
    expect(value('1104(USD)')).toBe(1104);
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

describe('parseDayCount', () => {
  it('reads a plain count', () => {
    expect(parseDayCount('74')).toBe(74);
    expect(parseDayCount(45)).toBe(45);
    expect(parseDayCount(45.4)).toBe(45);
    expect(parseDayCount('0')).toBe(0);
    // This column is often a formula subtracting two dates, so the result arrives fractional.
    expect(parseDayCount('40.000000000349')).toBe(40);
    expect(parseDayCount('462.75')).toBe(463);
    expect(parseDayCount(40.5)).toBe(41);
    expect(parseDayCount('-5')).toBe(-5);
  });

  it('reads a count with its unit spelled out', () => {
    // Real cells. The money reader threw these away over the label, losing a good value.
    expect(parseDayCount('74 DAYS OUTSTANDING')).toBe(74);
    expect(parseDayCount('14 DAYS REMAINING')).toBe(14);
    expect(parseDayCount('30 days')).toBe(30);
    expect(parseDayCount('30days')).toBe(30);
    // Suppliers phrase the label however they like; the column heading supplies the unit.
    expect(parseDayCount('40 overdue')).toBe(40);
    expect(parseDayCount('183 OVERDUE')).toBe(183);
    expect(parseDayCount('More than 365')).toBe(365);
    expect(parseDayCount('10-')).toBe(-10);
    // A supplier formula that writes out a whole sentence. The number is still the count.
    expect(parseDayCount('83 days have passed since the due date')).toBe(83);
    expect(parseDayCount('14 days left for the payment')).toBe(14);
  });

  it('refuses an amount that leaked into the days column', () => {
    // A supplier formula pointing at the wrong column yields these. Five digits is the cap: no
    // real number of days reaches six, and these are money.
    expect(parseDayCount('11377500')).toBeNull();
    expect(parseDayCount('1320189.6')).toBeNull();
    expect(parseDayCount('1102677')).toBeNull();
  });

  it('refuses a date put in the days column', () => {
    // Deleting the slashes used to make this 20,092,026 days outstanding.
    expect(parseDayCount('20/09/2026')).toBeNull();
    expect(parseDayCount('20-09-2026')).toBeNull();
  });

  it('refuses anything else', () => {
    for (const v of ['', 'n/a', 'overdue', '12/04', '1.2.3', null, undefined])
      expect(parseDayCount(v)).toBeNull();
  });
});
