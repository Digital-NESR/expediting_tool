/*
 * The wording of each KPI's detail page, taken from the Power BI pages with their copy errors
 * fixed (RULES.md, "Detail pages"). Three pages are new (P&L T&E, PO Value < 250 $, SourceGuide
 * Coverage); their text is the owner-approved draft. Supplier QBR has no data and no page.
 */

export interface KpiPage {
  /** URL segment: /supply-chain-analytics/health-board/<slug> */
  slug: string;
  title: string;
  description: string;
  /** A second line under the description, where Power BI had one. */
  note?: string;
  source: string;
  sourceNote?: string;
  chartTitle: string;
}

export const KPI_PAGES: Record<string, KpiPage> = {
  'KPI - P&L (M&S)': {
    slug: 'pl-ms',
    title: 'P&L | MS / TR',
    description: '% Reduction in Material Supplies & Maintenance (M&S) - Lower is better',
    source: 'NIS',
    chartTitle: 'P&L % (M&S) by Month',
  },
  'KPI - P&L (O&C)': {
    slug: 'pl-oc',
    title: 'P&L | OC / TR',
    description: '% Reduction in Office & Camp (O&C) - Lower is better',
    source: 'NIS',
    chartTitle: 'P&L % (O&C) by Month',
  },
  'KPI - P&L (O&R)': {
    slug: 'pl-or',
    title: 'P&L | OR / TR',
    description: '% Reduction in Operational Rental - Lower is better',
    source: 'NIS',
    chartTitle: 'P&L % (O&R) by Month',
  },
  'KPI - P&L (PC/PR)': {
    slug: 'pl-pc-pr',
    title: 'P&L | PC / PR',
    description: '% Reduction in PC/PR - Lower is better',
    source: 'NIS',
    chartTitle: 'P&L % (PC/PR) by Month',
  },
  'KPI - P&L (T&M)': {
    slug: 'pl-tm',
    title: 'P&L | TM / TR',
    description: '% Reduction in Transportation & Freight (T&M) - Lower is better',
    source: 'NIS',
    chartTitle: 'P&L % (T&M) by Month',
  },
  'KPI - P&L (T&E)': {
    slug: 'pl-te',
    title: 'P&L | TE / TR',
    description: 'Travel & Entertainment as % of total revenue - Lower is better',
    source: 'NIS',
    chartTitle: 'P&L % (T&E) by Month',
  },
  'KPI - Supplier No.': {
    slug: 'supplier-count',
    title: 'Supplier Segmentation & Rationalization',
    description: 'Number of Active Vendors in SAP - Lower is better',
    note: 'Active Vendors Registered in Local purchasing org',
    source: 'Supplier Management | AVL',
    chartTitle: 'No. of Active Vendors by Month',
  },
  'KPI - PIR Coverage': {
    slug: 'pir-coverage',
    title: 'Spend by Catalogue/PIR Coverage',
    description: 'Percentage by Value of POs under PIR - Higher is better',
    source: 'Purchase Info Record',
    chartTitle: '% of PO Value under PIR by Month',
  },
  'KPI - SourceGuide Coverage': {
    slug: 'sourceguide-coverage',
    title: 'SourceGuide Coverage',
    description: '% coverage of SourceGuide sourcing guides - Higher is better',
    source: 'SourceGuide',
    chartTitle: 'SourceGuide Coverage by Quarter',
  },
  'KPI - OTD': {
    slug: 'otd',
    title: 'On Time Delivery',
    description: '% of POs that are Delivered on Time - Higher is better',
    note: '7 Days before or 7 Days after the Promised Delivery Date',
    source: 'Supply Chain Data to Insights 2.0',
    chartTitle: '% of POs Delivered on Time by Month',
  },
  'KPI - PO Approval': {
    slug: 'po-approval',
    title: 'Cycle Time for PO Approval',
    description: 'Number of Days it takes on an Average to Approve a PO - Lower is better',
    source: 'Purchasing Performance',
    chartTitle: 'No. of Days for PO Approval by Month',
  },
  'KPI - Past Due': {
    slug: 'past-due',
    title: '%Past Due',
    description: '% of POs that are past their Delivery Date - Lower is better',
    source: 'Supply Chain Data to Insights 2.0',
    chartTitle: '% of Past Due POs by Month',
  },
  'KPI - Past Due > 30 Days': {
    slug: 'past-due-30',
    title: '%Past Due > 30 Days',
    description: '% of POs that are more than 30 days past their Delivery Date - Lower is better',
    source: 'Supply Chain Data to Insights 2.0',
    chartTitle: '% of POs Past Due > 30 Days by Month',
  },
  'KPI - Post Fact': {
    slug: 'post-fact',
    title: 'Post Fact',
    description: '% of POs that are created Post Fact - Lower is better',
    source: 'P2P Audit & Governance',
    chartTitle: '% of Post-Fact POs by Month',
  },
  'KPI - PR to PO creation': {
    slug: 'pr-to-po',
    title: 'Cycle Time for PR to PO Creation',
    description: 'Number of Days it takes on an Average to convert a PR to PO - Lower is better',
    source: 'Purchasing Performance',
    chartTitle: 'Days to Create POs from PRs by Month',
  },
  'KPI - PO < 250 $': {
    slug: 'po-under-250',
    title: 'PO Value < 250 $',
    description: '% of POs with a value under $250 - Lower is better',
    source: 'Purchasing Performance',
    chartTitle: '% of POs under $250 by Month',
  },
  'KPI - SOA Consolidation': {
    slug: 'soa-consolidation',
    title: 'SOA Consolidation',
    description: '% of Absolute Spend Coverage Consolidated - Higher is better',
    source: 'SOA Consolidation Excel',
    chartTitle: '% of Absolute Spend Coverage Consolidated by Quarter',
  },
  'KPI - TLT (Intl)': {
    slug: 'lead-time-international',
    title: 'Supplier Lead Time (International)',
    description: 'No. of days from PO to GR for international vendors - Lower is better',
    source: 'Supply Chain Data to Insights 2.0',
    chartTitle: 'Days from PO to GR by Month',
  },
  'KPI - TLT (Local)': {
    slug: 'lead-time-local',
    title: 'Supplier Lead Time (Local)',
    description: 'No. of days from PO to GR for local vendors - Lower is better',
    source: 'Supply Chain Data to Insights 2.0',
    chartTitle: 'Days from PO to GR by Month',
  },
  'KPI - InvRecon Acc': {
    slug: 'physical-count-accuracy',
    title: 'Quarterly Physical Count Accuracy - InvRecon',
    description: 'Quarterly Count Accuracy b/w Physical and SAP Inventory - Higher is better',
    source: 'Quality Governor - InvRecon Analytic',
    chartTitle: 'Inventory Accuracy by Quarter',
  },
  'KPI - InvRecon Aging': {
    slug: 'physical-count-reconciliation',
    title: 'Physical Count Reconciliation',
    description: 'Number of days from Count Completed to Adjustment in SAP - Lower is better',
    source: 'Quality Governor - InvRecon Analytic',
    chartTitle: 'No. of Days for Count Aging by Quarter',
  },
  'KPI - DSOH': {
    slug: 'dsoh',
    title: 'DSOH (Days Stock On Hand)',
    description: 'Average number of days a material is aging - Lower is better',
    source: 'NESR Inventory Trends 2.0',
    chartTitle: 'No. of days a material is aging by Month',
  },
  'KPI - Inventory Reduction': {
    slug: 'inventory-reduction',
    title: 'Inventory Reduction',
    description: 'YE Total Inventory Value - Lower is better',
    source: 'NESR Inventory Trends 2.0',
    chartTitle: 'Inventory Value by Month',
  },
  'KPI - Slow Moving': {
    slug: 'slow-moving',
    title: 'Slow Moving Inventory Reduction > 2 Years',
    description: 'Reduction in slow-moving inventory Aging > 2 Years - Lower is better',
    source: 'NESR Inventory Trends 2.0',
    chartTitle: 'Slow moving Inventory Value > 2 Years by Month',
  },
  'KPI - FMT - ICPO Transfer out': {
    slug: 'intercompany-transfer-out',
    title: 'Intercompany - Transfer Out',
    description: '$ Value of Intercompany POs - Higher is better',
    source: 'NESR Inventory Trends 2.0',
    chartTitle: 'Intercompany Transfer-out Value by Month',
  },
  'KPI - FieldSync (FMT) ETA vs ATA%': {
    slug: 'fieldsync-fmt',
    title: 'Cycle Time for FieldSync FMT ETA vs ATA%',
    description: 'Accuracy of ETA Prediction when compared to ATA - Higher is better',
    source: 'FieldSync Analytics',
    chartTitle: '% Accuracy of ETA vs ATA by Month',
  },
  'KPI - FieldSync (FAT) ETA vs ATA%': {
    slug: 'fieldsync-fat',
    title: 'Cycle Time for FieldSync FAT ETA vs ATA%',
    description: 'Accuracy of ETA Prediction when compared to ATA - Higher is better',
    source: 'FieldSync Analytics',
    sourceNote: 'YE = Whole Year Avg.',
    chartTitle: '% Accuracy of ETA vs ATA by Month',
  },
  'KPI - Cycle Time for FAT approvals': {
    slug: 'fat-approval',
    title: 'Cycle Time for FAT (Step 2-6 in ZOHO) Approval',
    description: 'Average Number of days it takes for ZOHO approvals - Lower is better',
    source: 'FieldSync Analytics',
    chartTitle: 'No. of days for FAT Approval by Month',
  },
};

const BY_SLUG = new Map(Object.entries(KPI_PAGES).map(([code, p]) => [p.slug, code]));

/** The KPI code a page slug belongs to, or null. */
export function kpiCodeForSlug(slug: string): string | null {
  return BY_SLUG.get(slug) ?? null;
}
