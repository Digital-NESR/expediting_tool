// Question bank for the ICSA (Internal Control Self-Assessment), Supply Chain
// function, aligned with SOX controls. Carried over verbatim from the NESR ICSA
// Self-Assessment artifact. A section is also a form variation: a champion
// assigns each respondent the sections that match what they do.

export type IcsaSectionKey =
  'policy' | 'planning' | 'sourcing' | 'po' | 'grn' | 'valuation' | 'movement';

export interface IcsaQuestion {
  ref: string;
  text: string;
}

export interface IcsaSection {
  key: IcsaSectionKey;
  id: number;
  short: string;
  title: string;
  questions: IcsaQuestion[];
}

export const ICSA_SECTIONS: IcsaSection[] = [
  {
    key: 'policy',
    id: 1,
    short: 'Policy Manual',
    title: 'Procurement & Inventory Policy Manual',
    questions: [
      {
        ref: 'Q1.1',
        text: 'Is the Procurement and Inventory Policy Manual up-to-date, and has it been reviewed within the last 12 months? (If yes, mention the review date in remarks)',
      },
      {
        ref: 'Q1.2',
        text: 'Does the policy include country-specific scenarios and requirements relevant to {country}?',
      },
      {
        ref: 'Q1.3',
        text: 'Has the policy been formally communicated and made accessible to all relevant staff through official channels (e.g., intranet, email)?',
      },
      {
        ref: 'Q1.4',
        text: 'Have procurement and inventory staff, including new joiners, received orientation or training to ensure they understand the policy?',
      },
      {
        ref: 'Q1.5',
        text: 'Are all deviations from the policy formally documented and approved by an appropriate authority level?',
      },
    ],
  },
  {
    key: 'planning',
    id: 2,
    short: 'Planning and Requisition',
    title: 'Procurement Planning & Requisition Management',
    questions: [
      {
        ref: 'Q2.1',
        text: 'Is there an annual procurement plan reviewed and approved by senior management?',
      },
      {
        ref: 'Q2.2',
        text: 'Is the procurement plan aligned with the annual budget and departmental needs?',
      },
      {
        ref: 'Q2.3',
        text: 'Is the procurement plan reviewed periodically (e.g., quarterly) to accommodate business changes?',
      },
      {
        ref: 'Q2.4',
        text: 'Are procurement activities regularly tracked against the plan to monitor compliance and identify deviations?',
      },
      {
        ref: 'Q2.5',
        text: 'Are emergency and Non-PO procurements subject to clearly defined thresholds, post-facto approval, and periodic review for justification and misuse?',
      },
      {
        ref: 'Q2.6',
        text: 'Are open PRs (pending PO conversion) periodically reviewed and cancelled if found to be obsolete, duplicate, or unnecessary?',
      },
      {
        ref: 'Q2.7',
        text: 'Are PRs raised only after confirming that similar items are not already available in stock or under existing POs?',
      },
      {
        ref: 'Q2.8',
        text: 'Are PRs linked to relevant cost centers, project codes, or departments for accountability purposes?',
      },
      {
        ref: 'Q2.9',
        text: 'Are all PRs raised with valid business justification and supported by sufficient technical specifications or scope details?',
      },
      {
        ref: 'Q2.10',
        text: 'Are PRs routed through budget owners or cost center heads for review and approval?',
      },
      {
        ref: 'Q2.11',
        text: 'Is there system enforcement of maker-checker control during PR creation and approval (e.g., requester ≠ approver)?',
      },
      {
        ref: 'Q2.12',
        text: 'Is there a workflow in the SAP system for multi-level PR approval based on value thresholds?',
      },
      {
        ref: 'Q2.13',
        text: 'Are recurring or blanket PRs adequately controlled, reviewed for duplication, and aligned with the procurement plan?',
      },
      {
        ref: 'Q2.14',
        text: 'Are PR-to-PO conversion timelines and overall lead time from requisition to PO issuance tracked and analyzed to address delays or bottlenecks?',
      },
    ],
  },
  {
    key: 'sourcing',
    id: 3,
    short: 'Vendor and Sourcing',
    title: 'Vendor Master & Sourcing Controls',
    questions: [
      {
        ref: 'Q3.1',
        text: 'Is there a centralized, up-to-date, and duplicate-free vendor master in the SAP?',
      },
      {
        ref: 'Q3.2',
        text: 'Are vendor records reviewed periodically to deactivate dormant, duplicate, or unverified vendors?',
      },
      {
        ref: 'Q3.3',
        text: 'Is there a documented SOP for creating, updating, and approving vendor master records, including defined roles and responsibilities?',
      },
      {
        ref: 'Q3.4',
        text: 'Are vendor records properly classified (e.g., local/foreign, service/supply, critical/non-critical)?',
      },
      {
        ref: 'Q3.5',
        text: 'Are vendor bank details changes subject to dual control (initiated by one user and approved by another)?',
      },
      {
        ref: 'Q3.6',
        text: 'Is an audit trail/log maintained for all changes made to vendor master data, including timestamps and user IDs?',
      },
      {
        ref: 'Q3.7',
        text: 'Are new vendors onboarded only after complete KYC checks, blacklist screenings, and conflict of interest declarations?',
      },
      {
        ref: 'Q3.8',
        text: 'Are duplicate vendors automatically flagged by the system during onboarding (e.g., based on tax ID or IBAN)?',
      },
      {
        ref: 'Q3.9',
        text: 'Is there a centralized and updated repository of vendor contracts, rate cards, and framework agreements?',
      },
      {
        ref: 'Q3.10',
        text: 'Are key vendors linked to signed contracts, rate cards, or framework agreements?',
      },
      {
        ref: 'Q3.11',
        text: 'Is there a contract renewal/expiry tracking mechanism with alerts for expiring agreements?',
      },
      {
        ref: 'Q3.12',
        text: 'Are RFQs or RFPs mandatory for all purchases above defined thresholds (as per policy)?',
      },
      {
        ref: 'Q3.13',
        text: 'Are RFQ/RFP responses evaluated using documented scoring or evaluation criteria?',
      },
      {
        ref: 'Q3.14',
        text: 'Are exceptions to competitive bidding documented, approved, and reported (e.g., single-source purchases)?',
      },
      {
        ref: 'Q3.15',
        text: 'Is there segregation between the requestor, evaluator, and approver in the sourcing process?',
      },
      {
        ref: 'Q3.16',
        text: 'Is the vendor performance periodically assessed based on criteria such as price competitiveness, delivery time, and quality?',
      },
      {
        ref: 'Q3.17',
        text: 'Are results of vendor performance evaluations used to influence future sourcing decisions or contract renewals?',
      },
      {
        ref: 'Q3.18',
        text: 'Is there a vendor risk classification system (e.g., critical/non-critical, high-value/low-value)?',
      },
      {
        ref: 'Q3.19',
        text: 'Is there a documented and enforced blacklisting, grey-listing, and white-listing process for vendors?',
      },
      {
        ref: 'Q3.20',
        text: 'Are key vendor dependencies assessed periodically to avoid over-reliance on a single supplier or market player?',
      },
    ],
  },
  {
    key: 'po',
    id: 4,
    short: 'PO Lifecycle',
    title: 'Purchase Order (PO) Lifecycle Management',
    questions: [
      {
        ref: 'Q4.1',
        text: 'Are Purchase Orders (POs) automatically generated in the SAP system from approved PRs without manual data entry?',
      },
      {
        ref: 'Q4.2',
        text: 'Is there a standard PO format approved by management and embedded in the SAP system?',
      },
      {
        ref: 'Q4.3',
        text: 'Are open POs reviewed regularly (e.g., weekly/monthly) for closure, aging, or renewal decisions?',
      },
      {
        ref: 'Q4.4',
        text: 'Are POs older than 30/60/90 days flagged and escalated for review/action by procurement or requestor?',
      },
      {
        ref: 'Q4.5',
        text: 'Are preventive controls in place to restrict PO splitting (to bypass approval thresholds), including system alerts or workflow restrictions?',
      },
      {
        ref: 'Q4.6',
        text: 'Is there an audit log maintained in the system for all PO amendments, capturing reason, date/time, and user ID?',
      },
      {
        ref: 'Q4.7',
        text: 'Are PO amendments allowed only with re-approval if key parameters (quantity, rate, item, vendor) are changed?',
      },
      {
        ref: 'Q4.8',
        text: 'Are there controls to restrict PO amendments after goods have been received or services completed?',
      },
      {
        ref: 'Q4.9',
        text: 'Are all POs linked to the corresponding PR and approved budget to ensure traceability?',
      },
      {
        ref: 'Q4.10',
        text: 'Is the authority matrix enforced in the system for PO approvals based on PO value and category?',
      },
      {
        ref: 'Q4.11',
        text: 'Are blanket or framework POs assigned with validity dates and consumption limits in the system?',
      },
      {
        ref: 'Q4.12',
        text: 'Is there segregation of duties between the requester, PO creator, and PO approver in the system?',
      },
      {
        ref: 'Q4.13',
        text: 'Are POs electronically sent to vendors and acknowledged (with date/time) for audit trail purposes?',
      },
      {
        ref: 'Q4.14',
        text: 'Are POs associated with standard terms & conditions (e.g., payment terms, penalties, delivery conditions)?',
      },
      {
        ref: 'Q4.15',
        text: 'Are any changes to PO price, delivery schedule, or scope backed by formal vendor correspondence or change orders?',
      },
      {
        ref: 'Q4.16',
        text: 'Is there a monitoring dashboard or report available for tracking: pending POs, overdue POs, and amended POs?',
      },
      {
        ref: 'Q4.17',
        text: 'Are system validations in place to prevent issuing a PO to blacklisted or blocked vendors?',
      },
      {
        ref: 'Q4.18',
        text: 'Are emergency or verbal POs logged, formally approved post-facto, and tracked for frequency and risk?',
      },
      {
        ref: 'Q4.19',
        text: 'Are purchase orders for recurring services reviewed periodically for correct billing against service timelines?',
      },
      {
        ref: 'Q4.20',
        text: 'Are contract-linked POs regularly reconciled with contract milestones or delivery schedules?',
      },
    ],
  },
  {
    key: 'grn',
    id: 5,
    short: 'Goods Receipt',
    title: 'Goods Receipt, Inspection, and Non-Conformance Handling',
    questions: [
      {
        ref: 'Q5.1',
        text: 'Are GRNs only issued after physical quantity and quality checks are conducted against the PO and delivery note?',
      },
      {
        ref: 'Q5.2',
        text: 'Is there a formal inspection checklist or acceptance criteria defined for each category of goods/services?',
      },
      {
        ref: 'Q5.3',
        text: 'Are GRN entries date-stamped and user-stamped in the system to ensure traceability?',
      },
      {
        ref: 'Q5.4',
        text: 'Are GRNs matched to item codes, batch numbers, or serial numbers where applicable (e.g., electronics, chemicals)?',
      },
      {
        ref: 'Q5.5',
        text: 'Is there a record maintained for all rejected goods, including reason codes and responsible vendor?',
      },
      {
        ref: 'Q5.6',
        text: 'Is there a standard procedure to escalate rejected deliveries to procurement and request replacements or credit notes?',
      },
      {
        ref: 'Q5.7',
        text: 'Are rejected items tagged, isolated, and physically stored separately to avoid accidental use or issuance?',
      },
      {
        ref: 'Q5.8',
        text: 'Is there a defined escalation and follow-up process for rejected deliveries, including vendor replacement or credit note issuance within specific timelines?',
      },
      {
        ref: 'Q5.9',
        text: 'Are delivery documents (e.g., delivery notes, waybills, customs papers) scanned and attached to the GRN in the system?',
      },
      {
        ref: 'Q5.10',
        text: 'Are partial deliveries recorded with the pending balance clearly tracked against the original PO?',
      },
      {
        ref: 'Q5.11',
        text: 'Are outstanding delivery balances followed up by procurement or stores within a defined number of days (e.g., 15/30)?',
      },
      {
        ref: 'Q5.12',
        text: 'Is there a tolerance level (e.g., ±5%) defined in the system for minor delivery variances, and is it monitored?',
      },
      {
        ref: 'Q5.13',
        text: 'Are services (e.g., consulting, maintenance) receipted via service entry sheets, and is approval enforced?',
      },
    ],
  },
  {
    key: 'valuation',
    id: 6,
    short: 'Inventory Valuation',
    title: 'Inventory Identification, Valuation & Tracking',
    questions: [
      {
        ref: 'Q6.1',
        text: 'Are all inventory items uniquely identified using standardized codes (e.g., item codes, SKUs), and are naming conventions consistent across all locations?',
      },
      {
        ref: 'Q6.2',
        text: 'Are item descriptions, units of measure (UOM), categories, and material types accurately maintained and periodically reviewed for duplicates or obsolete items?',
      },
      {
        ref: 'Q6.3',
        text: 'Is there a periodic review of the item master to remove or flag duplicate, inactive, or obsolete items?',
      },
      {
        ref: 'Q6.4',
        text: 'Are inactive, obsolete, or slow-moving items reviewed at least annually and reported to finance and management for necessary action (e.g., blocking, disposal)?',
      },
      {
        ref: 'Q6.5',
        text: 'Are expiry dates recorded and monitored for time-sensitive materials (e.g., chemicals, cements)?',
      },
      {
        ref: 'Q6.6',
        text: 'Are write-offs, adjustments, and inventory losses subject to approval and explanation from both Inventory and Finance?',
      },
      {
        ref: 'Q6.7',
        text: 'Are scrap and damaged items reviewed periodically for disposal or resale opportunities?',
      },
      {
        ref: 'Q6.8',
        text: 'Are stock adjustments (due to damage, counting errors, or transfers) logged with proper approval and audit trail?',
      },
      {
        ref: 'Q6.9',
        text: 'Are materials or items with negative stock reviewed and adjusted regularly to maintain inventory integrity?',
      },
      {
        ref: 'Q6.10',
        text: 'Is inventory turnover or days-on-hand tracked to identify overstock or underutilized items?',
      },
      {
        ref: 'Q6.11',
        text: 'Are physical count results reconciled with book stock and valuation differences explained before posting?',
      },
    ],
  },
  {
    key: 'movement',
    id: 7,
    short: 'Inventory Movement',
    title: 'Inventory Movement & Stock Reconciliation',
    questions: [
      {
        ref: 'Q7.1',
        text: 'Is every inventory receipt/issue recorded in the system with reference to a valid source (e.g., GRN, Issue Slip, Transfer Order)?',
      },
      {
        ref: 'Q7.2',
        text: 'Are internal stock transfers (between warehouses or departments) properly documented, system-recorded, approved, and confirmed by the receiving location?',
      },
      {
        ref: 'Q7.3',
        text: 'Are bin cards or digital equivalents (e.g., barcode/RFID-based inventory apps) updated in real-time to reflect actual stock?',
      },
      {
        ref: 'Q7.4',
        text: 'Are manual stock movement forms (if used) reconciled with system postings periodically?',
      },
      {
        ref: 'Q7.5',
        text: 'Are all material movements (issues, returns, transfers, adjustments) assigned appropriate movement types or reason codes in the system?',
      },
      {
        ref: 'Q7.6',
        text: 'Is access to post inventory movements in the system restricted to authorized warehouse personnel?',
      },
      {
        ref: 'Q7.7',
        text: 'Are stock movements auto-logged with user ID, date/time stamp, and reference document in the SAP system?',
      },
      {
        ref: 'Q7.8',
        text: 'Are scrap, damage, loss, or overage transactions properly documented and approved by inventory and finance teams?',
      },
      {
        ref: 'Q7.9',
        text: 'Is there a documented policy outlining acceptable thresholds for shrinkage, damage, and spoilage?',
      },
      {
        ref: 'Q7.10',
        text: 'Are cycle counts performed based on ABC classification or material criticality, and are full physical stock counts conducted at least annually?',
      },
      {
        ref: 'Q7.11',
        text: 'Are blind counts used in physical stock audits to prevent manipulation or bias?',
      },
      {
        ref: 'Q7.12',
        text: 'Are discrepancies between book stock and physical count analyzed for root cause (e.g., theft, misposting, breakage)?',
      },
      {
        ref: 'Q7.13',
        text: 'Are adjustment entries from physical counts authorized by management and tracked separately for audit purposes?',
      },
      {
        ref: 'Q7.14',
        text: 'Are stock levels (including safety stock) regularly reviewed to avoid overstocking or stockouts?',
      },
      {
        ref: 'Q7.15',
        text: 'Are blocked, reserved, or quarantined stocks tracked and separated physically and in the system?',
      },
      {
        ref: 'Q7.16',
        text: 'Are negative stock balances prevented by system controls or auto-flagged for resolution?',
      },
      {
        ref: 'Q7.17',
        text: 'Are system reports available and used to monitor daily stock movements, aging, and abnormal transaction patterns?',
      },
    ],
  },
];
