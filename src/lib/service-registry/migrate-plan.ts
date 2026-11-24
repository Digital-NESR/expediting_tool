/**
 * Moving RRSM's rows into the shared Service Registry: the rules, with no database access.
 *
 *   - Rental register lines become items grouped by supplier + service + unit + rate; each line
 *     becomes a unit of its item. "Asab camp-CT" and "Asab camp-WT" at the same rate are one item
 *     (the segment is unit detail), at different rates they are two.
 *   - Each recurrent service is its own item, priced per year. Without an annual value it goes in
 *     at 0, flagged "rate to confirm" (an item needs a price).
 *   - An item merges into an existing registry entry in the same country with the same vendor code
 *     and the same normalised name; anything else is created new (decision 23 Nov 2026).
 *   - Categories map onto the NESR spend taxonomy as agreed (see RENTAL_CATEGORY_MAP).
 */

export interface RentalLineIn {
  id: number;
  countryCode: string;
  supplierCode: string;
  supplierName: string;
  description: string;
  category: string | null;
  uom: string; // RRSM code: month, day, hour, headcount, unit
  rate: number | null;
  serviceNumber: string | null;
  startsOn: string | null;
  registryCode: string | null;
}

export interface RecurrentIn {
  id: number;
  countryCode: string;
  supplierCode: string | null;
  supplierName: string | null;
  serviceName: string | null;
  description: string;
  department: string | null;
  annualValue: number | null;
  currency: string | null;
  contractExpiry: string | null;
  registryCode: string | null;
}

export interface ExistingItem {
  code: string;
  countryCode: string;
  supplierCode: string;
  itemName: string;
}

export interface CategoryPick {
  category: string;
  subcategory: string | null;
}

export interface PlannedItem {
  key: string;
  type: 'rental' | 'recurrent';
  countryCode: string;
  supplierCode: string;
  supplierName: string;
  itemName: string;
  uomName: string;
  unitPrice: number;
  currency: string | null;
  rateToConfirm: boolean;
  category: CategoryPick;
  serviceNumber: string | null;
  effectiveDate: string;
  expiryDate: string | null;
  /** Set when it merges into an existing registry entry. */
  existingCode: string | null;
  rentalLineIds: number[];
  recurrentId: number | null;
}

export interface MigrationPlan {
  items: PlannedItem[];
  /** Rows that cannot be moved, and why. */
  skipped: { kind: 'rental' | 'recurrent'; id: number; reason: string }[];
}

/* ─── names ──────────────────────────────────────────────────────────────────────────────── */

const SEGMENT_SUFFIX = /[\s\-_/]*(ct|wt|cmt|sup|mngt|mngmt|mgmt|pipeline|support|ops)$/i;

/** "Asab camp-CT" → "Asab camp". Removes trailing segment tags, repeatedly ("X-CT-SUP"). */
export function stripSegment(name: string): string {
  let s = String(name ?? '').trim();
  for (let i = 0; i < 3 && SEGMENT_SUFFIX.test(s); i++) s = s.replace(SEGMENT_SUFFIX, '').trim();
  return s || String(name ?? '').trim();
}

/** For matching only: lower case, letters and digits, single spaces. */
export function normaliseName(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normaliseVendor(code: string | null | undefined): string {
  return String(code ?? '')
    .trim()
    .replace(/^0+(?=\d)/, '');
}

const UOM_NAME: Record<string, string> = {
  month: 'Month',
  day: 'Day',
  hour: 'Hour',
  headcount: 'Per Person',
  unit: 'Each',
};

export function uomName(rrsmUom: string): string {
  return UOM_NAME[String(rrsmUom ?? '').toLowerCase()] ?? 'Month';
}

/* ─── categories (agreed 23 Nov 2026) ──────────────────────────────────────────────────── */

type Rule = { when?: RegExp } & CategoryPick;

/** RRSM rental category → taxonomy; the first rule whose `when` matches the line wins. */
export const RENTAL_CATEGORY_MAP: Record<string, Rule[]> = {
  'equipment rental': [
    {
      when: /compressor|generator/i,
      category: 'Field Technical Equipment & Services',
      subcategory: 'Compressors & Generators',
    },
    { when: /forklift/i, category: 'Lifting Equipment', subcategory: 'Forklift' },
    { category: 'Operation Rental', subcategory: 'Technical Rental equipment' },
  ],
  transportation: [{ category: 'Logistics', subcategory: 'Crew Transportation' }],
  accommodation: [{ category: 'Facility', subcategory: 'Staff House' }],
  't&e': [
    { when: /hotel/i, category: 'Travel & Entertainment', subcategory: 'Hotel' },
    { category: 'Travel & Entertainment', subcategory: 'Air Tickets' },
  ],
  training: [{ category: 'HR', subcategory: 'Training' }],
  'office and camp': [
    { when: /security/i, category: 'Facility', subcategory: 'Security' },
    { when: /pest/i, category: 'Facility', subcategory: 'Operations & Maintenance' },
    { when: /printer/i, category: 'IT', subcategory: 'Hardware' },
    { category: 'Facility', subcategory: 'Utility' },
  ],
  'operation rental': [
    {
      when: /calibrat/i,
      category: 'Inspection & Certification',
      subcategory: 'Calibration Services',
    },
    { category: 'Operation Rental', subcategory: 'Technical Rental equipment' },
  ],
  haulage: [
    { when: /waste|skip/i, category: 'Facility', subcategory: 'Waste Disposal' },
    { category: 'Logistics', subcategory: 'Heavy Trucks and Parts' },
  ],
  payroll: [{ category: 'HR', subcategory: 'Medical Checkup' }],
  'manpower supply': [
    { when: /clean/i, category: 'Facility', subcategory: 'Operations & Maintenance' },
    { category: 'Manpower', subcategory: 'Manpower' },
  ],
  fuel: [{ category: 'Fuel, Lubricants and Gases', subcategory: 'Diesel' }],
  'm&s': [
    { when: /hydraulic/i, category: 'Maintenance & Repair Operations', subcategory: 'Hydraulic' },
    { category: 'Maintenance & Repair Operations', subcategory: 'Machine Shop' },
  ],
  'drinking water': [{ category: 'Facility', subcategory: 'Catering Services' }],
  inspection: [
    { category: 'Inspection & Certification', subcategory: 'Inspections & Quality Assurance' },
  ],
  catering: [{ category: 'Facility', subcategory: 'Catering Services' }],
  'legal servcie': [{ category: 'Professional Services', subcategory: 'Legal' }],
  'legal service': [{ category: 'Professional Services', subcategory: 'Legal' }],
  scaffolding: [{ category: 'Facility', subcategory: 'Engineering & Construction' }],
  'waste disposal': [{ category: 'Facility', subcategory: 'Waste Disposal' }],
  crane: [{ category: 'Lifting Equipment', subcategory: 'Crains' }],
  internet: [{ category: 'IT', subcategory: 'Infrastructure' }],
  calibration: [{ category: 'Inspection & Certification', subcategory: 'Calibration Services' }],
  'nitrogen - nes - uae': [{ category: 'Nitrogen', subcategory: 'Commodities Chemicals' }],
};

const FALLBACK: CategoryPick = {
  category: 'Operation Rental',
  subcategory: 'Non-Field Technical rental equipment',
};

export function rentalCategory(category: string | null, description: string): CategoryPick {
  const rules =
    RENTAL_CATEGORY_MAP[
      String(category ?? '')
        .trim()
        .toLowerCase()
    ];
  if (!rules) return FALLBACK;
  const hit = rules.find((r) => !r.when || r.when.test(description)) ?? rules[rules.length - 1];
  return { category: hit.category, subcategory: hit.subcategory };
}

/** Recurrent services: by what the service is, with the department as the fallback. */
const RECURRENT_RULES: Rule[] = [
  { when: /medical insurance/i, category: 'HR', subcategory: 'Medical Insurance' },
  {
    when: /insurance|liability|compensation \[|wecl|wcel/i,
    category: 'Professional Services',
    subcategory: 'Insurance',
  },
  { when: /bayt|naukri|recruit|manpower/i, category: 'HR', subcategory: 'Recruitment' },
  { when: /compensation and benefits|survey/i, category: 'HR', subcategory: 'Recruitment' },
  {
    when: /parking|tower rental|office rental/i,
    category: 'Facility',
    subcategory: 'Property Management',
  },
  {
    when: /housekeeping|facilities management|maintenance service/i,
    category: 'Facility',
    subcategory: 'Operations & Maintenance',
  },
  { when: /storage|archiv/i, category: 'Logistics', subcategory: 'Warehouse Services' },
  { when: /risk advisory|security/i, category: 'Facility', subcategory: 'Security' },
  {
    when: /cloud|hosting|azure|backup|dns|website|vm\b|infrastructure|sonicwall|meraki|access point/i,
    category: 'IT',
    subcategory: 'Infrastructure',
  },
  { when: /consult|outsourc|support|amc|development/i, category: 'IT', subcategory: 'Software' },
];

const DEPARTMENT_FALLBACK: Record<string, CategoryPick> = {
  it: { category: 'IT', subcategory: 'Licenses' },
  finance: { category: 'Professional Services', subcategory: 'Finance' },
  hr: { category: 'HR', subcategory: 'Recruitment' },
  administration: { category: 'Facility', subcategory: 'Operations & Maintenance' },
  maintenance: { category: 'Facility', subcategory: 'Operations & Maintenance' },
  qhse: { category: 'IT', subcategory: 'Software' },
  operations: { category: 'IT', subcategory: 'Software' },
  'business development': { category: 'IT', subcategory: 'Infrastructure' },
};

export function recurrentCategory(
  r: Pick<RecurrentIn, 'serviceName' | 'description' | 'department'>,
): CategoryPick {
  const text = `${r.serviceName ?? ''} ${r.description ?? ''}`;
  const hit = RECURRENT_RULES.find((x) => x.when?.test(text));
  if (hit) return { category: hit.category, subcategory: hit.subcategory };
  return (
    DEPARTMENT_FALLBACK[
      String(r.department ?? '')
        .trim()
        .toLowerCase()
    ] ?? { category: 'IT', subcategory: 'Licenses' }
  );
}

/* ─── the plan ───────────────────────────────────────────────────────────────────────────── */

function lastYear(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function planMigration(input: {
  rental: RentalLineIn[];
  recurrent: RecurrentIn[];
  existing: ExistingItem[];
  today: string;
}): MigrationPlan {
  const skipped: MigrationPlan['skipped'] = [];
  const existingBy = new Map<string, string>();
  for (const e of input.existing)
    existingBy.set(
      `${e.countryCode}|${normaliseVendor(e.supplierCode)}|${normaliseName(e.itemName)}`,
      e.code,
    );
  const match = (country: string, vendor: string, name: string) =>
    existingBy.get(`${country}|${normaliseVendor(vendor)}|${normaliseName(name)}`) ?? null;

  const byKey = new Map<string, PlannedItem>();
  for (const l of input.rental) {
    if (l.registryCode) continue; // already moved
    if (!normaliseVendor(l.supplierCode)) {
      skipped.push({ kind: 'rental', id: l.id, reason: 'No vendor code' });
      continue;
    }
    const itemName = stripSegment(l.description);
    const uom = uomName(l.uom);
    const rate = l.rate ?? 0;
    const key = [
      'rental',
      l.countryCode,
      normaliseVendor(l.supplierCode),
      normaliseName(itemName),
      uom,
      rate.toFixed(3),
    ].join('|');
    const item = byKey.get(key);
    if (item) {
      item.rentalLineIds.push(l.id);
      continue;
    }
    byKey.set(key, {
      key,
      type: 'rental',
      countryCode: l.countryCode,
      supplierCode: normaliseVendor(l.supplierCode),
      supplierName: l.supplierName,
      itemName,
      uomName: uom,
      unitPrice: rate,
      currency: null,
      rateToConfirm: !(rate > 0),
      category: rentalCategory(l.category, l.description),
      serviceNumber: l.serviceNumber,
      effectiveDate: l.startsOn ?? input.today,
      expiryDate: null,
      existingCode: match(l.countryCode, l.supplierCode, itemName),
      rentalLineIds: [l.id],
      recurrentId: null,
    });
  }

  for (const r of input.recurrent) {
    if (r.registryCode) continue;
    const vendor = normaliseVendor(r.supplierCode);
    if (!vendor) {
      skipped.push({ kind: 'recurrent', id: r.id, reason: 'No vendor code' });
      continue;
    }
    const itemName = (r.serviceName || r.description).trim();
    const value = r.annualValue ?? 0;
    const key = ['recurrent', r.countryCode, r.id].join('|');
    byKey.set(key, {
      key,
      type: 'recurrent',
      countryCode: r.countryCode,
      supplierCode: vendor,
      supplierName: r.supplierName ?? vendor,
      itemName,
      uomName: 'Year',
      unitPrice: value,
      currency: r.currency,
      rateToConfirm: !(value > 0),
      category: recurrentCategory(r),
      serviceNumber: null,
      effectiveDate: r.contractExpiry ? lastYear(r.contractExpiry) : input.today,
      expiryDate: r.contractExpiry,
      existingCode: match(r.countryCode, vendor, itemName),
      rentalLineIds: [],
      recurrentId: r.id,
    });
  }
  return { items: [...byKey.values()], skipped };
}

/** A registry unit of measure as RRSM codes it ("Month" → month). Anything else counts as a unit. */
export function rrsmUom(catalogUom: string): string {
  const back: Record<string, string> = {
    month: 'month',
    day: 'day',
    hour: 'hour',
    'per person': 'headcount',
    each: 'unit',
  };
  return (
    back[
      String(catalogUom ?? '')
        .trim()
        .toLowerCase()
    ] ?? 'unit'
  );
}
