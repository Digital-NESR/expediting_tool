/* ─── Tool launcher configuration ────────────────────────────────
   One entry per card on the home launcher. The ten cards used to be ten
   near-identical copies of the same markup; everything that actually
   differs between them lives here as data, and `ToolCard` renders it.

   Tailwind cannot build class names at runtime, so per-accent hover
   classes are spelled out as literals below. */

import type { CSSProperties, ReactNode } from 'react';
import {
  PoExpeditingMark,
  ProcureGuardMark,
  RfxOfficerMark,
  ShipWavesMark,
  TiteMark,
} from '@/components/ToolMarks';
import {
  Laptop,
  Building2,
  GraduationCap,
  ListTree,
  Receipt,
  ShieldCheck,
  BarChart3,
} from 'lucide-react';

export type ToolStatus = 'new' | 'pending' | 'approved' | 'denied' | 'revoked' | 'rejected';

/** Tools whose request step is the launcher's own access-request modal. */
export type ModalTool = 'po_expediting' | 'tite' | 'sourceguide';

/** Tools whose card reflects a per-user access request published on the session. */
export type StatusTool = ModalTool | 'sns_registry';

export type ToolAccess =
  /** Open to every signed-in user (the tool's own layout enforces anything stricter). */
  | { kind: 'always' }
  /** Access-request driven: open / pending / denied / request via the shared modal. */
  | { kind: 'status'; tool: ModalTool; requestPage?: undefined }
  /* Same gate, but the request step is a page of the tool's own. S&S Registry
     asks for a role, a country list and a justification — more than the shared
     modal collects — so the launcher links to that page instead of rebuilding it. */
  | { kind: 'status'; tool: StatusTool; requestPage: string }
  /** Greyed "Coming Soon" card that admins can click into as a preview. */
  | { kind: 'adminPreview' };

export type ToolBadge =
  | { kind: 'status'; tool: StatusTool }
  | { kind: 'procureGuard' }
  /** Green tick badge with fixed copy. */
  | { kind: 'success'; label: string }
  /** Grey padlock badge (separate portal). */
  | { kind: 'lock'; label: string }
  /** Padlock for most people, "Full Access" for an administrator, who needs nobody's permission. */
  | { kind: 'adminOrLock'; label: string }
  /** Grey pill reading "Admin Preview" / "Coming Soon". */
  | { kind: 'preview' };

export interface ToolDef {
  id: string;
  /** Which of the two grids the card belongs to. */
  group: 'online' | 'development';
  /** Free-text haystack for the launcher search box. */
  keywords: string;
  name: string;
  subtitle?: ReactNode;
  /** Small pill rendered beside the title (Learning Hub's "Under Development"). */
  pill?: string;
  description: ReactNode;
  icon: ReactNode;
  /** Logo tile classes / inline background. */
  logoClass: string;
  logoStyle?: CSSProperties;
  /** Literal hover classes — Tailwind needs these spelled out. */
  hoverClass: string;
  /** Colour of the "Open →" action label. */
  accent: string;
  /** 'live' = full-colour card, 'preview' = greyed-out card. */
  tone: 'live' | 'preview';
  route: string;
  /** Route is on another domain: the card action is a real external link. */
  external?: boolean;
  /**
   * Not in the grid, but findable by searching for it.
   *
   * Spend Taxonomy lives in the sidebar rather than as a card, and somebody who types "commodity"
   * into the launcher search should still be told it exists rather than reading "no applications
   * match". It appears as an ordinary card for as long as the search matches it.
   */
  searchOnly?: boolean;
  helpHref?: string;
  access: ToolAccess;
  badge: ToolBadge;
  /** Defaults to "Open →". */
  openLabel?: string;
}

const HOVER_GREEN = 'hover:border-[#307c4c] hover:shadow-md hover:shadow-[#307c4c]/10';
const HOVER_TITE = 'hover:border-[#006B0C] hover:shadow-md hover:shadow-[#006B0C]/10';
const HOVER_SOURCE = 'hover:border-[#2A7E4F] hover:shadow-md hover:shadow-[#2A7E4F]/10';
const HOVER_SHIPWAVES = 'hover:border-[#3AAEAA] hover:shadow-md hover:shadow-[#3AAEAA]/10';

const NESR_GREEN = '#307c4c';
/** ShipWaves is its own product with its own teal, the way TI-TE keeps its own green. */
const SHIPWAVES_TEAL = '#3AAEAA';
const TITE_GREEN = '#006B0C';
const SOURCE_GREEN = '#2A7E4F';
/** text-gray-500 — the action label colour on greyed preview cards. */
const PREVIEW_GREY = '#6b7280';

export const TOOLS: ToolDef[] = [
  /* ── Available (launched) — alphabetical ── */

  {
    id: 'laptop-procurement',
    group: 'online',
    keywords: 'laptop procurement asset request device approvals',
    name: 'Laptop Procurement',
    subtitle: 'Device Requests & Approvals',
    description:
      'Raise laptop and device requests and route IT → Country Manager → IT Director → SC Director approvals.',
    icon: <Laptop className="w-6 h-6 text-[#307c4c]" />,
    logoClass: 'bg-[#307c4c]/10',
    hoverClass: HOVER_GREEN,
    accent: NESR_GREEN,
    tone: 'live',
    route: '/laptop-procurement',
    helpHref: '/help/laptop-procurement',
    access: { kind: 'always' },
    badge: { kind: 'success', label: 'Full Access' },
  },

  {
    id: 'po-expediting',
    group: 'online',
    keywords: 'po expediting purchase orders monitor expedite supplier delivery',
    name: 'PO Expediting',
    description:
      'Monitor open purchase orders, expedite delayed lines, and collect supplier delivery updates.',
    icon: <PoExpeditingMark className="h-6 w-6 text-[#307c4c]" />,
    logoClass: 'bg-[#307c4c]/10',
    hoverClass: HOVER_GREEN,
    accent: NESR_GREEN,
    tone: 'live',
    route: '/po-expediting',
    helpHref: '/help/po-expediting',
    access: { kind: 'status', tool: 'po_expediting' },
    badge: { kind: 'status', tool: 'po_expediting' },
  },

  {
    id: 'procure-guard',
    group: 'online',
    keywords: 'procureguard payment request approvals procurement',
    name: 'ProcureGuard',
    subtitle: 'Payment Request Approvals',
    description:
      'Submit adhoc PO and advance payment requests and route them through multi-stage approvals, keeping approvers and requesters notified at each step.',
    icon: <ProcureGuardMark className="h-6 w-6" />,
    logoClass: 'bg-white border border-[#307c4c]/15',
    hoverClass: HOVER_GREEN,
    accent: NESR_GREEN,
    tone: 'live',
    // Open-access: no gate, just open. The layout enforces sign-in. The badge reads Full Access
    // only for an ADMIN_EMAILS administrator; everyone else sees the role they actually hold.
    route: '/procure-guard',
    helpHref: '/help/procureguard',
    access: { kind: 'always' },
    badge: { kind: 'procureGuard' },
  },

  {
    id: 'rfx-officer',
    group: 'online',
    keywords: 'rfx officer rfx rfq rfp bidding tendering quotation award negotiation',
    name: 'RFx Officer',
    description:
      'AI-assisted RFQ lifecycle: create from PRs, auto-classify spend, get AI supplier suggestions, collect vendor quotes, compare with AI analysis, negotiate, and award.',
    icon: <RfxOfficerMark className="h-6 w-6" />,
    logoClass: 'bg-[#f0f9f4]',
    hoverClass: HOVER_GREEN,
    accent: NESR_GREEN,
    tone: 'live',
    // RFx Officer lives on its own domain, so the card action is a real link.
    route: 'https://rfxofficer.nesr.com',
    external: true,
    helpHref: '/help/rfx-officer',
    access: { kind: 'always' },
    badge: { kind: 'lock', label: 'Portal Access' },
  },

  {
    id: 'shipwaves',
    group: 'online',
    keywords:
      'shipwaves logistics shipments tracking freight movement country customs import export transport consignment',
    name: 'ShipWaves',
    subtitle: 'Logistics Movement Tracking',
    description:
      'Track every logistics movement across NESR: follow shipments by country and movement type, and see where a consignment has reached.',
    icon: <ShipWavesMark className="h-6 w-6" style={{ color: SHIPWAVES_TEAL }} />,
    logoClass: 'bg-[#3AAEAA]/10',
    hoverClass: HOVER_SHIPWAVES,
    accent: SHIPWAVES_TEAL,
    tone: 'live',
    // ShipWaves is its own application on its own domain, so the card action is a real link.
    route: 'https://app.shipwaves.com',
    external: true,
    access: { kind: 'always' },
    badge: { kind: 'lock', label: 'Portal Access' },
  },

  {
    id: 'spend-taxonomy',
    group: 'online',
    keywords:
      'spend taxonomy commodity category sub-category family classification catalogue what we buy purchase request code',
    name: 'Spend Taxonomy',
    subtitle: 'What NESR Buys',
    description:
      'Drill from Spend Type down to Commodity, or search any level, to find the line NESR buys against.',
    icon: <ListTree className="h-6 w-6 text-[#307c4c]" />,
    logoClass: 'bg-[#307c4c]/10',
    hoverClass: HOVER_GREEN,
    accent: NESR_GREEN,
    tone: 'live',
    route: '/spend-taxonomy',
    access: { kind: 'always' },
    badge: { kind: 'success', label: 'Full Access' },
    // Its home is the panel under SCAI; this entry exists so the search can find it.
    searchOnly: true,
  },

  {
    id: 'sns-registry',
    group: 'online',
    keywords: 's&s sns registry single sole source compliance single-quotation exception waiver',
    name: 'S&S Registry',
    subtitle: 'Single & Sole Source Compliance',
    description:
      'System of record for single-quotation compliance: register single and sole source cases, route them through two-level validation, and keep an audit trail against the 12-month expiry.',
    icon: <ShieldCheck className="w-6 h-6 text-[#307c4c]" />,
    logoClass: 'bg-[#307c4c]/10',
    hoverClass: HOVER_GREEN,
    accent: NESR_GREEN,
    tone: 'live',
    route: '/sns-registry',
    access: { kind: 'status', tool: 'sns_registry', requestPage: '/sns-registry/request-access' },
    badge: { kind: 'status', tool: 'sns_registry' },
  },

  {
    id: 'sourceguide',
    group: 'online',
    keywords: 'sourceguide sourcing intelligence suppliers commodity',
    name: 'SourceGuide',
    subtitle: 'Sourcing Intelligence',
    description: (
      <>
        Search NESR&apos;s preferred and backup suppliers across the full commodity taxonomy and
        every country guide.
      </>
    ),
    icon: <Building2 className="h-6 w-6" style={{ color: SOURCE_GREEN }} />,
    logoClass: '',
    logoStyle: { background: '#2A7E4F18' },
    hoverClass: HOVER_SOURCE,
    accent: SOURCE_GREEN,
    tone: 'live',
    route: '/sourceguide',
    access: { kind: 'status', tool: 'sourceguide' },
    badge: { kind: 'status', tool: 'sourceguide' },
  },

  {
    id: 'tite',
    group: 'online',
    keywords: 'ti-te tite temporary import export customs shipments',
    name: 'TI-TE',
    subtitle: 'Temporary Import / Export',
    description:
      'Track temporary import and export shipments, manage customs deadlines, deposits, and re-export compliance.',
    icon: <TiteMark className="h-6 w-6" style={{ color: TITE_GREEN }} />,
    logoClass: '',
    logoStyle: { background: '#006B0C18' },
    hoverClass: HOVER_TITE,
    accent: TITE_GREEN,
    tone: 'live',
    route: '/ti-te',
    helpHref: '/help/tite',
    access: { kind: 'status', tool: 'tite' },
    badge: { kind: 'status', tool: 'tite' },
  },

  /* ── Coming Soon / under development — alphabetical ── */

  {
    id: 'catalog-manager',
    group: 'development',
    keywords: 'catalog manager supplier service indirect item rates price catalog spend',
    name: 'Catalog Repo',
    subtitle: <>Supplier Service &amp; Indirect Item Rates</>,
    description:
      'Maintain country-segmented supplier price catalogs, route rate approvals, and keep an audit-ready record of agreed prices.',
    icon: (
      <svg
        className="h-6 w-6 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.75}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
    logoClass: 'bg-gray-100',
    hoverClass: HOVER_SOURCE,
    accent: PREVIEW_GREY,
    tone: 'preview',
    route: '/catalog-manager',
    access: { kind: 'adminPreview' },
    badge: { kind: 'preview' },
    openLabel: 'Open preview →',
  },

  {
    id: 'learning-hub',
    group: 'online',
    keywords: 'learning hub training courses sap supply chain academy lms',
    name: 'Learning Hub',
    subtitle: <>SAP, Supply Chain &amp; NESR Training</>,
    description:
      'Self-paced courses across three tracks: SAP, general Supply Chain fundamentals, and NESR-specific supply chain practice.',
    icon: <GraduationCap className="h-6 w-6 text-[#307c4c]" />,
    logoClass: 'bg-[#307c4c]/10',
    hoverClass: HOVER_GREEN,
    accent: NESR_GREEN,
    tone: 'live',
    // Learning Hub is open to everyone signed in - no access request.
    route: '/learning-hub',
    access: { kind: 'always' },
    badge: { kind: 'success', label: 'Open Access' },
  },

  {
    id: 'soa-consolidation',
    group: 'online',
    keywords:
      'soa consolidation statement of account reconciliation vendor balance confirmation finance champion corporate rollup',
    name: 'SOA Consolidation',
    subtitle: 'Vendor Statement Reconciliation',
    description:
      'Coordinate country finance champions through vendor outreach, SOA collection, and consolidated handoff to corporate finance for quarterly account reconciliation.',
    icon: <Receipt className="h-6 w-6 text-[#307c4c]" />,
    logoClass: 'bg-[#307c4c]/10',
    hoverClass: HOVER_GREEN,
    accent: NESR_GREEN,
    tone: 'live',
    route: '/soa-consolidation',
    /* `always` rather than `adminPreview`: the tool has a real access-request flow, and the
       gate in its own layout does the enforcing — anyone without a grant is shown the request
       page. An adminPreview card would be inert for everyone else, so an approved champion
       would pass the tool's gate and still have no way in short of typing the URL. */
    access: { kind: 'always' },
    badge: { kind: 'adminOrLock', label: 'Access Required' },
    openLabel: 'Open →',
  },

  {
    id: 'supply-chain-analytics',
    group: 'development',
    keywords:
      'supply chain analytics power bi dashboards sourcing procurement logistics inventory materials management',
    name: 'Supply Chain Analytics',
    subtitle: 'Power BI Dashboards',
    description:
      'Repository of all Supply Chain Power BI dashboards covering sourcing, procurement, logistics, inventory, and materials management.',
    icon: <BarChart3 className="w-6 h-6 text-gray-400" />,
    logoClass: 'bg-gray-100',
    hoverClass: HOVER_GREEN,
    accent: PREVIEW_GREY,
    tone: 'preview',
    route: '/supply-chain-analytics',
    access: { kind: 'adminPreview' },
    badge: { kind: 'preview' },
    openLabel: 'Open preview →',
  },
];
