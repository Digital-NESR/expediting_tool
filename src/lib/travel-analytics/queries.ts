/**
 * Everything the Travel Portal dashboard reads, country-scoped and role-aware.
 *
 * A plain module, deliberately not `'use server'`: every export of one of those is a public POST
 * endpoint, and nothing in here resolves an actor. The scope is handed in, already resolved from
 * the session by `@/app/actions/travel-analytics`, which is the only caller.
 *
 * ── THE CROSS-DATABASE PROBLEM ──────────────────────────────────────────────────────────────
 * The bookings live in `travel_portal` and the cost-centre mapping that gives them a country
 * lives in `laptop_procurement_db`. Postgres cannot join across two databases in one query, so
 * one of the two has to travel. The mapping is 2,335 small rows and the bookings are 230, and
 * the mapping is the one that is already cached elsewhere in the app — so the mapping is loaded
 * once per request from the laptop pool, every booking's country is resolved in JS (see
 * `./country-map`), and the resulting (code, country) pairs are passed BACK INTO SQL as two
 * arrays. The alternative — shipping the whole mapping into fifteen aggregates — would send
 * 35,000 rows of reference data per page load to answer questions about 230 bookings.
 *
 * ── WHERE THE SCOPE IS APPLIED ──────────────────────────────────────────────────────────────
 * Exactly once, in `loadScopedBookings`, through `countryFilterSql`. That query returns the
 * bookings the reader may see; every other query in this file is restricted to the codes it
 * returned. The failure `countryFilterSql`'s own comment warns about is one query out of fifteen
 * forgetting the restriction, and the way to make that impossible is to have fourteen of them
 * unable to express it: they take a code list and nothing else. When the list is empty — which
 * is what a reader with no country resolves to, and is NOT the same as "all countries" — none of
 * them runs at all.
 *
 * ── WHAT IS AGGREGATED WHERE ────────────────────────────────────────────────────────────────
 * Booking-level figures (spend by month, country, cost centre, company, segment, travel type,
 * cabin class, the rejected list, lead time) are computed in JS from the rows that scoping query
 * already returned. That is not laziness about SQL: it is so that every one of them goes through
 * `spendPopulation`, which is the single definition of "the 90 bookings priced at $0 are counted
 * as bookings and excluded from averages". Fifteen `SUM()/COUNT(*)` pairs would have been fifteen
 * chances to divide by the wrong number. Figures that live in another table — savings, policy
 * violations, flight segments, approvers, travellers — are aggregated in SQL, where they belong.
 */

import { cache } from 'react';
import travelPortalPool from '@/lib/db-travel-portal';
import laptopProcurementPool from '@/lib/db-laptop';
import { ensureLaptopSchema } from '@/lib/laptop-procurement/schema';
import { logger } from '@/lib/logger';
import { shortMonthYear } from '@/lib/format';
import {
  buildCountryIndex,
  countryOptions,
  resolveBookingCountry,
  type CountryIndex,
} from './country-map';
import {
  ADVANCE_BOOKING_THRESHOLD_DAYS,
  AGEING_BUCKETS,
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
  type AgeingBucketId,
  type LeadTimeBucketId,
  type SpendPopulation,
} from './figures';
import {
  canRevealIdentityDocuments,
  canSeeOptimisation,
  countryFilterSql,
  type TravelRole,
  type TravelScope,
} from './scope';
import { buildMapData, buildTravelTypeBand, type MapData, type TravelTypeBand } from './routes';

const log = logger('travel-analytics-queries');

/* ═══ The cost-centre mapping ════════════════════════════════════════════════ */

/**
 * The mapping, loaded once per request.
 *
 * `cache()` has request scope, which is the right lifetime here: the dashboard reads it once and
 * a stale mapping would silently move a booking between countries. The laptop tool keeps its own
 * 60-second process-level snapshot for its request form, which is read on every page load there;
 * this is read once per dashboard view and does not need it.
 */
const loadCountryIndex = cache(async (): Promise<{ index: CountryIndex; countries: string[] }> => {
  await ensureLaptopSchema();
  const [departments, companies] = await Promise.all([
    laptopProcurementPool.query<{ cost_center: string; company_code: string; department: string }>(
      `SELECT cost_center, company_code, department FROM laptop_cost_center_departments`,
    ),
    laptopProcurementPool.query<{ code: string; name: string; country: string }>(
      `SELECT code, name, country FROM laptop_cost_center_companies`,
    ),
  ]);

  const companyRows = companies.rows.map((r) => ({
    code: r.code,
    name: r.name,
    country: r.country,
  }));

  return {
    index: buildCountryIndex(
      departments.rows.map((r) => ({
        costCentre: r.cost_center,
        companyCode: r.company_code,
        department: r.department,
      })),
      companyRows,
    ),
    countries: countryOptions(companyRows),
  };
});

/**
 * Every country a grant can be written against.
 *
 * Exported for the admin editor's picker. It reads the companies table rather than the bookings,
 * so a country with no travel yet is still grantable — otherwise nobody in a new country could
 * be given access until somebody there had already flown.
 */
export async function travelCountryOptions(): Promise<string[]> {
  try {
    return (await loadCountryIndex()).countries;
  } catch (err) {
    log.error('travelCountryOptions.failed', err);
    return [];
  }
}

/* ═══ The scoping query ══════════════════════════════════════════════════════ */

interface ScopedBooking {
  code: string;
  country: string | null;
  costCentre: string | null;
  department: string | null;
  companyCode: string | null;
  companyName: string | null;
  segment: string | null;
  employeeId: string | null;
  employeeName: string | null;
  status: string | null;
  travelType: string | null;
  direction: string | null;
  cabinClass: string | null;
  origin: string | null;
  destination: string | null;
  month: string | null;
  createdAt: string | null;
  departureDate: string | null;
  /** Days between creation and departure. Negative for the 44 booked after they departed. */
  leadDays: number | null;
  amountUsd: number;
  justification: string | null;
}

/**
 * The bookings this reader may see, each carrying its resolved country.
 *
 * The (code, country) pairs go in as two parallel arrays and come back out as a joinable
 * relation, so `countryFilterSql` can be applied to a real country expression exactly as it was
 * designed to be — rather than this file reimplementing the null/empty-array distinction that
 * `scope.ts` exists to own.
 */
async function loadScopedBookings(scope: TravelScope): Promise<ScopedBooking[]> {
  const { index } = await loadCountryIndex();

  const raw = await travelPortalPool.query<{
    code: string;
    costCenter: string | null;
    companyCode: string | null;
  }>(`SELECT code, "costCenter", "companyCode" FROM bookings`);

  const codes: string[] = [];
  const countries: (string | null)[] = [];
  const resolved = new Map<string, { country: string | null; department: string | null }>();
  for (const row of raw.rows) {
    const r = resolveBookingCountry(index, row.costCenter, row.companyCode);
    codes.push(row.code);
    countries.push(r.country);
    resolved.set(row.code, { country: r.country, department: r.department });
  }

  /* $1 and $2 are the pairs; the filter numbers itself from $3 onwards. */
  const filter = countryFilterSql(scope, 'p.country', 3);

  const { rows } = await travelPortalPool.query(
    `WITH pairs AS (SELECT * FROM unnest($1::text[], $2::text[]) AS p(code, country))
     SELECT b.code,
            p.country,
            b."costCenter"              AS cost_centre,
            b."companyCode"             AS company_code,
            b."companyName"             AS company_name,
            b.segment,
            b."employeeId"              AS employee_id,
            b."employeeName"            AS employee_name,
            b."bookingStatus"           AS status,
            b."travelType"              AS travel_type,
            b.direction,
            b."cabinClass"              AS cabin_class,
            b."departureAirportCode"    AS origin,
            b."arrivalAirportCode"      AS destination,
            to_char(b."creationDate", 'YYYY-MM')        AS month,
            b."creationDate"            AS created_at,
            b."departureDate"           AS departure_date,
            (b."departureDate" - b."creationDate"::date) AS lead_days,
            b."totalAmountUSD"          AS amount_usd,
            b."justificationText"       AS justification
       FROM bookings b
       JOIN pairs p ON p.code = b.code
      WHERE ${filter.sql}
      ORDER BY b."creationDate" DESC`,
    [codes, countries, ...filter.params],
  );

  return rows.map((r) => ({
    code: String(r.code),
    country: r.country === null ? null : String(r.country),
    costCentre: r.cost_centre ? String(r.cost_centre).trim() : null,
    department: resolved.get(String(r.code))?.department ?? null,
    companyCode: r.company_code ? String(r.company_code).trim() : null,
    /* The feed spells one company `'Satguru Test '`, with the trailing space. Trimmed here so it
       does not become its own row beside a correctly spelled one later. */
    companyName: r.company_name ? String(r.company_name).trim() : null,
    segment: r.segment,
    employeeId: r.employee_id ? String(r.employee_id).trim() : null,
    employeeName: r.employee_name ? String(r.employee_name).trim() : null,
    status: r.status ? String(r.status).trim() : null,
    travelType: r.travel_type ? String(r.travel_type).trim() : null,
    direction: r.direction ? String(r.direction).trim() : null,
    cabinClass: r.cabin_class ? String(r.cabin_class).trim() : null,
    origin: r.origin ? String(r.origin).trim() : null,
    destination: r.destination ? String(r.destination).trim() : null,
    month: r.month ? String(r.month) : null,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    departureDate: r.departure_date ? isoDate(r.departure_date) : null,
    leadDays: r.lead_days === null ? null : Number(r.lead_days),
    amountUsd: Number(r.amount_usd) || 0,
    justification: r.justification ? String(r.justification).trim() || null : null,
  }));
}

/** A `date` column arrives as a Date at local midnight; only the calendar part means anything. */
function isoDate(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ═══ Shapes the dashboard renders ═══════════════════════════════════════════ */

/** A labelled group and the population behind its spend. */
export interface SpendGroup extends SpendPopulation {
  label: string;
  /** A second line the chart may show — a department, a company name, a country. */
  sublabel?: string | null;
}

export interface MonthGroup extends SpendGroup {
  /** `2026-06`, for sorting. `label` is what a reader sees. */
  month: string;
}

export interface RejectedRequest {
  code: string;
  employeeName: string | null;
  country: string | null;
  amountUsd: number;
  createdAt: string | null;
  departureDate: string | null;
  route: string;
  justification: string | null;
}

export interface TravelHeadline {
  spend: SpendPopulation;
  /** Distinct employees who travelled, not traveller records — the feed has several per trip. */
  travellers: number;
  pendingApprovals: number;
  missedSavingsUsd: number;
  /** Bookings the savings feed covers at all, out of the bookings in scope. */
  savingsCoveredBookings: number;
}

export interface FinanceBand {
  note: string;
  byMonth: MonthGroup[];
  byCountry: SpendGroup[];
  byCostCentre: SpendGroup[];
  costCentresBeyondTop: number;
  byCompany: SpendGroup[];
  bySegment: SpendGroup[];
  byTravelType: SpendGroup[];
  byCabinClass: SpendGroup[];
  rejected: RejectedRequest[];
  rejectedSpendUsd: number;
}

export interface SavingsGroup {
  label: string;
  legs: number;
  missedUsd: number;
  selectedUsd: number;
}

export interface ViolationTotal {
  description: string;
  bookings: number;
  spendUsd: number;
}

export interface ViolationMonth {
  month: string;
  label: string;
  counts: Record<string, number>;
}

export interface LeadTimeBar {
  id: LeadTimeBucketId;
  label: string;
  bookings: number;
  breachesPolicy: boolean;
}

export interface AgeingBar {
  id: AgeingBucketId;
  label: string;
  count: number;
}

export interface ApproverBottleneck {
  name: string;
  pending: number;
  oldestDays: number;
  averageDays: number;
}

export interface OptimisationBand {
  selectedSegments: number;
  cheapestAlsoSelected: number;
  missedSavingsByCarrier: SavingsGroup[];
  missedSavingsByRoute: SavingsGroup[];
  violationTotals: ViolationTotal[];
  violationTypes: string[];
  violationsByMonth: ViolationMonth[];
  leadTime: LeadTimeBar[];
  advanceThresholdDays: number;
  carrierMix: { label: string; segments: number }[];
  decidedAgeing: AgeingBar[];
  pendingAgeing: AgeingBar[];
  decidedCount: number;
  averageDecisionDays: number | null;
  worstDecisionDays: number | null;
  pendingCount: number;
  averagePendingDays: number | null;
  oldestPendingDays: number | null;
  approverBottlenecks: ApproverBottleneck[];
}

export interface TravellerRecord {
  /** `travellers.rowId` of the record a reveal would read. The audit row names its booking. */
  recordId: number;
  bookingCode: string;
  name: string;
  employeeId: string | null;
  email: string | null;
  nationality: string | null;
  passportExpiry: string | null;
  ticketNumber: string | null;
  trips: number;
  /**
   * This traveller's share of the bookings they appear on, not the full value of those
   * bookings — a family of five on one reservation splits it five ways. See `shareOfBooking`.
   */
  spendUsd: number;
}

export interface ExpiringPassport {
  recordId: number;
  name: string;
  nationality: string | null;
  expiry: string;
  daysLeft: number;
}

export interface QualityFlag {
  id: string;
  label: string;
  count: number;
  detail: string;
}

export interface AdminBand {
  travellers: TravellerRecord[];
  expiringPassports: ExpiringPassport[];
  quality: QualityFlag[];
}

export interface TravelAnalyticsData {
  /** Airports and routes for the map, plus whatever it could not place. */
  map: MapData;
  /** The travel-type band: how the three kinds of trip differ. */
  travelTypes: TravelTypeBand;
  role: TravelRole;
  /** Null means every country. Shown in the header so a reader knows what they are looking at. */
  countries: string[] | null;
  generatedAt: string;
  bookingsInScope: number;
  headline: TravelHeadline;
  finance: FinanceBand;
  /** Null for a finance reader: the band is not rendered and the data never leaves the server. */
  optimisation: OptimisationBand | null;
  /** Null for anyone but an admin. */
  admin: AdminBand | null;
}

/* ═══ Grouping helpers ═══════════════════════════════════════════════════════ */

/**
 * Group bookings by a key and give each group its own spend population.
 *
 * Every grouped figure on the dashboard goes through here, which is what makes the "$0 bookings
 * count as bookings and not as prices" rule hold per country and per month as well as in the
 * headline — a global caption would otherwise be quietly wrong for the three months that carry
 * most of the zeroes.
 */
function groupSpend<T>(
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

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ═══ The entry point ════════════════════════════════════════════════════════ */

/**
 * Everything one reader may see, in one object.
 *
 * The role bands are not a UI concern: a finance reader's payload does not contain the
 * optimisation figures and nobody but an admin is sent a traveller's name beside their passport
 * expiry. Hiding a section in the client would leave the data in the page source.
 */
export async function loadTravelAnalytics(scope: TravelScope): Promise<TravelAnalyticsData> {
  const bookings = await loadScopedBookings(scope);
  const codes = bookings.map((b) => b.code);

  const base = {
    role: scope.role,
    countries: scope.countries,
    generatedAt: new Date().toISOString(),
    bookingsInScope: bookings.length,
  };

  /* No codes means no bookings this reader may see — a country grant that covers nothing, or a
     country with no travel. Every query below would be `= ANY('{}')`, so none of them runs. */
  if (!codes.length) {
    return {
      ...base,
      headline: {
        spend: spendPopulation([]),
        travellers: 0,
        pendingApprovals: 0,
        missedSavingsUsd: 0,
        savingsCoveredBookings: 0,
      },
      finance: emptyFinance(),
      /* Folds over an empty list, so these are the real empty shapes rather than hand-written
         ones that could drift from what the builders produce. */
      map: buildMapData([]),
      travelTypes: buildTravelTypeBand([]),
      optimisation: canSeeOptimisation(scope.role) ? emptyOptimisation() : null,
      admin: canRevealIdentityDocuments(scope.role)
        ? { travellers: [], expiringPassports: [], quality: [] }
        : null,
    };
  }

  const [savings, optimisation, admin] = await Promise.all([
    loadSavingsHeadline(codes),
    canSeeOptimisation(scope.role) ? loadOptimisation(codes, bookings) : Promise.resolve(null),
    canRevealIdentityDocuments(scope.role) ? loadAdminBand(codes, bookings) : Promise.resolve(null),
  ]);

  const spend = spendPopulation(bookings.map((b) => b.amountUsd));

  return {
    ...base,
    headline: {
      spend,
      travellers: new Set(bookings.map((b) => b.employeeId).filter(Boolean)).size,
      pendingApprovals: bookings.filter((b) => b.status === 'Pending Approval').length,
      missedSavingsUsd: savings.missedUsd,
      savingsCoveredBookings: savings.coveredBookings,
    },
    finance: buildFinance(bookings, spend),
    map: buildMapData(bookings),
    travelTypes: buildTravelTypeBand(bookings),
    optimisation,
    admin,
  };
}

/* ═══ One traveller's history ════════════════════════════════════════════════ */

export interface TravellerTrip {
  code: string;
  departureDate: string | null;
  returnDate: string | null;
  createdAt: string | null;
  travelType: string | null;
  direction: string | null;
  cabinClass: string | null;
  status: string | null;
  origin: string | null;
  destination: string | null;
  route: string;
  country: string | null;
  costCentre: string | null;
  department: string | null;
  company: string | null;
  segment: string | null;
  amountUsd: number;
  leadDays: number | null;
  justification: string | null;
  /** Policy violations recorded against this booking. */
  violations: string[];
  /** The carriers actually flown, in leg order. */
  carriers: string[];
}

export interface TravellerProfile {
  employeeId: string;
  name: string;
  email: string | null;
  nationality: string | null;
  /** The latest expiry across this person's traveller records. */
  passportExpiry: string | null;
  trips: TravellerTrip[];
  totalSpendUsd: number;
  pricedTrips: number;
  countries: string[];
  map: MapData;
  travelTypes: TravelTypeBand;
}

/**
 * Everything one person has travelled, for their own page.
 *
 * Scoped exactly like the board: the bookings come from `loadScopedBookings`, so a country
 * reader opening a traveller sees that traveller's trips IN THEIR COUNTRIES and no others.
 * Reached by employee id rather than by name, because names repeat and the id is what the
 * booking carries.
 *
 * Returns null rather than an empty profile when the reader may see none of this person's
 * travel, so the page can 404 instead of rendering a convincing but empty history.
 */
export async function loadTravellerProfile(
  scope: TravelScope,
  employeeId: string,
): Promise<TravellerProfile | null> {
  const id = String(employeeId ?? '').trim();
  if (!id) return null;

  const all = await loadScopedBookings(scope);
  const mine = all.filter((b) => (b.employeeId ?? '').trim() === id);
  if (!mine.length) return null;

  const codes = mine.map((b) => b.code);

  /* Violations and carriers per booking, both optional detail: a trip with neither still
     renders, it just has less to say. */
  const [violations, legs, person] = await Promise.all([
    travelPortalPool.query<{ code: string; description: string }>(
      `SELECT code, description FROM policyviolations WHERE code = ANY($1)`,
      [codes],
    ),
    travelPortalPool.query<{ code: string; carrierName: string | null }>(
      `SELECT code, "carrierName" FROM flightsegmentlegs
        WHERE code = ANY($1) ORDER BY code, "legOrder"`,
      [codes],
    ),
    travelPortalPool.query<{
      email: string | null;
      nationality: string | null;
      passportExpiry: string | null;
      firstName: string | null;
      lastName: string | null;
    }>(
      `SELECT email, nationality, "passportExpiryDate"::text AS "passportExpiry",
              "firstName", "lastName"
         FROM travellers
        WHERE "employeeId" = $1 AND code = ANY($2)
        ORDER BY "passportExpiryDate" DESC NULLS LAST
        LIMIT 1`,
      [id, codes],
    ),
  ]);

  const byCode = new Map<string, string[]>();
  for (const v of violations.rows) {
    const list = byCode.get(v.code) ?? [];
    list.push(v.description);
    byCode.set(v.code, list);
  }
  const carriersByCode = new Map<string, string[]>();
  for (const l of legs.rows) {
    const name = (l.carrierName ?? '').trim();
    if (!name) continue;
    const list = carriersByCode.get(l.code) ?? [];
    if (!list.includes(name)) list.push(name);
    carriersByCode.set(l.code, list);
  }

  const trips: TravellerTrip[] = mine
    .map((b) => ({
      code: b.code,
      departureDate: b.departureDate,
      returnDate: null,
      createdAt: b.createdAt,
      travelType: b.travelType,
      direction: b.direction,
      cabinClass: b.cabinClass,
      status: b.status,
      origin: b.origin,
      destination: b.destination,
      route: b.origin && b.destination ? `${b.origin} → ${b.destination}` : '—',
      country: b.country,
      costCentre: b.costCentre,
      department: b.department,
      company: b.companyName,
      segment: b.segment,
      amountUsd: b.amountUsd,
      leadDays: b.leadDays,
      justification: b.justification,
      violations: byCode.get(b.code) ?? [],
      carriers: carriersByCode.get(b.code) ?? [],
    }))
    /* Newest first. A travel history is read from "what did they just do" backwards, and a
       booking with no departure date sorts last rather than vanishing. */
    .sort((a, z) => (z.departureDate ?? '').localeCompare(a.departureDate ?? ''));

  const p = person.rows[0];
  const priced = mine.filter((b) => b.amountUsd > 0);

  return {
    employeeId: id,
    name:
      mine.find((b) => (b.employeeName ?? '').trim())?.employeeName?.trim() ||
      [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim() ||
      id,
    email: p?.email ?? null,
    nationality: p?.nationality ?? null,
    passportExpiry: p?.passportExpiry ?? null,
    trips,
    totalSpendUsd: mine.reduce((sum, b) => sum + b.amountUsd, 0),
    pricedTrips: priced.length,
    countries: [...new Set(mine.map((b) => b.country).filter((c): c is string => !!c))].sort(),
    map: buildMapData(mine),
    travelTypes: buildTravelTypeBand(mine),
  };
}

/* ═══ Band 2 · Finance ═══════════════════════════════════════════════════════ */

function emptyFinance(): FinanceBand {
  return {
    note: spendPopulationNote(spendPopulation([])),
    byMonth: [],
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

const TOP_COST_CENTRES = 15;

function buildFinance(bookings: readonly ScopedBooking[], spend: SpendPopulation): FinanceBand {
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

  const allCostCentres = groupSpend<{ sublabel: string | null }>(
    bookings,
    (b) => b.costCentre,
    (b) => ({ sublabel: b.department ?? b.country ?? null }),
  );

  const rejected = bookings.filter((b) => b.status === 'Rejected');

  return {
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

/* ═══ Headline savings ═══════════════════════════════════════════════════════ */

async function loadSavingsHeadline(
  codes: readonly string[],
): Promise<{ missedUsd: number; coveredBookings: number }> {
  const { rows } = await travelPortalPool.query(
    `SELECT COALESCE(SUM(missed_savings_usd), 0) AS missed,
            COUNT(DISTINCT code)                 AS covered
       FROM savings_analysis
      WHERE code = ANY($1)`,
    [codes],
  );
  return { missedUsd: num(rows[0]?.missed), coveredBookings: num(rows[0]?.covered) };
}

/* ═══ Band 3 · Management and admin ══════════════════════════════════════════ */

function emptyOptimisation(): OptimisationBand {
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

async function loadOptimisation(
  codes: readonly string[],
  bookings: readonly ScopedBooking[],
): Promise<OptimisationBand> {
  const [segments, savingsByCarrier, savingsByRoute, violations, approvals, carrierMix] =
    await Promise.all([
      /* Every row of `flightsegments` is a selected option — the alternatives live in
       `cheapestflightsegments` — so adherence is "of the segments we booked, how many were also
       the cheapest on offer". 28 of 263 across the whole feed.
       `finalPrice` is NOT summed: it is denominated in `flightsegments.currency`, and only
       `bookings.totalAmountUSD` and `savings_analysis.*_usd` are dollars. */
      travelPortalPool.query(
        `SELECT COUNT(*) FILTER (WHERE "isSelectedOption")                          AS selected,
              COUNT(*) FILTER (WHERE "isSelectedOption" AND "isCheapestOption")   AS also_cheapest
         FROM flightsegments
        WHERE code = ANY($1)`,
        [codes],
      ),
      travelPortalPool.query(
        `SELECT "platingCarrierName"                      AS carrier,
              COUNT(*)                                  AS legs,
              COALESCE(SUM(missed_savings_usd), 0)      AS missed,
              COALESCE(SUM(selected_price_usd), 0)      AS selected
         FROM savings_analysis
        WHERE code = ANY($1) AND missed_savings_usd > 0
        GROUP BY 1
        ORDER BY 3 DESC`,
        [codes],
      ),
      travelPortalPool.query(
        `SELECT origin, destination,
              COUNT(*)                                  AS legs,
              COALESCE(SUM(missed_savings_usd), 0)      AS missed,
              COALESCE(SUM(selected_price_usd), 0)      AS selected
         FROM savings_analysis
        WHERE code = ANY($1) AND missed_savings_usd > 0
        GROUP BY 1, 2
        ORDER BY 4 DESC
        LIMIT 12`,
        [codes],
      ),
      travelPortalPool.query(
        `SELECT p.description, p.code
         FROM policyviolations p
        WHERE p.code = ANY($1)`,
        [codes],
      ),
      /* `approvers` has no decision timestamp of its own, only `lastModifiedDate`. Against the
       booking's creation date that is the time from request to decision, which is the number
       the bottleneck list is about. A booking can carry several approvers — 132 rows over 72
       bookings — so these are per approval step, not per booking, and the ageing charts say so. */
      travelPortalPool.query(
        `SELECT a."employeeName"  AS approver,
              a.status,
              EXTRACT(EPOCH FROM (a."lastModifiedDate" - b."creationDate")) / 86400 AS decided_days,
              EXTRACT(EPOCH FROM (NOW() - b."creationDate")) / 86400               AS pending_days
         FROM approvers a
         JOIN bookings b ON b.code = a.code
        WHERE a.code = ANY($1)`,
        [codes],
      ),
      loadCarrierMix(codes),
    ]);

  /* Violations over time need the booking's month, which lives in the rows already in memory. */
  const monthOf = new Map(bookings.map((b) => [b.code, b.month]));
  const spendOf = new Map(bookings.map((b) => [b.code, b.amountUsd]));

  const violationTotals = new Map<string, { bookings: Set<string>; spendUsd: number }>();
  const byMonth = new Map<string, Record<string, number>>();
  for (const row of violations.rows) {
    const description = String(row.description ?? '').trim() || 'Unnamed policy';
    const code = String(row.code);
    const total = violationTotals.get(description) ?? { bookings: new Set<string>(), spendUsd: 0 };
    if (!total.bookings.has(code)) {
      total.bookings.add(code);
      total.spendUsd += spendOf.get(code) ?? 0;
    }
    violationTotals.set(description, total);

    const month = monthOf.get(code);
    if (month) {
      const bucket = (byMonth.get(month) ?? {}) as Record<string, number>;
      bucket[description] = (bucket[description] ?? 0) + 1;
      byMonth.set(month, bucket);
    }
  }

  const violationTypes = [...violationTotals.keys()].sort(
    (a, b) =>
      (violationTotals.get(b)?.bookings.size ?? 0) - (violationTotals.get(a)?.bookings.size ?? 0),
  );

  /* Lead time, from the rows in memory, so the negative bucket is the same 44 bookings the
     data-quality panel counts rather than a separately derived number. */
  const leadCounts = new Map<LeadTimeBucketId, number>();
  for (const b of bookings) {
    if (b.leadDays === null) continue;
    const id = leadTimeBucket(b.leadDays);
    leadCounts.set(id, (leadCounts.get(id) ?? 0) + 1);
  }

  const decided: number[] = [];
  const pending: number[] = [];
  const bottlenecks = new Map<string, number[]>();
  for (const row of approvals.rows) {
    const status = String(row.status ?? '').trim();
    if (status === 'Pending Approval') {
      const age = num(row.pending_days);
      pending.push(age);
      const name = String(row.approver ?? '').trim() || 'Unnamed approver';
      const ages = bottlenecks.get(name);
      if (ages) ages.push(age);
      else bottlenecks.set(name, [age]);
    } else {
      /* 'Delegated' counts as decided: the step moved on, which is what the ageing chart is
         measuring. It is one row in the whole feed, but treating it as still pending would put
         it in a bottleneck list beside approvals nobody has touched. */
      decided.push(num(row.decided_days));
    }
  }

  const average = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  return {
    selectedSegments: num(segments.rows[0]?.selected),
    cheapestAlsoSelected: num(segments.rows[0]?.also_cheapest),
    missedSavingsByCarrier: savingsByCarrier.rows.map((r) => ({
      label: carrierLabel(r.carrier),
      legs: num(r.legs),
      missedUsd: num(r.missed),
      selectedUsd: num(r.selected),
    })),
    missedSavingsByRoute: savingsByRoute.rows.map((r) => ({
      label: routeLabel(r.origin, r.destination),
      legs: num(r.legs),
      missedUsd: num(r.missed),
      selectedUsd: num(r.selected),
    })),
    violationTotals: violationTypes.map((description) => ({
      description,
      bookings: violationTotals.get(description)?.bookings.size ?? 0,
      spendUsd: violationTotals.get(description)?.spendUsd ?? 0,
    })),
    violationTypes,
    violationsByMonth: [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, counts]) => ({
        month,
        label: shortMonthYear(new Date(`${month}-01T00:00:00`)),
        counts,
      })),
    leadTime: LEAD_TIME_BUCKETS.map((b) => ({ ...b, bookings: leadCounts.get(b.id) ?? 0 })),
    advanceThresholdDays: ADVANCE_BOOKING_THRESHOLD_DAYS,
    carrierMix,
    decidedAgeing: bucketAges(decided),
    pendingAgeing: bucketAges(pending),
    decidedCount: decided.length,
    averageDecisionDays: average(decided),
    worstDecisionDays: decided.length ? Math.max(...decided) : null,
    pendingCount: pending.length,
    averagePendingDays: average(pending),
    oldestPendingDays: pending.length ? Math.max(...pending) : null,
    approverBottlenecks: [...bottlenecks.entries()]
      .map(([name, ages]) => ({
        name,
        pending: ages.length,
        oldestDays: Math.max(...ages),
        averageDays: ages.reduce((a, b) => a + b, 0) / ages.length,
      }))
      .sort((a, b) => b.pending - a.pending || b.oldestDays - a.oldestDays),
  };
}

function bucketAges(days: readonly number[]): AgeingBar[] {
  const counts = new Map<AgeingBucketId, number>();
  for (const d of days) {
    const id = ageingBucket(d);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return AGEING_BUCKETS.map((b) => ({ ...b, count: counts.get(b.id) ?? 0 }));
}

/**
 * The carrier mix of the segments actually booked.
 *
 * Goes through `carrierLabel` for the same reason the missed-savings list does: 71 of the 263
 * selected segments have no carrier name, and the two charts would disagree about what to call
 * them if either had been left to render a NULL on its own.
 */
async function loadCarrierMix(
  codes: readonly string[],
): Promise<{ label: string; segments: number }[]> {
  const { rows } = await travelPortalPool.query(
    `SELECT "platingCarrierName" AS carrier, COUNT(*) AS n
       FROM flightsegments
      WHERE code = ANY($1) AND "isSelectedOption"
      GROUP BY 1
      ORDER BY 2 DESC`,
    [codes],
  );
  return rows.map((r) => ({ label: carrierLabel(r.carrier), segments: num(r.n) }));
}

/* ═══ Band 4 · Admin ═════════════════════════════════════════════════════════ */

const PASSPORT_HORIZON_DAYS = 183;

/** The operational half of a traveller record. The identity documents are not in it by design. */
interface TravellerRow {
  rowId: number;
  code: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  employeeId: string | null;
  nationality: string | null;
  passportExpiryDate: Date | null;
  ticketNumber: string | null;
}

async function loadAdminBand(
  codes: readonly string[],
  bookings: readonly ScopedBooking[],
): Promise<AdminBand> {
  const [travellers, quality] = await Promise.all([
    /* OPERATIONAL FIELDS ONLY. Passport number, date of birth and mobile are not selected here
       and never reach the page: they are read one record at a time by `revealTravellerIdentity`,
       after it has written the audit row. A SELECT that pulled them "for convenience" would put
       194 passport numbers in the HTML of a page whose reveal button nobody had pressed. */
    travelPortalPool.query<TravellerRow>(
      `SELECT "rowId", code, "firstName", "lastName", email, "employeeId", nationality,
              "passportExpiryDate", "ticketNumber"
         FROM travellers
        WHERE code = ANY($1)
        ORDER BY "rowId"`,
      [codes],
    ),
    loadQualityCounts(codes),
  ]);

  const spendOf = new Map(bookings.map((b) => [b.code, b.amountUsd]));

  /* How many travellers each booking carried, so a family's booking is not counted once per
     family member. See `shareOfBooking`. */
  const travellersPerBooking = new Map<string, number>();
  for (const r of travellers.rows) {
    const code = String(r.code);
    travellersPerBooking.set(code, (travellersPerBooking.get(code) ?? 0) + 1);
  }
  const shareFor = (code: string) =>
    shareOfBooking(spendOf.get(code) ?? 0, travellersPerBooking.get(code) ?? 1);

  /**
   * One row per PERSON, not per traveller record: the feed carries a record per booking, so
   * somebody who flew six times appears six times. See `travellerIdentityKey` for why the key
   * is email AND name rather than email alone — one booking in this feed carries three family
   * members under a single address, and merging them loses a passport.
   */
  const people = new Map<string, { record: TravellerRow; codes: Set<string>; spendUsd: number }>();
  for (const r of travellers.rows) {
    const name = [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || 'Unnamed traveller';
    const key = travellerIdentityKey(r.email, name);
    const entry = people.get(key);
    if (entry) {
      /* The reveal reads the LATEST record, because a renewed passport is on the newer row and
         showing an expiry that has already been superseded is worse than showing none. */
      if (Number(r.rowId) > Number(entry.record.rowId)) entry.record = r;
      if (!entry.codes.has(String(r.code))) {
        entry.codes.add(String(r.code));
        entry.spendUsd += shareFor(String(r.code));
      }
    } else {
      people.set(key, {
        record: r,
        codes: new Set([String(r.code)]),
        spendUsd: shareFor(String(r.code)),
      });
    }
  }

  const directory: TravellerRecord[] = [...people.values()]
    .map(({ record, codes: trips, spendUsd }) => ({
      recordId: Number(record.rowId),
      bookingCode: String(record.code),
      name:
        [record.firstName, record.lastName].filter(Boolean).join(' ').trim() || 'Unnamed traveller',
      employeeId: record.employeeId ? String(record.employeeId).trim() : null,
      email: record.email ? String(record.email).trim() : null,
      nationality: record.nationality ? String(record.nationality).trim() : null,
      passportExpiry: record.passportExpiryDate ? isoDate(record.passportExpiryDate) : null,
      ticketNumber: record.ticketNumber ? String(record.ticketNumber).trim() : null,
      trips: trips.size,
      spendUsd,
    }))
    .sort((a, b) => b.spendUsd - a.spendUsd || b.trips - a.trips || a.name.localeCompare(b.name));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiringPassports: ExpiringPassport[] = directory
    .filter((t) => t.passportExpiry)
    .map((t) => {
      const expiry = new Date(`${t.passportExpiry}T00:00:00`);
      return {
        recordId: t.recordId,
        name: t.name,
        nationality: t.nationality,
        expiry: t.passportExpiry!,
        daysLeft: Math.round((expiry.getTime() - today.getTime()) / 86_400_000),
      };
    })
    .filter((p) => p.daysLeft <= PASSPORT_HORIZON_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  /* How many addresses carry more than one traveller name. Computed from the directory rather
     than queried, and surfaced because it is the visible edge of a judgement call: these are
     mostly real families on one reservation, and a few are one person spelled two ways. */
  const namesPerEmail = new Map<string, Set<string>>();
  for (const t of directory) {
    if (!t.email) continue;
    const address = t.email.toLowerCase();
    const names = namesPerEmail.get(address);
    if (names) names.add(t.name.toLowerCase());
    else namesPerEmail.set(address, new Set([t.name.toLowerCase()]));
  }

  return {
    travellers: directory,
    expiringPassports,
    quality: buildQualityFlags(bookings, quality, {
      sharedEmails: [...namesPerEmail.values()].filter((n) => n.size > 1).length,
    }),
  };
}

interface QualityCounts {
  nullCarrierSegments: number;
  travellersMissingEmployeeId: number;
  travellerRecords: number;
  bookingsWithTravellers: number;
  bookingsWithSavings: number;
  orphanSegments: number;
  orphanTravellers: number;
}

async function loadQualityCounts(codes: readonly string[]): Promise<QualityCounts> {
  const [segments, travellers, savings, orphans] = await Promise.all([
    travelPortalPool.query(
      `SELECT COUNT(*) FILTER (WHERE "platingCarrierName" IS NULL) AS null_carrier
         FROM flightsegments WHERE code = ANY($1)`,
      [codes],
    ),
    travelPortalPool.query(
      `SELECT COUNT(*)                                        AS records,
              COUNT(*) FILTER (WHERE "employeeId" IS NULL)    AS missing_employee_id,
              COUNT(DISTINCT code)                            AS with_travellers
         FROM travellers WHERE code = ANY($1)`,
      [codes],
    ),
    travelPortalPool.query(
      `SELECT COUNT(DISTINCT code) AS n FROM savings_analysis WHERE code = ANY($1)`,
      [codes],
    ),
    /* UNSCOPED, deliberately: a row with no booking code cannot be placed in a country, so
       there is no scoped version of this number to compute. It is only ever shown on the
       admin band, and an admin is not country-scoped. */
    travelPortalPool.query(
      `SELECT (SELECT COUNT(*) FROM flightsegments WHERE code IS NULL) AS segments,
              (SELECT COUNT(*) FROM travellers     WHERE code IS NULL) AS travellers`,
    ),
  ]);
  return {
    nullCarrierSegments: num(segments.rows[0]?.null_carrier),
    travellersMissingEmployeeId: num(travellers.rows[0]?.missing_employee_id),
    travellerRecords: num(travellers.rows[0]?.records),
    bookingsWithTravellers: num(travellers.rows[0]?.with_travellers),
    bookingsWithSavings: num(savings.rows[0]?.n),
    orphanSegments: num(orphans.rows[0]?.segments),
    orphanTravellers: num(orphans.rows[0]?.travellers),
  };
}

/**
 * The data-quality panel.
 *
 * "Keep everything, flag it" was the user's instruction, so nothing counted here has been
 * removed from any other figure on the dashboard. Each row says what it is and what it does to
 * the numbers above it, because a count with no consequence attached invites somebody to decide
 * the data is simply broken and stop reading.
 */
function buildQualityFlags(
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

/* ═══ The identity-document reveal ═══════════════════════════════════════════ */

export interface IdentityDocuments {
  bookingCode: string;
  travellerName: string;
  passportNumber: string | null;
  dateOfBirth: string | null;
  mobile: string | null;
}

/** The fields a reveal returns, and the names the audit row records. */
export const REVEALABLE_FIELDS = ['passportNumber', 'dateOfBirth', 'mobile'] as const;

/**
 * Read one traveller record's identity documents.
 *
 * Takes a code list as well as a record id so a reveal cannot reach outside the caller's scope
 * by guessing a primary key — `rowId` is a small integer and the dashboard is a URL anyone
 * signed in can open. The caller writes the audit row before calling this.
 */
export async function readIdentityDocuments(
  recordId: number,
  codes: readonly string[],
): Promise<IdentityDocuments | null> {
  if (!Number.isInteger(recordId) || !codes.length) return null;
  const { rows } = await travelPortalPool.query(
    `SELECT code, "firstName", "lastName", "passportNumber", "dateOfBirth", mobile,
            "mobileCountryCode"
       FROM travellers
      WHERE "rowId" = $1 AND code = ANY($2)`,
    [recordId, codes],
  );
  const r = rows[0];
  if (!r) return null;
  const mobile = [r.mobileCountryCode, r.mobile].map((v) => String(v ?? '').trim()).filter(Boolean);
  return {
    bookingCode: String(r.code),
    travellerName:
      [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || 'Unnamed traveller',
    passportNumber: r.passportNumber ? String(r.passportNumber).trim() : null,
    dateOfBirth: r.dateOfBirth ? isoDate(r.dateOfBirth) : null,
    mobile: mobile.length ? mobile.join(' ') : null,
  };
}

/**
 * The booking codes one reader may see, for the reveal path.
 *
 * Re-derived rather than trusted from the client, for the same reason the reveal takes a code
 * list at all: the dashboard's payload is not an authorisation.
 */
export async function scopedBookingCodes(scope: TravelScope): Promise<string[]> {
  return (await loadScopedBookings(scope)).map((b) => b.code);
}
