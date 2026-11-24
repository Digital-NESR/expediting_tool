/*
 * The Health Board's Read Me: what each KPI measures and where it comes from.
 *
 * Taken from the Power BI "Read Me" page with the owner's corrections of 24 Nov 2026:
 * - copy errors fixed (the FieldSync block was headed "Materials Management"; "after the receiving
 *   the invoice");
 * - where the Read Me disagreed with the KPI's own page and with the data, it now agrees with them
 *   (Slow Moving is monthly from NESR Inventory Trends 2.0; InvRecon Aging is days from count
 *   completed to adjustment in SAP);
 * - the four KPIs the Read Me never covered use their detail-page description.
 * Whether higher or lower is better comes from definitions.ts, not from this text.
 */

export interface ReadMeEntry {
  /** What the KPI is, in one or two sentences. */
  text: string[];
  cadence: 'Month on Month' | 'Quarter on Quarter';
  source: string;
  /** How the Global figure is formed, where the Read Me said. */
  global?: string;
  /** Replaces the "Higher / Lower is better" badge where those words would mislead. */
  better?: string;
}

const NIS = 'NIS, provided by Finance';

export const README: Record<string, ReadMeEntry> = {
  'KPI - Supplier No.': {
    text: ['Number of suppliers registered in the LOCL Purchasing Org, by country.'],
    cadence: 'Month on Month',
    source: 'Supplier Management | AVL dashboard',
    global: 'The total of all countries is the Global number of suppliers.',
  },
  'KPI - P&L (PC/PR)': {
    text: ['PC/PR – Product Cost / Product Revenue, in percentage.'],
    cadence: 'Month on Month',
    source: NIS,
  },
  'KPI - P&L (M&S)': {
    text: ['MS/TR – Material Supplies & Maintenance, in percentage of total revenue.'],
    cadence: 'Month on Month',
    source: NIS,
  },
  'KPI - P&L (O&C)': {
    text: ['OC/TR – Office & Camps, in percentage of total revenue.'],
    cadence: 'Month on Month',
    source: NIS,
  },
  'KPI - P&L (O&R)': {
    text: ['OR/TR – Operational Rental, in percentage of total revenue.'],
    cadence: 'Month on Month',
    source: NIS,
  },
  'KPI - P&L (T&M)': {
    text: ['TM/TR – Transportation & Freight, in percentage of total revenue.'],
    cadence: 'Month on Month',
    source: NIS,
  },
  'KPI - P&L (T&E)': {
    text: ['TE/TR – Travel & Entertainment, in percentage of total revenue.'],
    cadence: 'Month on Month',
    source: NIS,
  },
  'KPI - PIR Coverage': {
    text: ['Percentage by value of POs under a Purchase Info Record (catalogue / PIR coverage).'],
    cadence: 'Month on Month',
    source: 'Purchase Info Record',
  },
  'KPI - SourceGuide Coverage': {
    text: ['Percentage coverage of SourceGuide sourcing guides.'],
    cadence: 'Quarter on Quarter',
    source: 'SourceGuide',
  },
  'KPI - OTD': {
    text: [
      "Percentage of POs GR'ed within 14 days (7 days before or 7 days after) of the delivery date promised by the vendor.",
    ],
    cadence: 'Month on Month',
    source: 'Supply Chain Data to Insights 2.0 dashboard',
    global: 'The average percentage of all POs delivered on time is the Global figure.',
  },
  'KPI - PO Approval': {
    text: ['Number of days it takes on average to fully approve a PO (PO released), by country.'],
    cadence: 'Month on Month',
    source: 'Purchasing Performance dashboard',
    global: 'The average number of days to approve all POs is the Global figure.',
  },
  'KPI - PR to PO creation': {
    text: ['Number of days it takes on average to create a PO from a PR, by country.'],
    cadence: 'Month on Month',
    source: 'Purchasing Performance dashboard',
    global: 'The average number of days to create all POs from PRs is the Global figure.',
  },
  'KPI - Past Due': {
    text: ['Percentage of POs that are past their promised delivery date, by country.'],
    cadence: 'Month on Month',
    source: 'Supply Chain Data to Insights 2.0 dashboard',
    global: 'The average percentage of all POs past their delivery date is the Global figure.',
  },
  'KPI - Past Due > 30 Days': {
    text: [
      'Percentage of POs that are more than 30 days past their promised delivery date, by country.',
    ],
    cadence: 'Month on Month',
    source: 'Supply Chain Data to Insights 2.0 dashboard',
    global:
      'The average percentage of all POs more than 30 days past their delivery date is the Global figure.',
  },
  'KPI - Post Fact': {
    text: [
      'Percentage of POs created post fact: POs created after receiving the invoice (the invoice date is before the PO creation date).',
    ],
    cadence: 'Month on Month',
    source: 'P2P Audit & Governance dashboard',
    global: 'The average percentage of all POs created post fact is the Global figure.',
  },
  'KPI - PO < 250 $': {
    text: ['Percentage of POs with a value under $250.'],
    cadence: 'Month on Month',
    source: 'Purchasing Performance',
  },
  'KPI - SOA Consolidation': {
    text: [
      'Percentage of total spend consolidated from supplier statements of account, by country.',
    ],
    cadence: 'Quarter on Quarter',
    source: 'SOA Consolidation Excel',
    global: 'The average percentage of all countries is the Global figure.',
  },
  'KPI - TLT (Local)': {
    text: ['Number of days on average from PO release date to GR date for local suppliers.'],
    cadence: 'Month on Month',
    source: 'Supply Chain Data to Insights 2.0 dashboard',
    global: 'The average number of days for all POs is the Global figure.',
  },
  'KPI - TLT (Intl)': {
    text: [
      'Number of days on average from PO release date to GR date for international suppliers.',
    ],
    cadence: 'Month on Month',
    source: 'Supply Chain Data to Insights 2.0 dashboard',
    global: 'The average number of days for all POs is the Global figure.',
  },
  'KPI - DSOH': {
    text: ['Average number of days a material is aging in inventory, by country.'],
    cadence: 'Month on Month',
    source: 'NESR Inventory Trends 2.0 dashboard',
    global: 'The average number of days for all materials in inventory is the Global figure.',
  },
  'KPI - FMT - ICPO Transfer out': {
    text: [
      'Total value of intercompany POs (ICPOs) in $, by country. Transfers out are stored as negative amounts, so a more negative figure means more was transferred out.',
    ],
    better: 'More transfer out is better (lower number)',
    cadence: 'Month on Month',
    source: 'NESR Inventory Trends 2.0 dashboard',
    global: 'The total value of all ICPOs in $ is the Global figure.',
  },
  'KPI - InvRecon Acc': {
    text: ['Accuracy percentage of physical inventory against SAP inventory, by country.'],
    cadence: 'Quarter on Quarter',
    source: 'Quality Governor - InvRecon Analytic dashboard',
    global: 'The average accuracy of all countries is the Global figure.',
  },
  'KPI - InvRecon Aging': {
    text: ['Number of days from count completed to adjustment in SAP, by country.'],
    cadence: 'Quarter on Quarter',
    source: 'Quality Governor - InvRecon Analytic dashboard',
    global: 'The average number of days of all countries is the Global figure.',
  },
  'KPI - Inventory Reduction': {
    text: ['Total value of inventory in $, by country.'],
    cadence: 'Month on Month',
    source: 'NESR Inventory Trends 2.0 dashboard',
    global: 'The total value of all inventory in $ is the Global figure.',
  },
  'KPI - Slow Moving': {
    text: ['Total value of inventory in $ aging more than 2 years, by country.'],
    cadence: 'Month on Month',
    source: 'NESR Inventory Trends 2.0 dashboard',
    global: 'The total value of this inventory for all countries is the Global figure.',
  },
  'KPI - Cycle Time for FAT approvals': {
    text: ['Average number of days it takes for FAT approvals in ZOHO (steps 2–6), by country.'],
    cadence: 'Month on Month',
    source: 'FieldSync Analytics dashboard',
    global: 'The average number of days for all ZOHO requests is the Global figure.',
  },
  'KPI - FieldSync (FAT) ETA vs ATA%': {
    text: [
      'Average accuracy of the predicted ETA against the ATA for FAT through FieldSync, by country.',
    ],
    cadence: 'Month on Month',
    source: 'FieldSync Analytics dashboard',
    global: 'The average accuracy for all FAT transfers through FieldSync is the Global figure.',
  },
  'KPI - FieldSync (FMT) ETA vs ATA%': {
    text: [
      'Average accuracy of the predicted ETA against the ATA for FMT through FieldSync, by country.',
    ],
    cadence: 'Month on Month',
    source: 'FieldSync Analytics dashboard',
    global: 'The average accuracy for all FMT transfers through FieldSync is the Global figure.',
  },
};

/** How each YTD method is explained to a reader. */
export const YTD_EXPLAINED: Record<string, string> = {
  latest: 'the latest month with a value (these are balances at a point in time)',
  sum: 'the sum of the months entered',
  entered: "Finance's year-to-date figure, uploaded as its own row; never calculated",
  quarterly_average: 'the average of the quarters entered (March, June, September, December)',
  average: 'the average of the months entered',
};
