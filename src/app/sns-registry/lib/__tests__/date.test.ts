import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BUSINESS_TZ,
  addDays,
  daysFromToday,
  formatDate,
  parseISODate,
  toISODate,
  today,
  todayISO,
} from '../date';

/* The suite runs with TZ=Asia/Dubai (+04) while the registry's business
   timezone is Asia/Riyadh (+03) — see vitest.config.mts. That one-hour gap is
   deliberate: it makes the business date observably independent of the process
   timezone, which is the whole point (the server is UTC on Vercel, the browser
   is whatever the user's laptop says). So "local 00:30" below is 23:30 of the
   PREVIOUS business day. */

describe('today()', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('anchors on one named business timezone, not the process timezone', () => {
    expect(BUSINESS_TZ).toBe('Asia/Riyadh');
    expect(process.env.TZ).not.toBe(BUSINESS_TZ);
  });

  it('is midnight of the current business-timezone date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 14, 17, 42, 31, 500));
    const t = today();
    expect([t.getFullYear(), t.getMonth(), t.getDate()]).toEqual([2026, 8, 14]);
    expect([t.getHours(), t.getMinutes(), t.getSeconds(), t.getMilliseconds()]).toEqual([
      0, 0, 0, 0,
    ]);
    expect(todayISO()).toBe('2026-09-14');
  });

  it('is recomputed on every call rather than frozen at import', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 14, 12, 0, 0));
    const first = toISODate(today());
    vi.setSystemTime(new Date(2026, 8, 15, 12, 0, 0));
    expect(toISODate(today())).not.toBe(first);
    expect(toISODate(today())).toBe('2026-09-15');
  });

  it('reports the business date, not the process-local one, in the small hours', () => {
    vi.useFakeTimers();
    // 00:30 in Dubai (+04) is still 23:30 of the previous day in Riyadh (+03).
    vi.setSystemTime(new Date(2026, 8, 15, 0, 30, 0));
    expect(todayISO()).toBe('2026-09-14');
    // An hour later both zones agree.
    vi.setSystemTime(new Date(2026, 8, 15, 1, 30, 0));
    expect(todayISO()).toBe('2026-09-15');
  });

  it('does not roll the YEAR early — the Registry ID carries it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 0, 1, 0, 30, 0));
    expect(todayISO()).toBe('2026-12-31');
    expect(today().getFullYear()).toBe(2026);
    vi.setSystemTime(new Date(2027, 0, 1, 1, 30, 0));
    expect(todayISO()).toBe('2027-01-01');
    expect(today().getFullYear()).toBe(2027);
  });
});

describe('addDays', () => {
  it('moves forward and backward', () => {
    expect(toISODate(addDays(parseISODate('2026-09-14'), 1))).toBe('2026-09-15');
    expect(toISODate(addDays(parseISODate('2026-09-14'), -1))).toBe('2026-09-13');
    expect(toISODate(addDays(parseISODate('2026-09-14'), 0))).toBe('2026-09-14');
  });

  it('rolls over months and years', () => {
    expect(toISODate(addDays(parseISODate('2026-01-31'), 1))).toBe('2026-02-01');
    expect(toISODate(addDays(parseISODate('2026-12-31'), 1))).toBe('2027-01-01');
    expect(toISODate(addDays(parseISODate('2027-01-01'), -1))).toBe('2026-12-31');
    expect(toISODate(addDays(parseISODate('2026-09-14'), 365))).toBe('2027-09-14');
  });

  it('handles a leap day', () => {
    expect(toISODate(addDays(parseISODate('2028-02-28'), 1))).toBe('2028-02-29');
    expect(toISODate(addDays(parseISODate('2028-02-29'), 1))).toBe('2028-03-01');
    expect(toISODate(addDays(parseISODate('2027-02-28'), 1))).toBe('2027-03-01');
  });

  it('does not mutate its input', () => {
    const base = parseISODate('2026-09-14');
    const snapshot = base.getTime();
    addDays(base, 30);
    expect(base.getTime()).toBe(snapshot);
  });
});

describe('toISODate', () => {
  it('formats local calendar parts with zero padding', () => {
    expect(toISODate(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(toISODate(new Date(2026, 8, 9))).toBe('2026-09-09');
    expect(toISODate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('keeps the local day even at local midnight in a positive-UTC-offset zone', () => {
    // The regression the helper exists for: toISOString() on a +04:00 local
    // midnight rolls back to the previous calendar day.
    const localMidnight = new Date(2026, 0, 1, 0, 0, 0);
    expect(toISODate(localMidnight)).toBe('2026-01-01');
    expect(localMidnight.toISOString().slice(0, 10)).toBe('2025-12-31');
  });

  it('is unaffected by the time of day', () => {
    for (const hour of [0, 1, 6, 12, 23]) {
      expect(toISODate(new Date(2026, 8, 14, hour, 59, 59))).toBe('2026-09-14');
    }
  });
});

describe('parseISODate', () => {
  it('reconstructs local midnight from an ISO date string', () => {
    const d = parseISODate('2026-09-14');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 14]);
    expect(d.getHours()).toBe(0);
  });

  it('round-trips with toISODate', () => {
    for (const iso of ['2026-01-01', '2026-02-28', '2028-02-29', '2026-09-14', '2026-12-31']) {
      expect(toISODate(parseISODate(iso))).toBe(iso);
    }
  });
});

describe('formatDate', () => {
  it('renders a padded day, short month and full year', () => {
    expect(formatDate('2026-09-14')).toBe('14 Sep 2026');
    expect(formatDate('2026-01-01')).toBe('01 Jan 2026');
    expect(formatDate('2026-12-31')).toBe('31 Dec 2026');
  });

  it('renders an em dash for a missing date', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('')).toBe('—');
  });
});

describe('daysFromToday', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 14, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['2026-09-14', 0],
    ['2026-09-15', 1],
    ['2026-09-13', -1],
    ['2026-10-14', 30],
    ['2026-11-13', 60],
    ['2026-07-16', -60],
    ['2027-09-14', 365],
  ])('counts %s as %d days from today', (iso, expected) => {
    expect(daysFromToday(iso)).toBe(expected);
  });

  it('is stable across the hours of the business day', () => {
    for (const hour of [1, 3, 12, 23]) {
      vi.setSystemTime(new Date(2026, 8, 14, hour, 30, 0));
      expect(daysFromToday('2026-09-14')).toBe(0);
      expect(daysFromToday('2026-11-13')).toBe(60);
    }
  });

  it('counts from the business date, so the first local hour is still yesterday', () => {
    vi.setSystemTime(new Date(2026, 8, 14, 0, 30, 0));
    expect(daysFromToday('2026-09-14')).toBe(1);
    expect(daysFromToday('2026-09-13')).toBe(0);
  });

  it('drives the 60-day "expiring soon" boundary used by the registry', () => {
    expect(daysFromToday('2026-11-13')).toBe(60);
    expect(daysFromToday('2026-11-14')).toBe(61);
    expect(daysFromToday('2026-09-13')).toBeLessThan(0);
  });
});
