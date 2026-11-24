/*
 * The Supply Chain Health Board's fixed vocabulary: which KPIs exist, how each one is read, and
 * which countries there are. See RULES.md beside this file for why each rule is what it is.
 *
 * Relative imports only (no `@/` alias): scripts/health-board-seed.mjs loads this folder through
 * jiti, so the initial load and the /admin upload apply exactly the same rules.
 */

export type Direction = 'higher' | 'lower' | 'none';

export type YtdMethod =
  /** the latest month with a value (a balance at a point in time) */
  | 'latest'
  /** sum of the months (a cumulative amount) */
  | 'sum'
  /** the uploaded YTD row; never calculated */
  | 'entered'
  /** average of the quarter-end values entered */
  | 'quarterly_average'
  /** average of the monthly values entered */
  | 'average'
  | 'none';

export interface KpiDefinition {
  /** The KPI's name in the source data (the SharePoint list's Title column). */
  code: string;
  /** What the board calls it (Power BI's CustomKPIName). */
  name: string;
  unit: '%' | 'Days' | '$' | 'Suppliers';
  direction: Direction;
  ytd: YtdMethod;
  frequency: 'monthly' | 'quarterly';
  /** On the overview table. The four left off are the ones Power BI's report filter hid. */
  overview: boolean;
  /** The first year the KPI is no longer reported (owner's ruling). Earlier years stay viewable. */
  discontinuedFrom?: number;
}

/** Whether a KPI is still reported in a year. */
export function activeIn(kpi: KpiDefinition, year: number): boolean {
  return kpi.discontinuedFrom === undefined || year < kpi.discontinuedFrom;
}

export const KPIS: readonly KpiDefinition[] = [
  {
    code: 'KPI - Cycle Time for FAT approvals',
    name: 'Cycle Time - FAT Approvals in Zoho',
    unit: 'Days',
    direction: 'lower',
    ytd: 'average',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - DSOH',
    name: 'Days Stock On Hand (DSOH)',
    unit: 'Days',
    direction: 'lower',
    ytd: 'latest',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - FMT - ICPO Transfer out',
    name: 'FMT - ICPO Transfer Out',
    unit: '$',
    direction: 'lower',
    ytd: 'sum',
    frequency: 'monthly',
    overview: false,
  },
  {
    code: 'KPI - FieldSync (FAT) ETA vs ATA%',
    name: 'FieldSync - FAT ETA vs ATA %',
    unit: '%',
    direction: 'higher',
    ytd: 'average',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - FieldSync (FMT) ETA vs ATA%',
    name: 'FieldSync - FMT ETA vs ATA %',
    unit: '%',
    direction: 'higher',
    ytd: 'average',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - InvRecon Acc',
    name: 'Inventory Reconciliation Accuracy',
    unit: '%',
    direction: 'higher',
    ytd: 'quarterly_average',
    frequency: 'quarterly',
    overview: true,
  },
  {
    code: 'KPI - InvRecon Aging',
    name: 'Inventory Reconciliation Aging',
    unit: 'Days',
    direction: 'lower',
    ytd: 'quarterly_average',
    frequency: 'quarterly',
    overview: true,
  },
  {
    code: 'KPI - Inventory Reduction',
    name: 'Inventory Reduction',
    unit: '$',
    direction: 'lower',
    ytd: 'latest',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - OTD',
    name: 'On-Time Delivery (OTD)',
    unit: '%',
    direction: 'higher',
    ytd: 'average',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - P&L (M&S)',
    name: 'Profit & Loss (MS)',
    unit: '%',
    direction: 'lower',
    ytd: 'entered',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - P&L (O&C)',
    name: 'Profit & Loss (OC)',
    unit: '%',
    direction: 'lower',
    ytd: 'entered',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - P&L (O&R)',
    name: 'Profit & Loss (OR)',
    unit: '%',
    direction: 'lower',
    ytd: 'entered',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - P&L (PC/PR)',
    name: 'Profit & Loss (PC/PR)',
    unit: '%',
    direction: 'lower',
    ytd: 'entered',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - P&L (T&E)',
    name: 'Profit & Loss (T&E)',
    unit: '%',
    direction: 'lower',
    ytd: 'entered',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - P&L (T&M)',
    name: 'Profit & Loss (T&M)',
    unit: '%',
    direction: 'lower',
    ytd: 'entered',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - PIR Coverage',
    name: 'Catalogue Coverage / PIR Coverage',
    unit: '%',
    direction: 'higher',
    ytd: 'average',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - PO < 250 $',
    name: 'PO Value < 250 $',
    unit: '%',
    direction: 'lower',
    ytd: 'average',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - PO Approval',
    name: 'PO Approval Days',
    unit: 'Days',
    direction: 'lower',
    ytd: 'average',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - PR to PO creation',
    name: 'PR to PO Creation Days',
    unit: 'Days',
    direction: 'lower',
    ytd: 'average',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - Past Due',
    name: 'POs Past Due %',
    unit: '%',
    direction: 'lower',
    ytd: 'average',
    frequency: 'monthly',
    overview: false,
    discontinuedFrom: 2026,
  },
  {
    code: 'KPI - Past Due > 30 Days',
    name: 'POs Past Due % > 30 Days',
    unit: '%',
    direction: 'lower',
    ytd: 'average',
    frequency: 'monthly',
    overview: false,
    discontinuedFrom: 2026,
  },
  {
    code: 'KPI - Post Fact',
    name: 'Post-Fact',
    unit: '%',
    direction: 'lower',
    ytd: 'average',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - QBR',
    name: 'Supplier QBR',
    unit: 'Suppliers',
    direction: 'none',
    ytd: 'none',
    frequency: 'monthly',
    overview: false,
  },
  {
    code: 'KPI - SOA Consolidation',
    name: 'Statement of Account (SOA) Consolidation',
    unit: '%',
    direction: 'higher',
    ytd: 'quarterly_average',
    frequency: 'quarterly',
    overview: true,
  },
  {
    code: 'KPI - Slow Moving',
    name: 'Slow-Moving Inventory > 2 Years',
    unit: '$',
    direction: 'lower',
    ytd: 'latest',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - SourceGuide Coverage',
    name: 'SourceGuide Coverage',
    unit: '%',
    direction: 'higher',
    ytd: 'quarterly_average',
    frequency: 'quarterly',
    overview: true,
  },
  {
    code: 'KPI - Supplier No.',
    name: 'Supplier Count',
    unit: 'Suppliers',
    direction: 'lower',
    ytd: 'latest',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - TLT (Intl)',
    name: 'Supplier Lead Time - PO to GR (International)',
    unit: 'Days',
    direction: 'lower',
    ytd: 'average',
    frequency: 'monthly',
    overview: true,
  },
  {
    code: 'KPI - TLT (Local)',
    name: 'Supplier Lead Time - PO to GR (Local)',
    unit: 'Days',
    direction: 'lower',
    ytd: 'average',
    frequency: 'monthly',
    overview: true,
  },
];

const KPI_BY_CODE = new Map(KPIS.map((k) => [k.code, k]));

export function kpiByCode(code: string): KpiDefinition | undefined {
  return KPI_BY_CODE.get(code.trim());
}

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
export type Month = (typeof MONTHS)[number];

export const QUARTER_MONTHS: readonly Month[] = ['March', 'June', 'September', 'December'];

export type Period = 'Baseline' | 'Target' | 'YTD' | Month;
export const PERIODS: readonly Period[] = ['Baseline', 'Target', 'YTD', ...MONTHS];

export function isMonth(p: string): p is Month {
  return (MONTHS as readonly string[]).includes(p);
}

/** A period label as entered → the canonical label, or null. Only surrounding space is forgiven. */
export function normalisePeriod(raw: string): Period | null {
  const p = raw.trim();
  return (PERIODS as readonly string[]).includes(p) ? (p as Period) : null;
}

/** Power BI's "Country Order" list, in its order, with the two EOS entities after EOS. */
export const COUNTRIES = [
  'Global',
  'Saudi Arabia',
  'Oman',
  'Egypt',
  'UAE',
  'Algeria',
  'Kuwait',
  'Bahrain',
  'Iraq',
  'HQ Dubai',
  'Qatar',
  'Libya',
  'Yemen',
  'India',
  'Indonesia',
  'Chad',
  'Congo',
  'Jordan',
  'EOS',
  'EOS DMCC',
  'EOS JAFZA',
  'Syria',
] as const;
export type Country = (typeof COUNTRIES)[number];

/*
 * Spellings → country, copied from Power BI's Country_Normalized column, except that EOS DMCC and
 * EOS JAFZA are their own entities (RULES.md, fix 8). Matching ignores case, surrounding space and
 * zero-width characters (the list has "Algeria​"), and nothing else.
 */
const ALIASES: Record<Country, string[]> = {
  Global: ['Global'],
  'Saudi Arabia': ['KSA LOCL', 'KSA', 'Saudi Arabia'],
  Oman: ['OMN', 'Oman', 'Oman LOCL'],
  Egypt: ['EGPT', 'Egypt', 'Egypt LOCL'],
  UAE: [
    'UAE',
    'Utd.Arab Emir.',
    'UAE – Abu Dhabi',
    'Abu Dhabi LOCL',
    'AUH',
    'Abu Dhabi',
    'United Arab Emirates',
  ],
  'HQ Dubai': ['Dubai HQ', 'HQ Dubai', 'HQ UAE', 'HQ', 'Dubai LOCL', 'Dubai'],
  EOS: ['EOS', 'UAE - EOS'],
  'EOS DMCC': ['EOS DMCC'],
  'EOS JAFZA': ['EOS JAFZA'],
  Algeria: ['ALG', 'Algeria', 'Algeria LOCL'],
  Kuwait: ['KWT', 'Kuwait', 'Kuwait LOCL'],
  Iraq: ['IRQ', 'Iraq', 'Iraq LOCL'],
  Indonesia: ['INA', 'Indonesia', 'Indonesia LOCL'],
  Qatar: ['Qatar', 'Qatar LOCL'],
  Libya: ['LBY', 'Libya', 'Libya LOCL'],
  Yemen: ['Yemen', 'Yemen LOCL'],
  India: ['IND', 'India', 'India LOCL'],
  Chad: ['Chad', 'Chad LOCL', 'SSA'],
  Congo: ['Rep.of Congo', 'Congo LOCL', 'Congo'],
  Jordan: ['JRD', 'Jordon', 'Jordan', 'Jordan LOCL'],
  Bahrain: ['BHR', 'Bahrain', 'Bahrain LOCL'],
  Syria: ['Syria LOCL'],
};

function aliasKey(s: string): string {
  return s
    .replace(/[​‌‍﻿]/g, '')
    .trim()
    .toLowerCase();
}

const COUNTRY_BY_ALIAS = new Map<string, Country>();
for (const [country, aliases] of Object.entries(ALIASES) as [Country, string[]][]) {
  /* The board's own name is always accepted, so a file the board wrote (the prefilled template)
     always reads back: Power BI only knew Syria as "Syria LOCL". */
  for (const a of [country, ...aliases]) COUNTRY_BY_ALIAS.set(aliasKey(a), country);
}

/** A country name as entered → the board's country, or null when it is not a known spelling. */
export function normaliseCountry(raw: string): Country | null {
  return COUNTRY_BY_ALIAS.get(aliasKey(raw)) ?? null;
}

/** Category text as entered, with the stray trailing spaces of the source list removed. */
export function normaliseCategory(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
