-- The question bank moves from code into the database, so administrators can add, edit and
-- remove questions from the admin panel.
--
-- A question's `ref` (e.g. Q4.5) is its permanent id: answers are stored under it in
-- icsa_assessments.answers (as q4_5), so it is never changed or reused. New questions get the
-- next free number in their section. Removing a question or section archives it (active = false):
-- it disappears from forms, scoring and exports, while answers already given stay in the data.
-- A section's `key` is what icsa_assessments.sections lists, so it is permanent too.

CREATE TABLE IF NOT EXISTS icsa_sections (
  key         TEXT        PRIMARY KEY,
  -- The section number shown to people ("4. PO Lifecycle") and used in question refs (Q4.x).
  num         INTEGER     NOT NULL UNIQUE,
  short       TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  sort        INTEGER     NOT NULL,
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS icsa_questions (
  id           BIGSERIAL   PRIMARY KEY,
  section_key  TEXT        NOT NULL REFERENCES icsa_sections (key),
  ref          TEXT        NOT NULL UNIQUE,
  -- May contain {country}, replaced with the respondent's country on the form.
  text         TEXT        NOT NULL,
  sort         INTEGER     NOT NULL,
  active       BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS icsa_questions_section ON icsa_questions (section_key, sort);

-- The original bank, verbatim from the NESR ICSA Self-Assessment (src/lib/icsa/questions.ts).

INSERT INTO icsa_sections (key, num, short, title, sort) VALUES
  ('policy', 1, 'Policy Manual', 'Procurement & Inventory Policy Manual', 10),
  ('planning', 2, 'Planning and Requisition', 'Procurement Planning & Requisition Management', 20),
  ('sourcing', 3, 'Vendor and Sourcing', 'Vendor Master & Sourcing Controls', 30),
  ('po', 4, 'PO Lifecycle', 'Purchase Order (PO) Lifecycle Management', 40),
  ('grn', 5, 'Goods Receipt', 'Goods Receipt, Inspection, and Non-Conformance Handling', 50),
  ('valuation', 6, 'Inventory Valuation', 'Inventory Identification, Valuation & Tracking', 60),
  ('movement', 7, 'Inventory Movement', 'Inventory Movement & Stock Reconciliation', 70)
ON CONFLICT (key) DO NOTHING;

INSERT INTO icsa_questions (section_key, ref, text, sort) VALUES
  ('policy', 'Q1.1', 'Is the Procurement and Inventory Policy Manual up-to-date, and has it been reviewed within the last 12 months? (If yes, mention the review date in remarks)', 10),
  ('policy', 'Q1.2', 'Does the policy include country-specific scenarios and requirements relevant to {country}?', 20),
  ('policy', 'Q1.3', 'Has the policy been formally communicated and made accessible to all relevant staff through official channels (e.g., intranet, email)?', 30),
  ('policy', 'Q1.4', 'Have procurement and inventory staff, including new joiners, received orientation or training to ensure they understand the policy?', 40),
  ('policy', 'Q1.5', 'Are all deviations from the policy formally documented and approved by an appropriate authority level?', 50),
  ('planning', 'Q2.1', 'Is there an annual procurement plan reviewed and approved by senior management?', 10),
  ('planning', 'Q2.2', 'Is the procurement plan aligned with the annual budget and departmental needs?', 20),
  ('planning', 'Q2.3', 'Is the procurement plan reviewed periodically (e.g., quarterly) to accommodate business changes?', 30),
  ('planning', 'Q2.4', 'Are procurement activities regularly tracked against the plan to monitor compliance and identify deviations?', 40),
  ('planning', 'Q2.5', 'Are emergency and Non-PO procurements subject to clearly defined thresholds, post-facto approval, and periodic review for justification and misuse?', 50),
  ('planning', 'Q2.6', 'Are open PRs (pending PO conversion) periodically reviewed and cancelled if found to be obsolete, duplicate, or unnecessary?', 60),
  ('planning', 'Q2.7', 'Are PRs raised only after confirming that similar items are not already available in stock or under existing POs?', 70),
  ('planning', 'Q2.8', 'Are PRs linked to relevant cost centers, project codes, or departments for accountability purposes?', 80),
  ('planning', 'Q2.9', 'Are all PRs raised with valid business justification and supported by sufficient technical specifications or scope details?', 90),
  ('planning', 'Q2.10', 'Are PRs routed through budget owners or cost center heads for review and approval?', 100),
  ('planning', 'Q2.11', 'Is there system enforcement of maker-checker control during PR creation and approval (e.g., requester ≠ approver)?', 110),
  ('planning', 'Q2.12', 'Is there a workflow in the SAP system for multi-level PR approval based on value thresholds?', 120),
  ('planning', 'Q2.13', 'Are recurring or blanket PRs adequately controlled, reviewed for duplication, and aligned with the procurement plan?', 130),
  ('planning', 'Q2.14', 'Are PR-to-PO conversion timelines and overall lead time from requisition to PO issuance tracked and analyzed to address delays or bottlenecks?', 140),
  ('sourcing', 'Q3.1', 'Is there a centralized, up-to-date, and duplicate-free vendor master in the SAP?', 10),
  ('sourcing', 'Q3.2', 'Are vendor records reviewed periodically to deactivate dormant, duplicate, or unverified vendors?', 20),
  ('sourcing', 'Q3.3', 'Is there a documented SOP for creating, updating, and approving vendor master records, including defined roles and responsibilities?', 30),
  ('sourcing', 'Q3.4', 'Are vendor records properly classified (e.g., local/foreign, service/supply, critical/non-critical)?', 40),
  ('sourcing', 'Q3.5', 'Are vendor bank details changes subject to dual control (initiated by one user and approved by another)?', 50),
  ('sourcing', 'Q3.6', 'Is an audit trail/log maintained for all changes made to vendor master data, including timestamps and user IDs?', 60),
  ('sourcing', 'Q3.7', 'Are new vendors onboarded only after complete KYC checks, blacklist screenings, and conflict of interest declarations?', 70),
  ('sourcing', 'Q3.8', 'Are duplicate vendors automatically flagged by the system during onboarding (e.g., based on tax ID or IBAN)?', 80),
  ('sourcing', 'Q3.9', 'Is there a centralized and updated repository of vendor contracts, rate cards, and framework agreements?', 90),
  ('sourcing', 'Q3.10', 'Are key vendors linked to signed contracts, rate cards, or framework agreements?', 100),
  ('sourcing', 'Q3.11', 'Is there a contract renewal/expiry tracking mechanism with alerts for expiring agreements?', 110),
  ('sourcing', 'Q3.12', 'Are RFQs or RFPs mandatory for all purchases above defined thresholds (as per policy)?', 120),
  ('sourcing', 'Q3.13', 'Are RFQ/RFP responses evaluated using documented scoring or evaluation criteria?', 130),
  ('sourcing', 'Q3.14', 'Are exceptions to competitive bidding documented, approved, and reported (e.g., single-source purchases)?', 140),
  ('sourcing', 'Q3.15', 'Is there segregation between the requestor, evaluator, and approver in the sourcing process?', 150),
  ('sourcing', 'Q3.16', 'Is the vendor performance periodically assessed based on criteria such as price competitiveness, delivery time, and quality?', 160),
  ('sourcing', 'Q3.17', 'Are results of vendor performance evaluations used to influence future sourcing decisions or contract renewals?', 170),
  ('sourcing', 'Q3.18', 'Is there a vendor risk classification system (e.g., critical/non-critical, high-value/low-value)?', 180),
  ('sourcing', 'Q3.19', 'Is there a documented and enforced blacklisting, grey-listing, and white-listing process for vendors?', 190),
  ('sourcing', 'Q3.20', 'Are key vendor dependencies assessed periodically to avoid over-reliance on a single supplier or market player?', 200),
  ('po', 'Q4.1', 'Are Purchase Orders (POs) automatically generated in the SAP system from approved PRs without manual data entry?', 10),
  ('po', 'Q4.2', 'Is there a standard PO format approved by management and embedded in the SAP system?', 20),
  ('po', 'Q4.3', 'Are open POs reviewed regularly (e.g., weekly/monthly) for closure, aging, or renewal decisions?', 30),
  ('po', 'Q4.4', 'Are POs older than 30/60/90 days flagged and escalated for review/action by procurement or requestor?', 40),
  ('po', 'Q4.5', 'Are preventive controls in place to restrict PO splitting (to bypass approval thresholds), including system alerts or workflow restrictions?', 50),
  ('po', 'Q4.6', 'Is there an audit log maintained in the system for all PO amendments, capturing reason, date/time, and user ID?', 60),
  ('po', 'Q4.7', 'Are PO amendments allowed only with re-approval if key parameters (quantity, rate, item, vendor) are changed?', 70),
  ('po', 'Q4.8', 'Are there controls to restrict PO amendments after goods have been received or services completed?', 80),
  ('po', 'Q4.9', 'Are all POs linked to the corresponding PR and approved budget to ensure traceability?', 90),
  ('po', 'Q4.10', 'Is the authority matrix enforced in the system for PO approvals based on PO value and category?', 100),
  ('po', 'Q4.11', 'Are blanket or framework POs assigned with validity dates and consumption limits in the system?', 110),
  ('po', 'Q4.12', 'Is there segregation of duties between the requester, PO creator, and PO approver in the system?', 120),
  ('po', 'Q4.13', 'Are POs electronically sent to vendors and acknowledged (with date/time) for audit trail purposes?', 130),
  ('po', 'Q4.14', 'Are POs associated with standard terms & conditions (e.g., payment terms, penalties, delivery conditions)?', 140),
  ('po', 'Q4.15', 'Are any changes to PO price, delivery schedule, or scope backed by formal vendor correspondence or change orders?', 150),
  ('po', 'Q4.16', 'Is there a monitoring dashboard or report available for tracking: pending POs, overdue POs, and amended POs?', 160),
  ('po', 'Q4.17', 'Are system validations in place to prevent issuing a PO to blacklisted or blocked vendors?', 170),
  ('po', 'Q4.18', 'Are emergency or verbal POs logged, formally approved post-facto, and tracked for frequency and risk?', 180),
  ('po', 'Q4.19', 'Are purchase orders for recurring services reviewed periodically for correct billing against service timelines?', 190),
  ('po', 'Q4.20', 'Are contract-linked POs regularly reconciled with contract milestones or delivery schedules?', 200),
  ('grn', 'Q5.1', 'Are GRNs only issued after physical quantity and quality checks are conducted against the PO and delivery note?', 10),
  ('grn', 'Q5.2', 'Is there a formal inspection checklist or acceptance criteria defined for each category of goods/services?', 20),
  ('grn', 'Q5.3', 'Are GRN entries date-stamped and user-stamped in the system to ensure traceability?', 30),
  ('grn', 'Q5.4', 'Are GRNs matched to item codes, batch numbers, or serial numbers where applicable (e.g., electronics, chemicals)?', 40),
  ('grn', 'Q5.5', 'Is there a record maintained for all rejected goods, including reason codes and responsible vendor?', 50),
  ('grn', 'Q5.6', 'Is there a standard procedure to escalate rejected deliveries to procurement and request replacements or credit notes?', 60),
  ('grn', 'Q5.7', 'Are rejected items tagged, isolated, and physically stored separately to avoid accidental use or issuance?', 70),
  ('grn', 'Q5.8', 'Is there a defined escalation and follow-up process for rejected deliveries, including vendor replacement or credit note issuance within specific timelines?', 80),
  ('grn', 'Q5.9', 'Are delivery documents (e.g., delivery notes, waybills, customs papers) scanned and attached to the GRN in the system?', 90),
  ('grn', 'Q5.10', 'Are partial deliveries recorded with the pending balance clearly tracked against the original PO?', 100),
  ('grn', 'Q5.11', 'Are outstanding delivery balances followed up by procurement or stores within a defined number of days (e.g., 15/30)?', 110),
  ('grn', 'Q5.12', 'Is there a tolerance level (e.g., ±5%) defined in the system for minor delivery variances, and is it monitored?', 120),
  ('grn', 'Q5.13', 'Are services (e.g., consulting, maintenance) receipted via service entry sheets, and is approval enforced?', 130),
  ('valuation', 'Q6.1', 'Are all inventory items uniquely identified using standardized codes (e.g., item codes, SKUs), and are naming conventions consistent across all locations?', 10),
  ('valuation', 'Q6.2', 'Are item descriptions, units of measure (UOM), categories, and material types accurately maintained and periodically reviewed for duplicates or obsolete items?', 20),
  ('valuation', 'Q6.3', 'Is there a periodic review of the item master to remove or flag duplicate, inactive, or obsolete items?', 30),
  ('valuation', 'Q6.4', 'Are inactive, obsolete, or slow-moving items reviewed at least annually and reported to finance and management for necessary action (e.g., blocking, disposal)?', 40),
  ('valuation', 'Q6.5', 'Are expiry dates recorded and monitored for time-sensitive materials (e.g., chemicals, cements)?', 50),
  ('valuation', 'Q6.6', 'Are write-offs, adjustments, and inventory losses subject to approval and explanation from both Inventory and Finance?', 60),
  ('valuation', 'Q6.7', 'Are scrap and damaged items reviewed periodically for disposal or resale opportunities?', 70),
  ('valuation', 'Q6.8', 'Are stock adjustments (due to damage, counting errors, or transfers) logged with proper approval and audit trail?', 80),
  ('valuation', 'Q6.9', 'Are materials or items with negative stock reviewed and adjusted regularly to maintain inventory integrity?', 90),
  ('valuation', 'Q6.10', 'Is inventory turnover or days-on-hand tracked to identify overstock or underutilized items?', 100),
  ('valuation', 'Q6.11', 'Are physical count results reconciled with book stock and valuation differences explained before posting?', 110),
  ('movement', 'Q7.1', 'Is every inventory receipt/issue recorded in the system with reference to a valid source (e.g., GRN, Issue Slip, Transfer Order)?', 10),
  ('movement', 'Q7.2', 'Are internal stock transfers (between warehouses or departments) properly documented, system-recorded, approved, and confirmed by the receiving location?', 20),
  ('movement', 'Q7.3', 'Are bin cards or digital equivalents (e.g., barcode/RFID-based inventory apps) updated in real-time to reflect actual stock?', 30),
  ('movement', 'Q7.4', 'Are manual stock movement forms (if used) reconciled with system postings periodically?', 40),
  ('movement', 'Q7.5', 'Are all material movements (issues, returns, transfers, adjustments) assigned appropriate movement types or reason codes in the system?', 50),
  ('movement', 'Q7.6', 'Is access to post inventory movements in the system restricted to authorized warehouse personnel?', 60),
  ('movement', 'Q7.7', 'Are stock movements auto-logged with user ID, date/time stamp, and reference document in the SAP system?', 70),
  ('movement', 'Q7.8', 'Are scrap, damage, loss, or overage transactions properly documented and approved by inventory and finance teams?', 80),
  ('movement', 'Q7.9', 'Is there a documented policy outlining acceptable thresholds for shrinkage, damage, and spoilage?', 90),
  ('movement', 'Q7.10', 'Are cycle counts performed based on ABC classification or material criticality, and are full physical stock counts conducted at least annually?', 100),
  ('movement', 'Q7.11', 'Are blind counts used in physical stock audits to prevent manipulation or bias?', 110),
  ('movement', 'Q7.12', 'Are discrepancies between book stock and physical count analyzed for root cause (e.g., theft, misposting, breakage)?', 120),
  ('movement', 'Q7.13', 'Are adjustment entries from physical counts authorized by management and tracked separately for audit purposes?', 130),
  ('movement', 'Q7.14', 'Are stock levels (including safety stock) regularly reviewed to avoid overstocking or stockouts?', 140),
  ('movement', 'Q7.15', 'Are blocked, reserved, or quarantined stocks tracked and separated physically and in the system?', 150),
  ('movement', 'Q7.16', 'Are negative stock balances prevented by system controls or auto-flagged for resolution?', 160),
  ('movement', 'Q7.17', 'Are system reports available and used to monitor daily stock movements, aging, and abnormal transaction patterns?', 170)
ON CONFLICT (ref) DO NOTHING;
