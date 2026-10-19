/**
 * The arithmetic the travel dashboard is allowed to do, and the labels that keep it honest.
 *
 * The user's instruction for this data was "keep everything, flag it", and these helpers are
 * what that means in practice. Nothing here filters a booking out. What they do instead is
 * state the population a figure was computed over, so that a number which cannot mean what it
 * looks like is never shown as though it could.
 *
 * The case that forced this: 90 of the 230 bookings carry `totalAmountUSD` = 0 — the literal
 * number, not NULL — clustered on three dates in February, June and July, which is the shape of
 * a feed that failed to price a batch rather than of free travel. Summing them is harmless; the
 * total is still the total. Dividing by them is not. An average ticket over 230 bookings reads
 * $511 and an average over the 140 that carry a price reads $839, and the first of those is a
 * number nobody should ever be shown without being told what is in it.
 */

/** A figure and the population it was computed over. */
export interface SpendPopulation {
  /** Every booking in scope, including the ones with no amount. */
  bookings: number;
  /** The bookings that carry a non-zero amount — the denominator for any average. */
  priced: number;
  /** Bookings recorded as exactly $0. Reported, never dropped. */
  zeroValued: number;
  /** Summed over everything, because a zero adds nothing and excluding it would change nothing. */
  totalUsd: number;
  /** Total over `priced`, or null when nothing in scope carries a price. */
  averageTicketUsd: number | null;
}

/**
 * Sum a set of booking amounts and say what the sum is made of.
 *
 * The denominator is `priced`, never `bookings`. That single choice is the whole point of this
 * function existing rather than the callers each writing `sum / rows.length`, which is what
 * fifteen separate aggregates would otherwise have done, and which would have been wrong in
 * fifteen places the moment the feed dropped another batch of prices.
 */
export function spendPopulation(
  amounts: readonly (number | string | null | undefined)[],
): SpendPopulation {
  let totalUsd = 0;
  let priced = 0;
  let zeroValued = 0;

  for (const raw of amounts) {
    /* `pg` hands back a numeric column as a string, so a raw `+` would concatenate. A null is a
       missing price and a 0 is a recorded zero; the feed only produces the latter, but both are
       counted as unpriced because neither can carry an average. */
    const n = raw === null || raw === undefined || raw === '' ? 0 : Number(raw);
    const value = Number.isFinite(n) ? n : 0;
    totalUsd += value;
    if (value === 0) zeroValued += 1;
    else priced += 1;
  }

  return {
    bookings: amounts.length,
    priced,
    zeroValued,
    totalUsd,
    averageTicketUsd: priced > 0 ? totalUsd / priced : null,
  };
}

/**
 * The sentence that goes under a spend chart.
 *
 * Returned as text rather than left to each chart's own caption, so that a chart added later
 * cannot quietly ship without one. When nothing is missing it says so plainly instead of
 * returning an empty string — "all 27 bookings carry an amount" is information, and a caption
 * that disappears on some months and not others reads like a bug.
 */
export function spendPopulationNote(pop: SpendPopulation): string {
  if (pop.bookings === 0) return 'No bookings in scope.';
  if (pop.zeroValued === 0) {
    return `All ${pop.bookings.toLocaleString()} bookings carry an amount.`;
  }
  return (
    `Spend covers the ${pop.priced.toLocaleString()} of ${pop.bookings.toLocaleString()} ` +
    `bookings that carry an amount. ${pop.zeroValued.toLocaleString()} are recorded as $0 in the ` +
    `feed and are counted in the booking numbers but cannot contribute to an average.`
  );
}

/* ═══ Lead time ══════════════════════════════════════════════════════════════ */

/**
 * How many days before departure a booking was created, and therefore which side of the
 * advance-booking rule it falls on.
 *
 * THE THRESHOLD IS 7 DAYS, and it is derived rather than assumed. Every one of the 31 bookings
 * the feed flags with `Advance Booking Policy Violation` has a lead time between 1 and 6 days,
 * and not one booking at 7 days or more is flagged. The Travel Portal is applying a seven-day
 * rule, so that is what the histogram marks.
 *
 * The first bucket is not a mistake. 44 bookings have a departure date BEFORE their creation
 * date, by as much as 131 days, and all 44 are Approved. They are kept and labelled rather than
 * clipped to zero, because collapsing them into "0–2 days" would hide the more interesting fact
 * that NONE of them is flagged as an advance-booking violation: a negative lead time appears to
 * fall straight through the Travel Portal's own check.
 */
export const ADVANCE_BOOKING_THRESHOLD_DAYS = 7;

export const LEAD_TIME_BUCKETS = [
  { id: 'negative', label: 'Booked after departure', breachesPolicy: false },
  { id: '0-2', label: '0–2 days', breachesPolicy: true },
  { id: '3-6', label: '3–6 days', breachesPolicy: true },
  { id: '7-13', label: '7–13 days', breachesPolicy: false },
  { id: '14-29', label: '14–29 days', breachesPolicy: false },
  { id: '30+', label: '30 days or more', breachesPolicy: false },
] as const;

export type LeadTimeBucketId = (typeof LEAD_TIME_BUCKETS)[number]['id'];

/** Which bucket a lead time in days falls into. */
export function leadTimeBucket(days: number): LeadTimeBucketId {
  if (days < 0) return 'negative';
  if (days <= 2) return '0-2';
  if (days <= 6) return '3-6';
  if (days <= 13) return '7-13';
  if (days <= 29) return '14-29';
  return '30+';
}

/* ═══ Display spellings ══════════════════════════════════════════════════════ */

/**
 * `bookings.segment` arrives padded to twenty characters (`'MANAGEMENT          '`), and both a
 * null and an empty string occur. Untrimmed, the same segment groups as two rows whenever one
 * row of the feed was padded differently, so this runs on the grouping key and not only on the
 * label.
 */
export function segmentLabel(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  return trimmed || 'Not recorded';
}

/**
 * 71 of the 263 selected flight segments carry no `platingCarrierName`. They are a real quarter
 * of the carrier mix and dropping them would make Emirates look like a larger share of travel
 * than it is, so they get a name and stay in the chart.
 */
export function carrierLabel(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  return trimmed || 'Carrier not recorded';
}

/** `DXB → DMM`, or a readable stand-in when the feed left an end of the route out. */
export function routeLabel(
  origin: string | null | undefined,
  destination: string | null | undefined,
): string {
  const from = (origin ?? '').trim() || '???';
  const to = (destination ?? '').trim() || '???';
  return `${from} → ${to}`;
}

/* ═══ Who is one person ══════════════════════════════════════════════════════ */

/**
 * The key that decides whether two traveller records are the same human being.
 *
 * The feed carries one record per traveller per booking, so the directory has to merge them —
 * and it has to merge them on the right thing. EMAIL ALONE IS NOT A PERSON. Booking BTO100527
 * carries three records, MUHAMMED HEMIL, MUHAMMED ESHAN and NYZA HYRIN KARIYADATH, all under
 * `rawoof3@gmail.com`: a family travelling together on one reservation. Keyed on email alone
 * they collapse into one row, the newest record wins, and MUHAMMED HEMIL's passport — expiring
 * in February — silently stops appearing on the expiring-passports list. That is the failure
 * this function exists to prevent, and it is invisible: nothing anywhere says a passport was
 * dropped.
 *
 * So the key is email AND name, and the name alone when there is no email (87 of 194 records
 * have none). The cost is the opposite error: somebody whose name is spelled differently on
 * two bookings appears twice. That is the right direction to fail in — a duplicate row is
 * visible and someone will mention it, whereas a missing passport is not.
 */
export function travellerIdentityKey(
  email: string | null | undefined,
  name: string | null | undefined,
): string {
  /* Collapse runs of whitespace: the feed has `Ismail Qasem Mohammad  Al Shar'an` with a double
     space in it, and the same name typed once with one space would otherwise be a second person. */
  const person = (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const address = (email ?? '').trim().toLowerCase();
  return address ? `${address}|${person}` : person;
}

/**
 * One traveller's share of a booking that carried several of them.
 *
 * A booking is priced once and may carry a whole family: BTO100648 is $14,029 for five people.
 * Attributing the full amount to each of them makes one booking appear as $70,145 of travel
 * down the directory's spend column, and puts four dependants near the top of a list a reader
 * will use to ask who is travelling most. An even split is not a perfect apportionment — the
 * feed does not price passengers individually — but it is the only division that sums back to
 * what was actually paid, which is the property that matters in a column people will total.
 */
export function shareOfBooking(amountUsd: number, travellersOnBooking: number): number {
  if (!Number.isFinite(amountUsd)) return 0;
  /* Guard the zero: a traveller record always implies at least one traveller, but a count
     arriving as 0 would turn the whole column into Infinity. */
  return travellersOnBooking > 0 ? amountUsd / travellersOnBooking : amountUsd;
}

/* ═══ Ageing ═════════════════════════════════════════════════════════════════ */

/**
 * Approval ageing buckets, shared by the decided and the still-pending lists so the two can be
 * read against each other. The top bucket is open-ended because the oldest pending approval in
 * the feed is 245 days and a closed top bucket would have to be re-cut every quarter.
 */
export const AGEING_BUCKETS = [
  { id: '0-1', label: 'Within a day' },
  { id: '2-3', label: '2–3 days' },
  { id: '4-7', label: '4–7 days' },
  { id: '8-30', label: '8–30 days' },
  { id: '31+', label: 'Over 30 days' },
] as const;

export type AgeingBucketId = (typeof AGEING_BUCKETS)[number]['id'];

export function ageingBucket(days: number): AgeingBucketId {
  /* A negative age is a clock-skew artefact between the two timestamps, not a decision made
     before the request existed. It belongs with the fastest decisions, not in a bucket of its
     own that would invite somebody to read meaning into it. */
  if (days <= 1) return '0-1';
  if (days <= 3) return '2-3';
  if (days <= 7) return '4-7';
  if (days <= 30) return '8-30';
  return '31+';
}
