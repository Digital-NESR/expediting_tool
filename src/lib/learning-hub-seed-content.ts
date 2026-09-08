// One-time default content for the Learning Hub. Inserted by ensureLearningHubSchema()
// the first time the tables are empty (see src/app/actions/learning-hub.ts), there is no
// separate script to run, so the tool is populated the first time it connects to a fresh DB.
//
// The General Supply Chain track is intentionally NOT seeded here: its live content (video
// courses + quizzes) is fully DB/CMS-managed and has diverged from any code default, so keeping
// it out of SEED_TRACKS makes a "Reset to defaults" on it a safe no-op rather than wiping it.
// SAP and NESR Supply Chain remain light, seed-managed placeholders, expand them via the admin CMS.

export interface SeedLesson {
  title: string;
  body: string;
  videoUrl?: string;
  // Left unset by default, don't fabricate a duration for content we haven't actually timed.
  duration_minutes?: number;
}

export interface SeedModule {
  title: string;
  resourceLabel?: string;
  resourceUrl?: string;
  lessons: SeedLesson[];
}

export interface SeedCourse {
  title: string;
  description: string;
  status: 'draft' | 'published';
  modules: SeedModule[];
}

export interface SeedTrack {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  courses: SeedCourse[];
}

export const SEED_TRACKS: SeedTrack[] = [
  /* ───────────────────────────── SAP (real videos from the NESR SAP Training Hub) ── */
  {
    key: 'sap',
    name: 'SAP',
    description: 'Real SAP training videos from the NESR SAP Training Hub, organized by topic.',
    icon: 'layout-grid',
    color: '#1e6bb8',
    courses: [
      {
        title: 'SAP Training Videos',
        description: 'Video walkthroughs pulled from the NESR SAP Training Hub, covering Master Data, Procurement & Logistics, and Inventory. Only topics with an available video are included, see the Training Hub itself for the full manual/topic list.',
        status: 'published',
        modules: [
          {
            title: 'Master Data',
            resourceLabel: 'NESR SAP Training Hub',
            resourceUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/SitePages/Home.aspx',
            lessons: [
              {
                title: 'How to Extract a Report - T-code MKVZ',
                videoUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/_layouts/15/embed.aspx?UniqueId=1e3cb4a5-bb3b-4f6f-b6a9-cbdb2bf61354&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
                body: `Video walkthrough of running t-code MKVZ to extract this report.`,
              },
              {
                title: 'How to Extract a Report - T-code ZBP',
                videoUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/_layouts/15/embed.aspx?UniqueId=f4d90cd0-0536-4c4d-b8b0-35777170040b&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
                body: `Video walkthrough of running t-code ZBP to extract this report.`,
              },
            ],
          },
          {
            title: 'Procurement & Logistics',
            lessons: [
              {
                title: 'How to Create an Inventory PR',
                videoUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/_layouts/15/embed.aspx?UniqueId=eda439cc-1293-4d7f-86af-fab23f318eca&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
                body: `Video walkthrough of creating an inventory purchase requisition.`,
              },
              {
                title: 'How to Create a Consumables PR',
                videoUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/_layouts/15/embed.aspx?UniqueId=a4bb5963-b666-4652-b58f-a1556f328dcc&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
                body: `Video walkthrough of creating a consumables purchase requisition.`,
              },
              {
                title: 'How to Create a Services PR',
                videoUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/_layouts/15/embed.aspx?UniqueId=31750d8c-9601-4320-a04f-80eca811389b&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
                body: `Video walkthrough of creating a services purchase requisition.`,
              },
              {
                title: 'How to Create an Asset PR',
                videoUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/_layouts/15/embed.aspx?UniqueId=559f018f-6419-438f-914e-afb654542aa0&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
                body: `Video walkthrough of creating an asset purchase requisition.`,
              },
              {
                title: 'How to Create a Consumables PO',
                videoUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/_layouts/15/embed.aspx?UniqueId=8ecc5a34-ed97-4b29-93fc-8eebb0486b35&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
                body: `Video walkthrough of creating a consumables purchase order.`,
              },
              {
                title: 'How to Create an Inventory PO',
                videoUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/_layouts/15/embed.aspx?UniqueId=2b9b2b86-9481-4e77-af6d-92fda616dcf6&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
                body: `Video walkthrough of creating an inventory purchase order.`,
              },
              {
                title: 'How to Create a Services PO',
                videoUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/_layouts/15/embed.aspx?UniqueId=d802f689-682b-4d1a-bb8f-7c70b5960bfe&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
                body: `Video walkthrough of creating a services purchase order.`,
              },
              {
                title: 'How to Create an Asset PO',
                videoUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/_layouts/15/embed.aspx?UniqueId=566167e0-4ceb-4756-b022-46ac55bede9a&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
                body: `Video walkthrough of creating an asset purchase order.`,
              },
              {
                title: 'How to Create a Service Entry Sheet',
                videoUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/_layouts/15/embed.aspx?UniqueId=d29f500c-8cbf-40ab-8c32-972a2ad4d3d4&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
                body: `Video walkthrough of creating a service entry sheet.`,
              },
              {
                title: 'How to Change a Condition Vendor',
                videoUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/_layouts/15/embed.aspx?UniqueId=9ee59951-a059-4af1-80aa-60a9a86d3666&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
                body: `Video walkthrough of changing a condition vendor.`,
              },
              {
                title: 'How to Add Landed Cost for a Full Shipment',
                videoUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/_layouts/15/embed.aspx?UniqueId=54a04a52-c4e3-4f44-af72-572aa08ed091&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
                body: `Video walkthrough of adding landed cost for a full shipment.`,
              },
              {
                title: 'How to Run ME5A - PR Report',
                videoUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/_layouts/15/embed.aspx?UniqueId=e1339373-3c58-4e54-984c-840b8d43c1a5&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
                body: `Video walkthrough of running t-code ME5A to pull the PR report.`,
              },
              {
                title: 'How to Run ME2N - PO Itemized Report',
                videoUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/_layouts/15/embed.aspx?UniqueId=53b0d97d-1528-488d-83b1-9d2b7805535a&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
                body: `Video walkthrough of running t-code ME2N to pull the itemized PO report.`,
              },
              {
                title: 'How to Run ZCOND - PO Report (Header Level)',
                videoUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/_layouts/15/embed.aspx?UniqueId=841e95e6-6fe4-4835-97bf-5de2f7c6510f&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
                body: `Video walkthrough of running t-code ZCOND to pull the PO report at header level.`,
              },
              {
                title: 'Delegation Process Steps',
                videoUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/_layouts/15/embed.aspx?UniqueId=bbb453d3-80c3-4201-88e9-f972a7115f8c&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
                body: `Video walkthrough of the delegation process steps.`,
              },
            ],
          },
          {
            title: 'Inventory',
            lessons: [
              {
                title: 'How to Post GI on Cost Center - Movement Z01',
                videoUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/_layouts/15/embed.aspx?UniqueId=982a0aa6-7e43-43c5-ac2b-548fc83de55c&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
                body: `Video walkthrough of posting a goods issue on cost center, movement type Z01.`,
              },
              {
                title: 'How to Post GI on PM Order - Movement Z61',
                videoUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/_layouts/15/embed.aspx?UniqueId=e9ddf348-cb76-4aa4-a357-2afdb73efcf3&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
                body: `Video walkthrough of posting a goods issue on a PM order, movement type Z61.`,
              },
            ],
          },
        ],
      },
    ],
  },

  /* ───────────────────────────── NESR Supply Chain (placeholder, menu mirrors the NESR
     "Supply Chain Process Cycles & Systems" AS-IS -> TO BE diagram) ───────────────────────────── */
  {
    key: 'nesr_supply_chain',
    name: 'NESR Supply Chain',
    description: 'NESR’s end-to-end Source-to-Pay process cycle and the systems behind each step. Placeholder content, expand via the admin CMS.',
    icon: 'building-2',
    color: '#8a5a2b',
    courses: [
      {
        title: 'NESR Supply Chain: Source to Pay Process & Systems',
        description: 'Walks the NESR Source-to-Pay cycle (Source → Contract → Catalog → Demand → Procure → Deliver → Pay) plus the Logistics and Inventory lanes, and the system behind each step per the AS-IS → TO BE roadmap. Placeholder, expand each step via the admin CMS.',
        status: 'draft',
        modules: [
          {
            title: 'Overview',
            lessons: [
              {
                title: 'Course Introduction',
                videoUrl: 'https://url.us.m.mimecastprotect.com/s/vmLQCKrj6MCA2RlKivhXc5SPEK?domain=1drv.ms',
                body: `Placeholder lesson. This course walks through NESR's Source-to-Pay process cycle exactly as mapped in the current AS-IS → TO BE roadmap: Source → Contract → Catalog feeding into the main Demand → Procure → Deliver → Pay flow, with Logistics and Inventory as cross-cutting lanes. Each module below covers one stage of that cycle and the system that supports it today, noting where a step is still a manual, email-driven process, where it runs in core SAP, where a dedicated system is in limited use, and where a system is in phased deployment. Replace this lesson with a real walkthrough of the roadmap and how it is expected to evolve.`,
              },
            ],
          },
          {
            title: 'Source',
            lessons: [
              {
                title: 'RFP & Award - SAP Ariba Sourcing (P7)',
                body: `Placeholder lesson. This step is today a manual, email-driven process, moving toward SAP Ariba Sourcing (project P7) for RFP and award. Replace with a walkthrough of the current process and the target SAP Ariba Sourcing workflow.`,
              },
              {
                title: 'Supplier Onboarding - SAP Ariba SLP',
                body: `Placeholder lesson. Supplier onboarding runs through SAP Ariba SLP (Supplier Lifecycle & Performance). Replace with a walkthrough of onboarding a new supplier end-to-end in SAP Ariba SLP.`,
              },
            ],
          },
          {
            title: 'Contract',
            lessons: [
              {
                title: 'Contract Approval Workflow',
                body: `Placeholder lesson. This will cover NESR's contract approval workflow, who reviews and signs off at each stage before a contract is executed. Replace with the current approval workflow and sign-off matrix.`,
              },
              {
                title: 'Contracts Repository - Sirion (P1)',
                body: `Placeholder lesson. Today, populating the contracts repository is a manual, email-driven process feeding into Sirion (project P1), NESR's contract lifecycle management system. Replace with a walkthrough of finding and filing a contract in Sirion.`,
              },
            ],
          },
          {
            title: 'Catalog',
            lessons: [
              {
                title: 'Supplier Price & Lead-Time Records - Guided Buying (P4)',
                body: `Placeholder lesson. Supplier price and lead-time records are maintained in Guided Buying (project P4), currently in limited deployment. Replace with a walkthrough of looking up a catalog price/lead-time record and how coverage is expanding.`,
              },
            ],
          },
          {
            title: 'Demand',
            lessons: [
              {
                title: 'Planning & Demand Forecasting',
                body: `Placeholder lesson. This will cover how demand planning and forecasting feeds the rest of the cycle, including its link to Inventory (Stock Replenishment Planning). Replace with the current forecasting process and system of record.`,
              },
              {
                title: 'Demand Creation (SAP)',
                body: `Placeholder lesson. Demand creation runs in core SAP. Replace with a screen-by-screen walkthrough of creating a demand line in SAP.`,
              },
              {
                title: 'Demand PR Approval (SAP)',
                body: `Placeholder lesson. Purchase requisition approval for demand runs in core SAP. Replace with the current PR approval workflow and thresholds.`,
              },
            ],
          },
          {
            title: 'Procure',
            lessons: [
              {
                title: 'Supplier Assessment',
                body: `Placeholder lesson. Supplier assessment at the procure stage is today a manual, email-driven process. Replace with the current assessment checklist and criteria.`,
              },
              {
                title: 'Supplier PO Approval (SAP)',
                body: `Placeholder lesson. Supplier purchase order approval runs in core SAP. Replace with the current PO approval workflow and thresholds.`,
              },
            ],
          },
          {
            title: 'Deliver & Logistics',
            lessons: [
              {
                title: 'Supplier Acknowledgement',
                body: `Placeholder lesson. This will cover how supplier order acknowledgement is captured before delivery and tracking begin. Replace with the current process.`,
              },
              {
                title: 'Tracking & Update of Variations - shipwaves (P2)',
                body: `Placeholder lesson. Shipment tracking and updating delivery variations is today a manual, email-driven process feeding into shipwaves (project P2). Replace with a walkthrough of tracking a shipment in shipwaves.`,
              },
              {
                title: 'Expediting & Readiness - n8n (P5)',
                body: `Placeholder lesson. Expediting and delivery-readiness follow-ups are today a manual, email-driven process, automated via an n8n workflow (project P5) that feeds back into procurement. Replace with a walkthrough of what the n8n automation does and when to step in manually.`,
              },
              {
                title: 'Freight Forwarder Bid & Award - shipwaves',
                body: `Placeholder lesson. Freight forwarder bid and award is today a manual, email-driven process running through shipwaves. Replace with a walkthrough of running an FF bid in shipwaves.`,
              },
              {
                title: 'Delivery Acknowledgment (SAP)',
                body: `Placeholder lesson. Delivery acknowledgement is recorded in core SAP. Replace with a walkthrough of confirming delivery in SAP.`,
              },
            ],
          },
          {
            title: 'Inventory Management',
            lessons: [
              {
                title: 'Stock Replenishment Planning',
                body: `Placeholder lesson. This will cover how stock replenishment planning connects demand forecasting to physical inventory. Replace with the current planning process and cadence.`,
              },
              {
                title: 'Physical Counting',
                body: `Placeholder lesson. Physical counting is today a manual, email-driven process. Replace with the current cycle-count procedure and frequency.`,
              },
              {
                title: 'Goods Issue',
                body: `Placeholder lesson. Goods issue is today a manual, email-driven process. Replace with the current goods-issue procedure.`,
              },
              {
                title: 'Goods Receipt - Coda (P3)',
                body: `Placeholder lesson. Goods receipt is today a manual, email-driven process feeding into Coda (project P3). Replace with a walkthrough of recording a goods receipt in Coda.`,
              },
              {
                title: 'Inventory Digital Twin - Translytics (P6)',
                body: `Placeholder lesson. NESR's inventory digital twin, Translytics (project P6), is in phased deployment. Replace with a walkthrough of what the digital twin shows and which sites currently have it live.`,
              },
            ],
          },
          {
            title: 'Pay',
            lessons: [
              {
                title: 'Payment Request / Invoice - SAP Ariba Commerce Automation',
                body: `Placeholder lesson. Payment request and invoicing are moving to SAP Ariba Commerce Automation, currently in phased deployment. Replace with a walkthrough of submitting and tracking an invoice through Commerce Automation.`,
              },
              {
                title: 'Demand Supply Validation (3-Way Match, SAP)',
                body: `Placeholder lesson. Demand-supply validation (three-way match between PO, goods receipt, and invoice) runs in core SAP. Replace with a walkthrough of resolving a 3WM mismatch.`,
              },
              {
                title: 'Pay (SAP)',
                body: `Placeholder lesson. Final payment execution runs in core SAP. Replace with the current payment run schedule and how it connects to ProcureGuard for adhoc and advance payments.`,
              },
            ],
          },
        ],
      },
    ],
  },
];
