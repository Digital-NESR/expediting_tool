import { describe, expect, it } from 'vitest';
import {
  ADVANCE_BOOKING_THRESHOLD_DAYS,
  ageingBucket,
  carrierLabel,
  LEAD_TIME_BUCKETS,
  leadTimeBucket,
  routeLabel,
  segmentLabel,
  shareOfBooking,
  spendPopulation,
  spendPopulationNote,
  travellerIdentityKey,
  type LeadTimeBucketId,
} from '@/lib/travel-analytics/figures';

/**
 * The arithmetic that has to stay honest when the feed is not.
 *
 * The user's instruction for this data was "keep everything, flag it", and these are the
 * helpers that make the second half of that true. The failure they guard against is not a
 * crash: it is a dashboard that confidently shows an average ticket of $511 because 90 of the
 * 230 bookings were priced at $0 by a feed that failed, and nothing on the page says so.
 */

describe('spend and the population behind it', () => {
  /*
   * The exact shape of the October 2026 feed, in miniature. 90 of 230 bookings carry
   * `totalAmountUSD` = 0 — the literal number, not NULL — so the sum is right and the average
   * is only right if the zeroes are out of the denominator.
   */
  it('averages over the priced bookings, never over all of them', () => {
    const pop = spendPopulation([100, 200, 0, 0]);
    expect(pop.bookings).toBe(4);
    expect(pop.priced).toBe(2);
    expect(pop.zeroValued).toBe(2);
    expect(pop.totalUsd).toBe(300);
    expect(pop.averageTicketUsd).toBe(150); // not 75
  });

  /* `pg` hands a numeric column back as a string. A `+` on those concatenates, and the bug it
     produces is a total of "0100200" rather than an exception — a number large enough that
     nobody reads it as a dollar figure, on a card that says it is one. */
  it('adds numeric strings as numbers', () => {
    expect(spendPopulation(['100.50', '200.25']).totalUsd).toBeCloseTo(300.75, 2);
  });

  it('treats a missing amount as unpriced rather than as zero spend of real money', () => {
    const pop = spendPopulation([null, undefined, '', 500]);
    expect(pop.priced).toBe(1);
    expect(pop.zeroValued).toBe(3);
    expect(pop.averageTicketUsd).toBe(500);
  });

  /* Dividing by zero priced bookings gives Infinity, which renders as "$∞" and looks like the
     page is broken rather than like the month has no priced travel in it. */
  it('has no average at all when nothing is priced', () => {
    expect(spendPopulation([0, 0, 0]).averageTicketUsd).toBeNull();
    expect(spendPopulation([]).averageTicketUsd).toBeNull();
  });

  it('counts an empty scope as nothing rather than failing', () => {
    expect(spendPopulation([])).toMatchObject({ bookings: 0, priced: 0, totalUsd: 0 });
  });
});

describe('the caption under a spend chart', () => {
  /* The caption is produced here rather than written per chart, so a chart added next quarter
     cannot ship without one. These assertions are about the numbers being named, not the
     prose: a reader must be able to see 140 and 230 without doing arithmetic. */
  it('names both populations when some bookings are unpriced', () => {
    const note = spendPopulationNote(
      spendPopulation([...Array(140).fill(100), ...Array(90).fill(0)]),
    );
    expect(note).toContain('140');
    expect(note).toContain('230');
    expect(note).toContain('90');
  });

  /* Not an empty string. A caption that appears on some months and vanishes on others reads
     like a rendering bug; "all 27 carry an amount" is the answer to the same question. */
  it('still says something when every booking is priced', () => {
    expect(spendPopulationNote(spendPopulation([1, 2, 3]))).toMatch(/All 3 bookings/);
  });

  it('says so plainly when there is nothing in scope', () => {
    expect(spendPopulationNote(spendPopulation([]))).toBe('No bookings in scope.');
  });
});

describe('lead time and the advance-booking rule', () => {
  /*
   * SEVEN DAYS IS DERIVED, NOT ASSUMED. Every one of the 31 bookings the feed flags with
   * `Advance Booking Policy Violation` has a lead time between 1 and 6 days, and not one
   * booking at 7 days or more is flagged. If this constant is ever changed to a round number
   * somebody liked better, the marker on the histogram stops lining up with the violations
   * charted beside it.
   */
  it('marks the threshold at seven days', () => {
    expect(ADVANCE_BOOKING_THRESHOLD_DAYS).toBe(7);
  });

  it('puts every lead time under the threshold in a breaching bucket, and none above it', () => {
    const breaching = new Set<LeadTimeBucketId>(
      LEAD_TIME_BUCKETS.filter((b) => b.breachesPolicy).map((b) => b.id),
    );
    for (const days of [0, 1, 2, 3, 4, 5, 6]) {
      expect(breaching.has(leadTimeBucket(days)), `${days} days should breach`).toBe(true);
    }
    for (const days of [7, 8, 13, 14, 29, 30, 162]) {
      expect(breaching.has(leadTimeBucket(days)), `${days} days should not breach`).toBe(false);
    }
  });

  /*
   * The 44 bookings whose departure date precedes their creation date, by as much as 131 days,
   * all Approved. They get their own labelled bucket rather than being clipped into "0–2 days",
   * because clipping them would hide the finding: not one of them is flagged as an
   * advance-booking violation, so a negative lead time falls straight through the Travel
   * Portal's own check.
   */
  it('gives bookings made after departure their own bucket, and does not call them a breach', () => {
    expect(leadTimeBucket(-1)).toBe('negative');
    expect(leadTimeBucket(-131)).toBe('negative');
    const negative = LEAD_TIME_BUCKETS.find((b) => b.id === 'negative');
    expect(negative?.breachesPolicy).toBe(false);
    expect(negative?.label).toMatch(/after departure/i);
  });

  /* Every bucket has to be reachable, or the histogram silently has a column that can never
     hold anything and a range of days that lands nowhere. */
  it('covers every day count with exactly one bucket', () => {
    const seen = new Set(
      [-200, -1, 0, 2, 3, 6, 7, 13, 14, 29, 30, 400].map((d) => leadTimeBucket(d)),
    );
    expect([...seen].sort()).toEqual([...LEAD_TIME_BUCKETS.map((b) => b.id)].sort());
  });
});

describe('approval ageing', () => {
  it('buckets by age, with an open top for the 245-day-old approval', () => {
    expect(ageingBucket(0.4)).toBe('0-1');
    expect(ageingBucket(3)).toBe('2-3');
    expect(ageingBucket(7)).toBe('4-7');
    expect(ageingBucket(30)).toBe('8-30');
    expect(ageingBucket(245)).toBe('31+');
  });

  /* A decision timestamp fractionally before the booking's creation timestamp is clock skew
     between two systems, not an approval granted before the request existed. A bucket of its
     own would invite somebody to read meaning into a rounding error. */
  it('files a negative age with the fastest decisions rather than in a bucket of its own', () => {
    expect(ageingBucket(-0.2)).toBe('0-1');
  });
});

describe('splitting a booking between the people on it', () => {
  /*
   * Booking BTO100648 is $14,029 and carries five Afandys. Attributing the whole amount to
   * each of them put one booking into the directory as $70,145 of travel and pushed four
   * dependants to the top of a list a reader uses to ask who travels most. The split is even
   * because the feed does not price passengers individually; what matters is that the column
   * adds back to what was actually paid.
   */
  it('divides a shared booking so the column still totals the real spend', () => {
    const booking = 14029;
    const shares = [1, 2, 3, 4, 5].map(() => shareOfBooking(booking, 5));
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(booking, 6);
    expect(shares[0]).toBeCloseTo(2805.8, 2);
  });

  it('leaves a sole traveller with the whole booking', () => {
    expect(shareOfBooking(1234, 1)).toBe(1234);
  });

  /* A count of zero should be impossible — a traveller record implies a traveller — but it
     would render the entire column as "$∞" rather than failing anywhere a reader could see. */
  it('does not divide by a traveller count of zero', () => {
    expect(shareOfBooking(1234, 0)).toBe(1234);
    expect(Number.isFinite(shareOfBooking(1234, 0))).toBe(true);
  });

  it('keeps an unpriced booking at zero rather than producing NaN', () => {
    expect(shareOfBooking(0, 4)).toBe(0);
    expect(shareOfBooking(Number.NaN, 4)).toBe(0);
  });
});

describe('deciding that two traveller records are one person', () => {
  /*
   * THE BUG THIS WAS WRITTEN FOR. Booking BTO100527 carries three traveller records —
   * MUHAMMED HEMIL, MUHAMMED ESHAN and NYZA HYRIN KARIYADATH — all under one email,
   * `rawoof3@gmail.com`, because a family travelled together on one reservation. Keyed on
   * email alone they merge into a single directory row, the newest record wins, and MUHAMMED
   * HEMIL's passport expiring in February 2027 vanishes from the expiring-passports list with
   * nothing anywhere saying a record was dropped. It is only visible by counting: eight
   * records inside six months, and the list showed two people.
   */
  it('keeps family members who share one email apart', () => {
    const shared = 'rawoof3@gmail.com';
    const keys = new Set([
      travellerIdentityKey(shared, 'MUHAMMED HEMIL KARIYADATH'),
      travellerIdentityKey(shared, 'MUHAMMED ESHAN KARIYADATH'),
      travellerIdentityKey(shared, 'NYZA HYRIN KARIYADATH'),
    ]);
    expect(keys.size).toBe(3);
  });

  /* The merge still has to happen, or somebody who flew six times is six rows and their spend
     is split six ways. Aamil Raza Shakri has three records across three bookings. */
  it('merges the same person across their bookings', () => {
    expect(travellerIdentityKey('ashakri@nesr.com', 'Aamil Raza Shakri')).toBe(
      travellerIdentityKey('ASHAKRI@nesr.com', '  Aamil Raza Shakri '),
    );
  });

  /* `Ismail Qasem Mohammad  Al Shar'an` carries a double space in the feed. The same name typed
     with single spaces must not become a second traveller. */
  it('ignores the feed’s doubled spaces in a name', () => {
    expect(travellerIdentityKey(null, "Ismail Qasem Mohammad  Al Shar'an")).toBe(
      travellerIdentityKey(null, "Ismail Qasem Mohammad Al Shar'an"),
    );
  });

  /* 87 of 194 records have no email at all, so the name has to carry the key on its own. */
  it('falls back to the name when there is no email', () => {
    expect(travellerIdentityKey(null, 'Jane Doe')).toBe(travellerIdentityKey('', 'jane doe'));
  });

  /* Two different people with the same name and no email do collide. That is a known and
     accepted limit — but somebody with an email must never collide with somebody without one,
     or a named traveller silently absorbs an anonymous record's trips and spend. */
  it('does not merge a traveller who has an email with one who has none', () => {
    expect(travellerIdentityKey('jane@nesr.com', 'Jane Doe')).not.toBe(
      travellerIdentityKey(null, 'Jane Doe'),
    );
  });
});

describe('labels for the values the feed leaves out', () => {
  /* `segment` arrives padded to twenty characters. Untrimmed, 'MANAGEMENT          ' and
     'MANAGEMENT' group as two rows and the chart shows the same department twice. */
  it('trims the feed’s padding before a segment is used as a grouping key', () => {
    expect(segmentLabel('MANAGEMENT          ')).toBe('MANAGEMENT');
    expect(segmentLabel('MANAGEMENT')).toBe(segmentLabel('MANAGEMENT          '));
  });

  it('names the empty segment instead of grouping it under an empty string', () => {
    expect(segmentLabel('')).toBe('Not recorded');
    expect(segmentLabel(null)).toBe('Not recorded');
    expect(segmentLabel('    ')).toBe('Not recorded');
  });

  /* 71 of the 263 selected flight segments have no carrier name — more than a quarter. Dropping
     them would make Emirates' 69 segments look like a larger share of travel than they are. */
  it('gives an unnamed carrier a name so it stays in the mix', () => {
    expect(carrierLabel(null)).toBe('Carrier not recorded');
    expect(carrierLabel('Emirates')).toBe('Emirates');
  });

  it('renders a route with a missing end rather than printing null', () => {
    expect(routeLabel('DXB', 'DMM')).toBe('DXB → DMM');
    expect(routeLabel('DXB', null)).toBe('DXB → ???');
  });
});
