import { describe, expect, it } from 'vitest';

import {
  formatCurrency,
  formatDate,
  formatMatId,
  formatSessionDate,
  formatWeek,
  shortDate,
  shortDateTime,
  shortDateUTC,
  shortDayMonth,
  shortMonthYear,
  shortTime,
  shortWeekdayDate,
} from '@/lib/format';

/* Vitest pins TZ to Asia/Dubai (UTC+4, no DST) in vitest.config.mts, so the local-time helpers
   below are deterministic and the UTC one can be told apart from them. */
const AT_10_05_UTC = new Date('2026-09-15T10:05:00Z'); // 14:05 in Dubai, same calendar day
const LATE = new Date('2026-09-15T21:30:00Z'); // 01:30 on the 16th in Dubai

describe('September is three letters', () => {
  /**
   * The whole point of this file. Every month abbreviation used to come from
   * `toLocaleDateString`, and under CLDR 42 and later en-GB spells September "Sept". So the
   * same date read "15 Sept 2026" on the PO dashboard and "15 Sep 2026" on the analytics
   * screens, and the spelling could change again whenever Node or a browser shipped new ICU
   * data. A fixed table settles it.
   */
  it.each([
    [shortDate, '15 Sep 2026'],
    [shortDayMonth, '15 Sep'],
    [shortWeekdayDate, 'Tue, 15 Sep 2026'],
  ])('renders September as Sep', (fn, expected) => {
    expect((fn as (d: Date) => string)(AT_10_05_UTC)).toBe(expected);
  });

  it('never emits the four-letter form', () => {
    for (let month = 0; month < 12; month++) {
      const d = new Date(2026, month, 15, 12, 0, 0);
      expect(shortDate(d)).not.toContain('Sept');
      expect(shortDate(d).split(' ')[1]).toHaveLength(3);
    }
  });

  it('covers all twelve months', () => {
    const names = Array.from(
      { length: 12 },
      (_, m) => shortDate(new Date(2026, m, 1)).split(' ')[1],
    );
    expect(names).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]);
  });
});

describe('shapes', () => {
  it('pads the day to two digits', () => {
    expect(shortDate(new Date(2026, 8, 5, 12))).toBe('05 Sep 2026');
  });

  /* The comma is what toLocaleString produced, so it survives the move. */
  it('separates date and time with a comma', () => {
    expect(shortDateTime(AT_10_05_UTC)).toBe('15 Sep 2026, 14:05');
  });

  it('renders time as 24-hour, zero padded', () => {
    expect(shortTime(new Date(2026, 8, 15, 9, 7))).toBe('09:07');
    expect(shortTime(new Date(2026, 8, 15, 23, 59))).toBe('23:59');
  });

  it('spells month and year both ways', () => {
    expect(shortMonthYear(AT_10_05_UTC)).toBe('Sep 26');
    expect(shortMonthYear(AT_10_05_UTC, true)).toBe('Sep 2026');
  });

  it('pads a single-digit year in the two-digit form', () => {
    expect(shortMonthYear(new Date(2005, 8, 15))).toBe('Sep 05');
  });
});

describe('local versus UTC', () => {
  /* The Excel exports stamp the UTC date on purpose, so that two people in different offices
     exporting the same session get the same filename. Everything else follows the viewer. */
  it('reads the same when the two agree', () => {
    expect(shortDateUTC(AT_10_05_UTC)).toBe('15 Sep 2026');
    expect(shortDate(AT_10_05_UTC)).toBe('15 Sep 2026');
  });

  it('diverges once the local zone has rolled over', () => {
    expect(shortDateUTC(LATE)).toBe('15 Sep 2026');
    expect(shortDate(LATE)).toBe('16 Sep 2026');
  });
});

describe('the existing formatters still behave', () => {
  it.each([
    ['2026-09-15T08:00:00Z', '15 Sep 2026'],
    ['2026-01-01T08:00:00Z', '01 Jan 2026'],
  ])('formatDate(%j) is %j', (raw, expected) => {
    expect(formatDate(raw)).toBe(expected);
  });

  it.each([null, undefined, ''])('formatDate(%j) is an em dash', (raw) => {
    expect(formatDate(raw)).toBe('—');
  });

  it('echoes an unparseable date rather than printing Invalid Date', () => {
    expect(formatDate('not a date')).toBe('not a date');
  });

  it('formats a session timestamp without the comma', () => {
    expect(formatSessionDate(AT_10_05_UTC.toISOString())).toBe('15 Sep 2026 14:05');
  });

  it('formats a week label as day and month', () => {
    expect(formatWeek('2026-09-15T08:00:00Z')).toBe('15 Sep');
  });

  /* Whole dollars here. The PO dashboard deliberately keeps its own cent-level spelling. */
  it('rounds currency to whole dollars', () => {
    expect(formatCurrency(1234.56)).toBe('$1,235');
  });

  it.each([null, undefined, '', 'abc'])('formatCurrency(%j) is an em dash', (raw) => {
    expect(formatCurrency(raw)).toBe('—');
  });

  it('falls back to the account type when there is no material id', () => {
    expect(formatMatId('  ', 'Cost Centre')).toBe('Cost Centre');
    expect(formatMatId(null, null)).toBe('Service');
    expect(formatMatId('MAT-1', 'Cost Centre')).toBe('MAT-1');
  });
});
