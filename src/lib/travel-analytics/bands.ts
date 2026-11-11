/**
 * The band builders: pure folds over rows that have already been fetched.
 *
 * Split out of `queries.ts` so the browser can call them. That file opens database pools at
 * module scope, so importing anything from it pulls a pool into the client bundle -- which is
 * what stopped the analytics board from filtering in the browser, even though none of this code
 * touches a database.
 *
 * The TYPES stay in `queries.ts`, beside the payload they describe, and are imported here with
 * `import type`. TypeScript erases those imports entirely, so they cost nothing at runtime and
 * cannot drag the pools across.
 *
 * Nothing in this file may import `queries.ts` for a VALUE. That is the rule that keeps it
 * usable from a client component.
 */

import { shortMonthYear } from '@/lib/format';
import {
  AGEING_BUCKETS,
  ageingBucket,
  routeLabel,
  segmentLabel,
  spendPopulation,
  spendPopulationNote,
  ADVANCE_BOOKING_THRESHOLD_DAYS,
  LEAD_TIME_BUCKETS,
  type AgeingBucketId,
  type SpendPopulation,
} from './figures';
import type {
  AgeingBar,
  ChannelBand,
  ChannelRow,
  ChannelSignals,
  DayGroup,
  FinanceBand,
  MonthGroup,
  OptimisationBand,
  QualityCounts,
  QualityFlag,
  ScopedBooking,
  SpendGroup,
} from './queries';

/**
 * How a trip was booked, read off its reference.
 *
 * `BTO…` went through the Travel Portal. `OFF…` was arranged offline over email and entered
 * afterwards, which is why those 76 bookings carry no policy violations and no savings
 * analysis: they never passed the checks that produce either. Their compliance figures are
 * absent, not clean, and anything that averages the two together will quietly report the
 * portal as worse behaved than the channel that is not checked at all.
 *
 * Derived from the prefix because the feed has no column for it. Anything that is neither is
 * `Other` rather than guessed into one of the two.
 */
export type BookingChannel = 'BTO' | 'OFF' | 'Other';

export function bookingChannel(code: string | null | undefined): BookingChannel {
  const c = String(code ?? '')
    .trim()
    .toUpperCase();
  if (c.startsWith('BTO')) return 'BTO';
  if (c.startsWith('OFF')) return 'OFF';
  return 'Other';
}

/** What a reader sees. The codes mean nothing to anybody who has not been told. */
export const CHANNEL_LABEL: Record<BookingChannel, string> = {
  BTO: 'Booked in the portal',
  OFF: 'Booked offline',
  Other: 'Unclassified',
};

/** A `date` column arrives as a Date at local midnight; only the calendar part means anything. */
export function isoDate(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Group bookings by a key and give each group its own spend population.
 *
 * Every grouped figure on the dashboard goes through here, which is what makes the "$0 bookings
 * count as bookings and not as prices" rule hold per country and per month as well as in the
 * headline — a global caption would otherwise be quietly wrong for the three months that carry
 * most of the zeroes.
 */
export function groupSpend<T>(
  rows: readonly ScopedBooking[],
  keyOf: (b: ScopedBooking) => string | null,
  extra?: (b: ScopedBooking) => Partial<T>,
): (SpendGroup & Partial<T>)[] {
  const buckets = new Map<string, { rows: ScopedBooking[]; extra: Partial<T> }>();
  for (const b of rows) {
    const key = keyOf(b);
    if (key === null) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.rows.push(b);
    else buckets.set(key, { rows: [b], extra: extra ? extra(b) : {} });
  }
  return [...buckets.entries()]
    .map(([label, { rows: group, extra: ex }]) => ({
      label,
      ...spendPopulation(group.map((b) => b.amountUsd)),
      ...ex,
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd || b.bookings - a.bookings);
}

export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The two booking channels, side by side.
 *
 * The finding this exists to make visible: offline bookings have no policy flags and no
 * savings analysis, because neither is produced for a trip that never went through the
 * portal. Their compliance record is empty, not clean, and a reader comparing the columns
 * without being told would conclude the opposite of the truth.
 */
export function buildChannelBand(
  bookings: readonly ScopedBooking[],
  signals: ChannelSignals,
): ChannelBand {
  const byChannel = new Map<BookingChannel, ScopedBooking[]>();
  for (const b of bookings) {
    const list = byChannel.get(b.channel) ?? [];
    list.push(b);
    byChannel.set(b.channel, list);
  }

  const rows: ChannelRow[] = [...byChannel.entries()]
    .map(([channel, list]) => {
      const priced = list.filter((b) => b.amountUsd > 0);
      const covered = list.filter((b) => signals.savingsByCode.has(b.code));
      return {
        channel,
        label: CHANNEL_LABEL[channel],
        bookings: list.length,
        spendUsd: list.reduce((sum, b) => sum + b.amountUsd, 0),
        pricedBookings: priced.length,
        averageTicketUsd: priced.length
          ? priced.reduce((sum, b) => sum + b.amountUsd, 0) / priced.length
          : null,
        flaggedBookings: list.filter((b) => signals.flagged.has(b.code)).length,
        savingsCovered: covered.length,
        missedSavingsUsd: covered.reduce(
          (sum, b) => sum + (signals.savingsByCode.get(b.code) ?? 0),
          0,
        ),
      };
    })
    .sort((a, z) => z.bookings - a.bookings);

  const months = new Map<string, Record<string, number>>();
  for (const b of bookings) {
    if (!b.month) continue;
    const row = months.get(b.month) ?? {};
    row[b.channel] = (row[b.channel] ?? 0) + 1;
    months.set(b.month, row);
  }

  return {
    rows,
    uncheckedChannels: rows
      .filter((r) => r.bookings > 0 && r.flaggedBookings === 0 && r.savingsCovered === 0)
      .map((r) => r.channel),
    byMonth: [...months.entries()]
      .sort((a, z) => a[0].localeCompare(z[0]))
      .map(([month, counts]) => ({
        month,
        label: shortMonthYear(new Date(`${month}-01T00:00:00`)),
        counts,
      })),
  };
}

export function emptyFinance(): FinanceBand {
  return {
    note: spendPopulationNote(spendPopulation([])),
    byMonth: [],
    byDay: [],
    byCountry: [],
    byCostCentre: [],
    costCentresBeyondTop: 0,
    byCompany: [],
    bySegment: [],
    byTravelType: [],
    byCabinClass: [],
    rejected: [],
    rejectedSpendUsd: 0,
  };
}

export const TOP_COST_CENTRES = 15;

export function buildFinance(
  bookings: readonly ScopedBooking[],
  spend: SpendPopulation,
): FinanceBand {
  const byMonth: MonthGroup[] = groupSpend(bookings, (b) => b.month)
    .map((g) => ({
      ...g,
      month: g.label,
      /* `2026-06` sorts correctly and reads badly. The label is built from the first of the
         month rather than parsed from a date in the group, so an empty month would still be
         spelled the same way if one is ever back-filled. */
      label: shortMonthYear(new Date(`${g.label}-01T00:00:00`)),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  /* Keyed on the booking date rather than the departure date, matching `byMonth`: this chart
     answers "when was the money committed", and 44 bookings in this feed depart before they
     were created, which would put spend in the wrong bucket on a departure axis. */
  const byDay: DayGroup[] = groupSpend(bookings, (b) =>
    b.createdAt ? b.createdAt.slice(0, 10) : null,
  )
    .map((g) => ({ ...g, date: g.label }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const allCostCentres = groupSpend<{ sublabel: string | null }>(
    bookings,
    (b) => b.costCentre,
    (b) => ({ sublabel: b.department ?? b.country ?? null }),
  );

  const rejected = bookings.filter((b) => b.status === 'Rejected');

  return {
    byDay,
    note: spendPopulationNote(spend),
    byMonth,
    /* Unmapped bookings reach only an admin, and when they do they are a visible row rather than
       a gap in the total — which is the whole reason `includeUnmapped` exists. */
    byCountry: groupSpend(bookings, (b) => b.country ?? 'Not mapped to a country'),
    byCostCentre: allCostCentres.slice(0, TOP_COST_CENTRES),
    costCentresBeyondTop: Math.max(0, allCostCentres.length - TOP_COST_CENTRES),
    byCompany: groupSpend<{ sublabel: string | null }>(
      bookings,
      (b) => b.companyName || b.companyCode || 'Not recorded',
      (b) => ({ sublabel: b.companyCode }),
    ),
    bySegment: groupSpend(bookings, (b) => segmentLabel(b.segment)),
    byTravelType: groupSpend(
      bookings,
      (b) => [b.travelType, b.direction].filter(Boolean).join(' · ') || 'Not recorded',
    ),
    byCabinClass: groupSpend(bookings, (b) => b.cabinClass || 'Not recorded'),
    /* Finance sees these. The user asked for them explicitly, and the labelling is the point:
       a rejected request is not spend and must never be read as though it were. */
    rejected: rejected.map((b) => ({
      code: b.code,
      employeeName: b.employeeName,
      country: b.country,
      amountUsd: b.amountUsd,
      createdAt: b.createdAt,
      departureDate: b.departureDate,
      route: routeLabel(b.origin, b.destination),
      justification: b.justification,
    })),
    rejectedSpendUsd: rejected.reduce((sum, b) => sum + b.amountUsd, 0),
  };
}

export function emptyOptimisation(): OptimisationBand {
  return {
    selectedSegments: 0,
    cheapestAlsoSelected: 0,
    missedSavingsByCarrier: [],
    missedSavingsByRoute: [],
    violationTotals: [],
    violationTypes: [],
    violationsByMonth: [],
    leadTime: LEAD_TIME_BUCKETS.map((b) => ({ ...b, bookings: 0 })),
    advanceThresholdDays: ADVANCE_BOOKING_THRESHOLD_DAYS,
    carrierMix: [],
    decidedAgeing: AGEING_BUCKETS.map((b) => ({ ...b, count: 0 })),
    pendingAgeing: AGEING_BUCKETS.map((b) => ({ ...b, count: 0 })),
    decidedCount: 0,
    averageDecisionDays: null,
    worstDecisionDays: null,
    pendingCount: 0,
    averagePendingDays: null,
    oldestPendingDays: null,
    approverBottlenecks: [],
  };
}

export function bucketAges(days: readonly number[]): AgeingBar[] {
  const counts = new Map<AgeingBucketId, number>();
  for (const d of days) {
    const id = ageingBucket(d);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return AGEING_BUCKETS.map((b) => ({ ...b, count: counts.get(b.id) ?? 0 }));
}

export const PASSPORT_HORIZON_DAYS = 183;

/**
 * The data-quality panel.
 *
 * "Keep everything, flag it" was the user's instruction, so nothing counted here has been
 * removed from any other figure on the dashboard. Each row says what it is and what it does to
 * the numbers above it, because a count with no consequence attached invites somebody to decide
 * the data is simply broken and stop reading.
 */
export function buildQualityFlags(
  bookings: readonly ScopedBooking[],
  counts: QualityCounts,
  derived: { sharedEmails: number },
): QualityFlag[] {
  const zeroValued = bookings.filter((b) => b.amountUsd === 0);
  const bookedLate = bookings.filter((b) => b.leadDays !== null && b.leadDays < 0);
  const unmapped = bookings.filter((b) => !b.country);
  const padded = bookings.filter((b) => b.segment !== null && b.segment !== b.segment.trim());
  const worstLead = bookedLate.length ? Math.min(...bookedLate.map((b) => b.leadDays!)) : 0;
  const lateSpend = bookedLate.reduce((sum, b) => sum + b.amountUsd, 0);
  const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

  const flags: QualityFlag[] = [
    {
      id: 'zero-value',
      label: 'Bookings priced at $0',
      count: zeroValued.length,
      detail:
        `The feed records these as the number zero, not as a missing value, and they cluster on ` +
        `a handful of dates — the shape of a pricing run that failed rather than of free travel. ` +
        `They are counted in every booking number on this page and excluded from every average, ` +
        `which is what the caption under each spend chart is telling you.`,
    },
    {
      id: 'departure-before-creation',
      label: 'Booked after the flight departed',
      count: bookedLate.length,
      detail:
        `Departure date earlier than creation date, by up to ${Math.abs(worstLead)} days, ` +
        `totalling ${usd(lateSpend)}. All are Approved. They sit in the first bucket of the ` +
        `lead-time histogram rather than being clipped to zero — and none of them is flagged as ` +
        `an advance-booking violation, so a negative lead time appears to fall straight through ` +
        `the Travel Portal's own seven-day check.`,
    },
    {
      id: 'unmapped',
      label: 'Bookings with no country',
      count: unmapped.length,
      detail:
        `Neither the cost centre nor the company code appears in the cost-centre mapping, so ` +
        `these cannot be placed in a country and only an admin sees them. Today they are the ` +
        `test company's rows. A real booking appearing here means the mapping needs a row ` +
        `adding at /admin/laptop?section=cost-centers.`,
    },
    {
      id: 'padded-segment',
      label: 'Segment names padded by the feed',
      count: padded.length,
      detail:
        `Values arrive padded to a fixed width ("MANAGEMENT          "). They are trimmed before ` +
        `grouping, so the same segment cannot appear twice; this count is here so the padding is ` +
        `known about rather than discovered by someone else later.`,
    },
    {
      id: 'null-carrier',
      label: 'Flight segments with no carrier',
      count: counts.nullCarrierSegments,
      detail:
        `Shown in the carrier mix as "Carrier not recorded" rather than dropped. Dropping them ` +
        `would make every named airline look like a larger share of travel than it is.`,
    },
    {
      id: 'traveller-employee-id',
      label: 'Traveller records with no employee ID',
      count: counts.travellersMissingEmployeeId,
      detail:
        `Of ${counts.travellerRecords.toLocaleString()} traveller records in scope. The directory ` +
        `is therefore keyed on email and name together rather than on employee ID — email alone ` +
        `would merge the family members who share one address on a single booking, and lose a ` +
        `passport expiry in the process. The cost is that somebody whose name is spelled two ` +
        `ways across two bookings appears twice, which is the safer way round to be wrong.`,
    },
    {
      id: 'bookings-without-travellers',
      label: 'Bookings with no traveller record',
      count: Math.max(0, bookings.length - counts.bookingsWithTravellers),
      detail:
        `The traveller feed covers ${counts.bookingsWithTravellers.toLocaleString()} of the ` +
        `${bookings.length.toLocaleString()} bookings in scope. The directory and the passport ` +
        `list can only see the ones it covers, so neither is a complete roll of who travelled.`,
    },
    {
      id: 'shared-emails',
      label: 'Email addresses used by more than one traveller name',
      count: derived.sharedEmails,
      detail:
        `Mostly families on one reservation — three Kariyadaths travel under a single address — ` +
        `which is why the directory treats a name and an address together as the person rather ` +
        `than the address alone. A few are one person spelled two ways and so appear twice. ` +
        `Splitting them is the deliberate choice: a duplicated row is something you can see, and ` +
        `a merged one hides whichever passport expiry the newer record overwrote.`,
    },
    {
      id: 'orphan-segments',
      label: 'Flight segments belonging to no booking',
      count: counts.orphanSegments,
      detail:
        `Their \`code\` column is NULL, so they cannot be attached to a booking, a country or a ` +
        `reader. They are therefore absent from the cheapest-fare adherence figure and the ` +
        `carrier mix — which is why adherence here reads lower than a count taken straight off ` +
        `the flightsegments table: that count includes segments nobody can attribute.`,
    },
    {
      id: 'orphan-travellers',
      label: 'Traveller records belonging to no booking',
      count: counts.orphanTravellers,
      detail:
        `Also a NULL \`code\`, and every one of them carries a passport number. Nothing on this ` +
        `page can reach them: with no booking there is no country, and with no country there is ` +
        `no reader they belong to. They are listed here because the traveller directory is ` +
        `incomplete by exactly this many records, not because the dashboard is hiding them.`,
    },
    {
      id: 'savings-coverage',
      label: 'Bookings the savings feed does not cover',
      count: Math.max(0, bookings.length - counts.bookingsWithSavings),
      detail:
        `Missed savings are computed over the ${counts.bookingsWithSavings.toLocaleString()} ` +
        `bookings that have a savings analysis. The headline figure is therefore a floor, not a ` +
        `total: the uncovered bookings may have missed savings nobody has measured.`,
    },
  ];

  /* Every flag is returned, including the ones sitting at zero. "No unmapped bookings" is
     information, and a panel that dropped its empty rows would shrink and grow between readers
     in a way that looks like checks silently switching themselves off. */
  return flags;
}
