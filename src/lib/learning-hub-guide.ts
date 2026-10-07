/**
 * "Who takes what" — the programme's own guidance about itself.
 *
 * A learner opening General Supply Chain sees three courses and no way to tell which of them is
 * theirs. The answer exists: a document that sets out each level's audience, what a learner can do
 * afterwards, and a role-by-role recommendation with the hours to put in a training plan. It was a
 * Word file nobody opened. This is that document as data, rendered beside the courses it describes.
 *
 * Deliberately not in the database. It is editorial about the programme rather than content inside
 * it — there is no CMS screen for it, nothing a learner does changes it, and tying it to rows would
 * mean a course rename could silently leave the guide describing a course that no longer exists.
 * The one join to the database is `courseTitle`, matched against `learning_courses.title`; a level
 * whose title stops matching loses its link and still renders, which is the failure mode to want.
 *
 * Where the source document and the content disagree, the content wins — it was renamed after the
 * document was written. Release names here are the module titles as they ship, not the working
 * names the document still uses ("R1 — Develop the Strategy" is now "Supply Chain Strategy").
 */

export type GuideLevelKey = 'L1' | 'L2' | 'L3';

export interface GuideRelease {
  /** The module title as it ships, which is also how the course outline labels it. */
  title: string;
  audience: string;
  videos: number;
  videoMinutes: number;
  learnerMinutes: number;
}

export interface GuideLevel {
  key: GuideLevelKey;
  /** "Level 1 — Foundation". The level's name, not the course's. */
  label: string;
  /** Matched against `learning_courses.title` to link the card to the real course. */
  courseTitle: string;
  audience: string;
  prerequisite: string | null;
  videos: number;
  videoMinutes: number;
  learnerMinutes: number;
  /** One line of plain advice about the level, shown under the audience. */
  note?: string;
  /** "What a learner can do afterwards" — the reason to take it, in their words. */
  outcomes: string[];
  releases: GuideRelease[];
}

export interface GuideRole {
  /**
   * Stable slug, stored against the learner.
   *
   * Separate from `role` because the label is editorial and will be reworded; the key is what a
   * saved choice points at, and rewording a label must not silently un-curate everybody.
   */
  key: string;
  role: string;
  /** Whole level when `releases` is absent; otherwise only those module titles of it. */
  takes: { level: GuideLevelKey; releases?: string[] }[];
  /** Learner hours including the worksheet exercises — the figure for a training plan. */
  hours: number;
  why: string;
}

export interface TrackGuide {
  trackKey: string;
  heading: string;
  intro: string;
  levels: GuideLevel[];
  roles: GuideRole[];
  totals: { videos: number; videoHours: number; learnerHours: number };
}

const SUPPLY_CHAIN: TrackGuide = {
  trackKey: 'supply_chain',
  heading: 'Where to start',
  intro:
    'Three levels, eight releases. Almost nobody takes all of it — find your role below and it will tell you which parts are yours and roughly what they cost you in time.',
  totals: { videos: 103, videoHours: 20.1, learnerHours: 28.0 },

  levels: [
    {
      key: 'L1',
      label: 'Level 1 — Foundation',
      courseTitle: 'Supply Chain Fundamentals',
      audience: 'Everyone who touches the supply chain. No prerequisite.',
      prerequisite: null,
      videos: 11,
      videoMinutes: 123,
      learnerMinutes: 171,
      note: 'Under three hours including the exercises, and it gives everyone the same vocabulary — which is most of what stops the arguments between functions.',
      outcomes: [
        'Name the processes every supply chain performs',
        "Explain why a service business still carries inventory, and where NESR's sits",
        'Read a lead time and say what it does to working capital',
        'Judge whether an order was perfect against the four conditions, rather than by opinion',
        'Follow a conversation about forecasts, master schedules and safety stock without needing the terms explained',
        'Say where their own job sits in the chain, and who is downstream of them',
      ],
      releases: [],
    },
    {
      key: 'L2',
      label: 'Level 2 — Practitioner',
      courseTitle: 'Supply Chain Professional',
      audience:
        'People who own a planning, buying or logistics process — the ones who produce a number that somebody else acts on. This is the level with the arithmetic they will actually use.',
      prerequisite: 'Level 1 first',
      videos: 36,
      videoMinutes: 311,
      learnerMinutes: 556,
      note: 'Most people need one or two of the three releases, not all three. A buyer needs the sourcing one. A planner needs the first two. Only someone who covers the whole cycle needs all three.',
      outcomes: [
        'Produce a forecast, state its error in MAD, MAPE and MSE, and say which figure is the right one to quote in which conversation',
        'Explode a bill of material through MRP and defend the planned order dates that come out',
        'Calculate an economic order quantity and a safety stock level, and explain why the answer is often overridden in practice and when that is legitimate',
        'Build a total cost of ownership case that survives a challenge from both procurement and finance',
        'Choose a transport mode and a carrier on cost, transit time and risk rather than on habit',
        'Recognise when a master schedule is lying to them, and say why',
      ],
      releases: [
        {
          title: 'Demand Management & Forecasting',
          audience:
            'Demand planners, S&OP participants, sales-facing planners, anyone who produces or challenges a forecast',
          videos: 12,
          videoMinutes: 122,
          learnerMinutes: 202,
        },
        {
          title: 'Supply Planning & Inventory Control',
          audience:
            'Master schedulers, MRP and ERP users, inventory analysts, production and maintenance planners',
          videos: 12,
          videoMinutes: 105,
          learnerMinutes: 187,
        },
        {
          title: 'Supply, Logistics & Trade',
          audience:
            'Buyers and category specialists, logistics and freight coordinators, warehouse supervisors, trade compliance',
          videos: 12,
          videoMinutes: 84,
          learnerMinutes: 167,
        },
      ],
    },
    {
      key: 'L3',
      label: 'Level 3 — Advanced',
      courseTitle: 'Supply Chain Expert',
      audience:
        'Managers who design or decide, and anyone working towards certification.',
      prerequisite: 'Level 1 and the relevant Level 2 releases first',
      videos: 56,
      videoMinutes: 772,
      learnerMinutes: 952,
      note: 'Best taken in release order, so the strategy, the design, the technology and the measurement read as one argument. A specialist who needs only one release can still take it on its own.',
      outcomes: [
        'Trace a supply chain decision through the income statement, the balance sheet and the cash flow statement, and say which one the decision actually shows up in',
        'Build an NPV and discounted payback case for a technology or network change, and know what the case is sensitive to',
        'Run a project through critical path, crashing and earned value, and say what each of those tells you that the others do not',
        'Design a metric set that will not backfire, and explain how any given metric can be gamed, including the ones they proposed',
        'Explain the common process language a chain is described in, and its five performance attributes',
        'Choose between lean, six sigma, total quality management and theory of constraints for a specific problem, rather than applying whichever one is fashionable',
        'Lead a change that survives contact with the organisation',
      ],
      releases: [
        {
          title: 'Supply Chain Strategy',
          audience:
            'Supply chain and procurement managers, country and regional leads, finance business partners',
          videos: 14,
          videoMinutes: 196,
          learnerMinutes: 256,
        },
        {
          title: 'Supply Chain and Product Design',
          audience:
            'Network and design owners, engineering and product interfaces, anyone building a business case',
          videos: 13,
          videoMinutes: 158,
          learnerMinutes: 198,
        },
        {
          title: 'Systems, Communication and Projects',
          audience:
            'ERP and systems project leads, digital and data owners, project managers running supply chain change',
          videos: 14,
          videoMinutes: 179,
          learnerMinutes: 219,
        },
        {
          title: 'Metrics, Improvement and Change',
          audience:
            'Anyone who owns a KPI or a dashboard, continuous improvement and quality leads, operations managers',
          videos: 15,
          videoMinutes: 239,
          learnerMinutes: 279,
        },
      ],
    },
  ],

  /* Ordered by how much of the programme the role takes, so the cheapest commitments read first.
     Learner hours include the worksheet exercises, which is why they exceed the video time. */
  roles: [
    {
      key: 'new-hire',
      role: 'New hire, any function',
      takes: [{ level: 'L1' }],
      hours: 2.9,
      why: 'Onboarding — this one is meant to be mandatory.',
    },
    {
      key: 'warehouse',
      role: 'Warehouse, yard and materials',
      takes: [{ level: 'L1' }],
      hours: 2.9,
      why: 'The vocabulary, and where your work sits in the chain.',
    },
    {
      key: 'field-ops',
      role: 'Field engineer or operations supervisor',
      takes: [{ level: 'L1' }],
      hours: 2.9,
      why: 'You create supply chain work without seeing it.',
    },
    {
      key: 'buyer',
      role: 'Buyer or category specialist',
      takes: [{ level: 'L1' }, { level: 'L2', releases: ['Supply, Logistics & Trade'] }],
      hours: 5.6,
      why: 'Total cost of ownership, make versus buy, supplier relationships and trade.',
    },
    {
      key: 'logistics',
      role: 'Logistics or freight coordinator',
      takes: [{ level: 'L1' }, { level: 'L2', releases: ['Supply, Logistics & Trade'] }],
      hours: 5.6,
      why: 'Modes, carriers, warehousing and customs.',
    },
    {
      key: 'trade-compliance',
      role: 'Trade and customs compliance',
      takes: [{ level: 'L1' }, { level: 'L2', releases: ['Supply, Logistics & Trade'] }],
      hours: 5.6,
      why: 'The monetary, regulatory and trade material is what you are here for.',
    },
    {
      key: 'inventory-analyst',
      role: 'Inventory analyst',
      takes: [{ level: 'L1' }, { level: 'L2', releases: ['Supply Planning & Inventory Control'] }],
      hours: 6.0,
      why: 'EOQ, safety stock, and how inventory shows up in the accounts.',
    },
    {
      key: 'master-scheduler',
      role: 'Master scheduler or MRP user',
      takes: [{ level: 'L1' }, { level: 'L2', releases: ['Supply Planning & Inventory Control'] }],
      hours: 6.0,
      why: 'Master scheduling, MRP and capacity. Add the forecasting release if you own the forecast too.',
    },
    {
      key: 'erp-lead',
      role: 'ERP or systems project lead',
      takes: [{ level: 'L1' }, { level: 'L3', releases: ['Systems, Communication and Projects'] }],
      hours: 6.5,
      why: 'The systems landscape, plus project management.',
    },
    {
      key: 'ci-quality',
      role: 'Continuous improvement or quality lead',
      takes: [{ level: 'L1' }, { level: 'L3', releases: ['Metrics, Improvement and Change'] }],
      hours: 7.5,
      why: 'Metrics, lean, six sigma, total quality management and theory of constraints.',
    },
    {
      key: 'demand-planner',
      role: 'Demand planner',
      takes: [
        { level: 'L1' },
        {
          level: 'L2',
          releases: ['Demand Management & Forecasting', 'Supply Planning & Inventory Control'],
        },
      ],
      hours: 9.3,
      why: 'Forecasting and error measurement, then what the forecast actually drives.',
    },
    {
      key: 'sc-manager',
      role: 'Supply chain or procurement manager',
      takes: [{ level: 'L1' }, { level: 'L2' }, { level: 'L3' }],
      hours: 28.0,
      why: 'All eight releases — you are accountable across every one of them.',
    },
  ],
};

const GUIDES: TrackGuide[] = [SUPPLY_CHAIN];

/** A role by its stored key. Null when a saved choice names a role the guide no longer has. */
export function roleByKey(guide: TrackGuide, key: string | null | undefined): GuideRole | null {
  if (!key) return null;
  return guide.roles.find((r) => r.key === key) ?? null;
}

/**
 * What a chosen role means for one course, by the course's own title.
 *
 * The courses come from the database and the path from the guide, and the only thing joining them
 * is the title. A course the guide does not describe is reported as outside the path rather than
 * guessed at, so a new course appears as "beyond your role" instead of silently recommended.
 */
export function courseInPath(
  guide: TrackGuide,
  role: GuideRole | null,
  courseTitle: string,
): { level: GuideLevel | null; included: boolean; releases: string[] | null } {
  const level = guide.levels.find((l) => l.courseTitle === courseTitle) ?? null;
  if (!level || !role) return { level, included: false, releases: null };
  const hit = levelInPath(role, level.key);
  return hit.included
    ? { level, included: true, releases: hit.releases }
    : { level, included: false, releases: null };
}

/** The guide for a module, or null for one that has none — which is most of them. */
export function guideForTrack(trackKey: string): TrackGuide | null {
  return GUIDES.find((g) => g.trackKey === trackKey) ?? null;
}

/** "2 h 51 m", or "51 m" under the hour. Minutes are how the source document counts. */
export function formatLearnerTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} m` : `${m} m`;
}

/**
 * What one role's path means for one level: the whole thing, named releases, or nothing.
 *
 * Returned rather than computed in the view because the "whole level" case has no release list to
 * render and has to be distinguishable from "not part of this path", which also has none.
 */
export function levelInPath(
  role: GuideRole,
  level: GuideLevelKey,
): { included: false } | { included: true; releases: string[] | null } {
  const hit = role.takes.find((t) => t.level === level);
  if (!hit) return { included: false };
  return { included: true, releases: hit.releases ?? null };
}
