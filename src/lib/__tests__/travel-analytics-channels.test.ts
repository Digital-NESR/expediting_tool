import { describe, expect, it } from 'vitest';
import {
  buildChannelBand,
  type ChannelSignals,
  type ScopedBooking,
} from '@/lib/travel-analytics/queries';

/**
 * BTO (booked in the portal) against OFF (arranged offline, entered afterwards).
 *
 * The figure this band exists to protect is `uncheckedChannels`. The policy engine and the
 * cheapest-fare comparison only ever run inside the Travel Portal, so an offline booking
 * cannot be flagged — it is never looked at. A reader comparing the two columns without being
 * told that would conclude offline booking is the compliant channel, which is the exact
 * opposite of what the data supports. Everything below is about that one inversion.
 */

const booking = (o: Partial<ScopedBooking> = {}): ScopedBooking => ({
  code: 'BTO100001',
  country: 'HQ Dubai',
  costCentre: 'CC100',
  department: null,
  companyCode: '2100',
  companyName: 'NESR',
  segment: 'Drilling',
  employeeId: 'E1',
  employeeName: 'A Traveller',
  channel: 'BTO',
  channelLabel: 'Booked in the portal',
  status: 'Confirmed',
  travelType: 'Business Travel',
  direction: 'Return',
  cabinClass: 'Economy',
  origin: 'DXB',
  destination: 'DMM',
  month: '2026-06',
  createdAt: '2026-06-01T00:00:00.000Z',
  departureDate: '2026-06-10',
  leadDays: 9,
  amountUsd: 240,
  justification: null,
  ...o,
});

const off = (o: Partial<ScopedBooking> = {}) =>
  booking({ code: 'OFF200001', channel: 'OFF', channelLabel: 'Booked offline', ...o });

const signals = (flagged: string[] = [], savings: [string, number][] = []): ChannelSignals => ({
  flagged: new Set(flagged),
  savingsByCode: new Map(savings),
});

describe('buildChannelBand', () => {
  it('splits spend and volume by channel', () => {
    const band = buildChannelBand(
      [
        booking({ amountUsd: 100 }),
        booking({ code: 'BTO2', amountUsd: 300 }),
        off({ amountUsd: 50 }),
      ],
      signals(),
    );
    const bto = band.rows.find((r) => r.channel === 'BTO');
    expect(bto?.bookings).toBe(2);
    expect(bto?.spendUsd).toBe(400);
    expect(band.rows.find((r) => r.channel === 'OFF')?.spendUsd).toBe(50);
  });

  it('orders the channels by volume, so the main one leads', () => {
    const band = buildChannelBand([off(), off({ code: 'OFF2' }), booking()], signals());
    expect(band.rows[0].channel).toBe('OFF');
  });

  it('averages the ticket over priced bookings only', () => {
    /* 90 of the 230 bookings in the live feed carry no value. Averaging over them measures the
       gap in the feed rather than the cost of a seat. */
    const band = buildChannelBand(
      [booking({ amountUsd: 400 }), booking({ code: 'BTO2', amountUsd: 0 })],
      signals(),
    );
    expect(band.rows[0].pricedBookings).toBe(1);
    expect(band.rows[0].averageTicketUsd).toBe(400);
  });

  it('reports no average rather than zero when nothing is priced', () => {
    const band = buildChannelBand([booking({ amountUsd: 0 })], signals());
    expect(band.rows[0].averageTicketUsd).toBeNull();
  });

  it('flags a channel that has bookings but no compliance signal at all', () => {
    const band = buildChannelBand(
      [booking({ code: 'BTO1' }), off({ code: 'OFF1' })],
      signals(['BTO1'], [['BTO1', 120]]),
    );
    expect(band.uncheckedChannels).toEqual(['OFF']);
    expect(band.rows.find((r) => r.channel === 'OFF')?.flaggedBookings).toBe(0);
    expect(band.rows.find((r) => r.channel === 'OFF')?.savingsCovered).toBe(0);
  });

  it('does NOT flag a channel that was checked and came back clean', () => {
    /* The distinction the whole band turns on: zero violations with savings coverage is a
       genuine clean record, and must not be labelled unchecked. */
    const band = buildChannelBand([off({ code: 'OFF1' })], signals([], [['OFF1', 0]]));
    expect(band.uncheckedChannels).toEqual([]);
    expect(band.rows[0].savingsCovered).toBe(1);
  });

  it('does not flag a channel that has violations but no savings analysis', () => {
    const band = buildChannelBand([off({ code: 'OFF1' })], signals(['OFF1']));
    expect(band.uncheckedChannels).toEqual([]);
  });

  it('sums missed savings only over the bookings the feed covers', () => {
    const band = buildChannelBand(
      [booking({ code: 'B1' }), booking({ code: 'B2' })],
      signals([], [['B1', 75]]),
    );
    expect(band.rows[0].savingsCovered).toBe(1);
    expect(band.rows[0].missedSavingsUsd).toBe(75);
  });

  it('builds the monthly trend in calendar order', () => {
    const band = buildChannelBand(
      [
        booking({ month: '2026-07' }),
        booking({ code: 'B2', month: '2026-06' }),
        off({ month: '2026-06' }),
      ],
      signals(),
    );
    expect(band.byMonth.map((m) => m.month)).toEqual(['2026-06', '2026-07']);
    expect(band.byMonth[0].counts).toEqual({ BTO: 1, OFF: 1 });
  });

  it('holds together with nothing at all', () => {
    const band = buildChannelBand([], signals());
    expect(band).toEqual({ rows: [], byMonth: [], uncheckedChannels: [] });
  });
});
