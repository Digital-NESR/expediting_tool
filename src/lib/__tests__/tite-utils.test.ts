import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ALERT_DOT,
  ALERT_LABEL,
  ALERT_PILL,
  BUCKET_HEX,
  alertLevelFor,
  calcDays,
  fmtDate,
  getStatusBadge,
  sarFmt,
  shipmentAlertLevel,
  usdFmt,
} from '@/lib/tite-utils';
import type { Shipment } from '@/types/tite';

/** calcDays only reads the two date fields. */
const shipment = (expiry_date: string | null, extended_date: string | null = null): Shipment =>
  ({ expiry_date, extended_date }) as unknown as Shipment;

describe('calcDays', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Midday UTC on 14 Sep 2026, so the UTC and local calendar days agree.
    vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 0 on the day of expiry', () => {
    expect(calcDays(shipment('2026-09-14'))).toBe(0);
  });

  it.each([
    ['2026-09-15', 1],
    ['2026-09-16', 2],
    ['2026-09-21', 7],
    ['2026-10-14', 30],
    ['2026-11-13', 60],
    ['2026-12-13', 90],
    ['2027-09-14', 365],
  ])('counts %s as %d days remaining', (date, expected) => {
    expect(calcDays(shipment(date))).toBe(expected);
  });

  it.each([
    ['2026-09-13', -1],
    ['2026-09-07', -7],
    ['2026-08-15', -30],
    ['2025-09-14', -365],
  ])('counts %s as %d (overdue)', (date, expected) => {
    expect(calcDays(shipment(date))).toBe(expected);
  });

  it('prefers the extended date over the original expiry', () => {
    // The extension is what matters: an already-overdue expiry extended into
    // the future must read as on track, not overdue.
    expect(calcDays(shipment('2026-09-01', '2026-10-14'))).toBe(30);
    expect(calcDays(shipment('2026-12-31', '2026-09-13'))).toBe(-1);
  });

  it('falls back to the expiry date when the extension is absent or blank', () => {
    expect(calcDays(shipment('2026-09-21', null))).toBe(7);
    expect(calcDays(shipment('2026-09-21', ''))).toBe(7);
  });

  it('returns null when there is no effective date at all', () => {
    expect(calcDays(shipment(null))).toBeNull();
    expect(calcDays(shipment(null, null))).toBeNull();
    expect(calcDays(shipment(''))).toBeNull();
  });

  it('handles month and year rollovers and a leap day', () => {
    vi.setSystemTime(new Date('2028-02-28T12:00:00Z'));
    expect(calcDays(shipment('2028-02-29'))).toBe(1);
    expect(calcDays(shipment('2028-03-01'))).toBe(2);

    vi.setSystemTime(new Date('2026-12-31T12:00:00Z'));
    expect(calcDays(shipment('2027-01-01'))).toBe(1);
    expect(calcDays(shipment('2026-12-30'))).toBe(-1);
  });

  it('returns whole days regardless of the hour of day', () => {
    for (const hour of ['00:00:01', '06:00:00', '12:00:00', '23:59:59']) {
      vi.setSystemTime(new Date(`2026-09-14T${hour}Z`));
      expect(calcDays(shipment('2026-09-21'))).toBe(7);
    }
  });

  it('anchors "today" to the UTC calendar day, not the viewer\'s local day', () => {
    // 2026-09-14T01:00 in Asia/Dubai (+04:00) is still 13 Sep in UTC, so a
    // shipment expiring "today" locally reads as 1 day remaining. This mirrors
    // a Postgres CURRENT_DATE evaluated in UTC.
    vi.setSystemTime(new Date('2026-09-13T21:00:00Z'));
    expect(new Date().getHours()).toBe(1); // 01:00 local, Asia/Dubai
    expect(calcDays(shipment('2026-09-14'))).toBe(1);
  });
});

describe('alertLevelFor', () => {
  /** Midday UTC, so the UTC and Asia/Dubai calendar days agree. */
  const TODAY = new Date('2026-09-14T12:00:00Z');
  const level = (expiry: string | null, extended: string | null = null, status = 'Open') =>
    alertLevelFor(expiry, extended, status, TODAY);

  it('is closed for either closed status, whatever the dates say', () => {
    for (const status of ['Closed', 'Closed - Refund Recovered']) {
      expect(alertLevelFor('2020-01-01', null, status, TODAY)).toBe('closed');
      expect(alertLevelFor('2099-01-01', null, status, TODAY)).toBe('closed');
      expect(alertLevelFor(null, null, status, TODAY)).toBe('closed');
    }
  });

  it('is info — not ok — when there is no effective date at all', () => {
    // A shipment with no customs deadline on file is "Monitor", never "On track".
    // The migration used to call this 'ok', which hid it from every alert view.
    expect(level(null)).toBe('info');
    expect(level(null, null)).toBe('info');
    expect(level('', '')).toBe('info');
  });

  /* ── Every bucket boundary, both sides. ── */
  it.each([
    // overdue | ... | urgent
    ['2026-08-15', -30, 'overdue'],
    ['2026-09-12', -2, 'overdue'],
    ['2026-09-13', -1, 'overdue'],
    ['2026-09-14', 0, 'urgent'],
    ['2026-09-15', 1, 'urgent'],
    // urgent | action
    ['2026-09-21', 7, 'urgent'],
    ['2026-09-22', 8, 'action'],
    // action | plan
    ['2026-09-28', 14, 'action'],
    ['2026-09-29', 15, 'plan'],
    // plan | info
    ['2026-10-14', 30, 'plan'],
    ['2026-10-15', 31, 'info'],
    // info | ok
    ['2026-11-13', 60, 'info'],
    ['2026-11-14', 61, 'ok'],
    ['2027-09-14', 365, 'ok'],
  ])('%s (%d days) falls in the %s bucket', (date, days, bucket) => {
    expect(calcDays(shipment(date), TODAY)).toBe(days);
    expect(level(date)).toBe(bucket);
  });

  it('buckets on the extension, not the original expiry', () => {
    // An extended shipment is judged on the new deadline: an expiry three months
    // in the past extended into next year is on track, not overdue.
    expect(level('2026-06-01', '2027-06-01')).toBe('ok');
    // And the reverse: a distant expiry pulled back by an extension is overdue.
    expect(level('2026-12-31', '2026-09-13')).toBe('overdue');
  });

  it('falls back to the expiry date when the extension is absent or blank', () => {
    expect(level('2026-09-21', null)).toBe('urgent');
    expect(level('2026-09-21', '')).toBe('urgent');
  });

  it('only ever returns one of the seven presentation buckets', () => {
    const dates = [
      null,
      '',
      '2020-01-01',
      '2026-09-14',
      '2026-09-22',
      '2026-10-01',
      '2026-11-01',
      '2030-01-01',
    ];
    for (const d of dates) {
      for (const status of ['Open', 'Open - Extended', 'Closed', '']) {
        const l = alertLevelFor(d, null, status, TODAY);
        expect(ALERT_LABEL[l]).toBeTruthy();
        expect(BUCKET_HEX[l]).toBeTruthy();
      }
    }
  });

  it('defaults the anchor to now when no date is passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    try {
      expect(alertLevelFor('2026-09-14', null, 'Open')).toBe('urgent');
      expect(alertLevelFor('2026-09-13', null, 'Open')).toBe('overdue');
    } finally {
      vi.useRealTimers();
    }
  });

  it('anchors to the UTC day, so the 00:00–04:00 Gulf window reads one day late', () => {
    // 2026-09-14T01:00 Asia/Dubai is 2026-09-13T21:00Z. Anchored to the UTC day,
    // a shipment that expired on 13 Sep (Gulf: yesterday) still reads as expiring
    // today — 'urgent', not yet 'overdue'. Documented and deliberate: the anchor
    // matches calcDays, the SQL ORDER BY, and Postgres CURRENT_DATE on a UTC
    // server. Changing it here alone would make those four disagree.
    const gulfEarlyMorning = new Date('2026-09-13T21:00:00Z');
    expect(alertLevelFor('2026-09-13', null, 'Open', gulfEarlyMorning)).toBe('urgent');
    expect(alertLevelFor('2026-09-12', null, 'Open', gulfEarlyMorning)).toBe('overdue');
    // Once the UTC day catches up, the same row is overdue.
    expect(alertLevelFor('2026-09-13', null, 'Open', TODAY)).toBe('overdue');
  });

  it('agrees with calcDays on which side of the overdue line a row sits', () => {
    for (let offset = -5; offset <= 70; offset++) {
      const d = new Date(Date.UTC(2026, 8, 14) + offset * 86400000).toISOString().slice(0, 10);
      const days = calcDays(shipment(d), TODAY)!;
      expect(level(d) === 'overdue').toBe(days < 0);
    }
  });

  it('shipmentAlertLevel reads the three fields off a row', () => {
    const row = {
      expiry_date: '2026-09-13',
      extended_date: '2026-10-14',
      status: 'Open - Extended',
    } as Shipment;
    expect(shipmentAlertLevel(row, TODAY)).toBe('plan');
    expect(shipmentAlertLevel({ ...row, status: 'Closed' }, TODAY)).toBe('closed');
  });
});

describe('alert level presentation maps', () => {
  const levels = ['overdue', 'urgent', 'action', 'plan', 'info', 'ok', 'closed'];

  it('covers the same seven buckets in every map', () => {
    expect(Object.keys(ALERT_LABEL).sort()).toEqual([...levels].sort());
    expect(Object.keys(ALERT_PILL).sort()).toEqual([...levels].sort());
    expect(Object.keys(ALERT_DOT).sort()).toEqual([...levels].sort());
    expect(Object.keys(BUCKET_HEX).sort()).toEqual([...levels].sort());
  });

  it('gives every bucket a label, a pill, a dot and a hex colour', () => {
    for (const level of levels) {
      expect(ALERT_LABEL[level]).toBeTruthy();
      expect(ALERT_PILL[level]).toBeTruthy();
      expect(ALERT_DOT[level]).toBeTruthy();
      expect(BUCKET_HEX[level]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('uses a distinct colour per bucket so the chart legend is unambiguous', () => {
    expect(new Set(Object.values(BUCKET_HEX)).size).toBe(levels.length);
    expect(new Set(Object.values(ALERT_LABEL)).size).toBe(levels.length);
  });

  it('names the overdue and extended-plan buckets as the UI expects', () => {
    expect(ALERT_LABEL.overdue).toBe('Overdue');
    expect(ALERT_LABEL.plan).toBe('Plan ext.');
    expect(ALERT_LABEL.closed).toBe('Closed');
    expect(BUCKET_HEX.overdue).toBe('#ef4444');
  });

  it('returns undefined for a bucket the database does not define', () => {
    // The callers all fall back with `?? row.alert_level`, so an unknown level
    // must miss rather than resolve to something misleading.
    expect(ALERT_LABEL.expired).toBeUndefined();
    expect(BUCKET_HEX['']).toBeUndefined();
  });
});

describe('status badges', () => {
  it.each([
    ['Open', 'Open'],
    ['Open - Extended', 'Open · Extended'],
    ['Closed', 'Closed'],
    ['Closed - Refund Recovered', 'Closed · Refund Recovered'],
  ])('labels %s as %s', (status, label) => {
    expect(getStatusBadge(status).label).toBe(label);
    expect(getStatusBadge(status).className).toContain('border');
  });

  it('falls back for an unknown or empty status', () => {
    expect(getStatusBadge('Frozen').label).toBe('Frozen');
    expect(getStatusBadge('').label).toBe('Unknown');
  });
});

describe('formatting', () => {
  it('formats a date with a padded day and short month', () => {
    expect(fmtDate('2026-09-14')).toMatch(/^14 Sept? 2026$/);
    expect(fmtDate('2026-01-05T00:00:00Z')).toBe('05 Jan 2026');
  });

  it('renders an em dash for a missing date', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate(undefined)).toBe('—');
    expect(fmtDate('')).toBe('—');
  });

  it('does not fall back for an unparseable date — toLocaleDateString does not throw', () => {
    // The try/catch in fmtDate is dead code: an invalid Date formats as the
    // literal string "Invalid Date" rather than raising.
    expect(fmtDate('not-a-date')).toBe('Invalid Date');
  });

  it('formats SAR and USD amounts to two decimals with thousands separators', () => {
    expect(sarFmt(1234.5)).toBe('SAR 1,234.50');
    expect(sarFmt('1000000')).toBe('SAR 1,000,000.00');
    expect(sarFmt(0)).toBe('SAR 0.00');
    expect(usdFmt(1234.5)).toBe('$1,234.50');
    expect(usdFmt(-250)).toBe('$-250.00');
  });

  it('renders an em dash for a missing or unparseable amount', () => {
    for (const fmt of [sarFmt, usdFmt]) {
      expect(fmt(null)).toBe('—');
      expect(fmt(undefined)).toBe('—');
      expect(fmt('')).toBe('—');
      expect(fmt('abc')).toBe('—');
    }
  });
});
