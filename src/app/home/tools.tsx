/* ─── Tool launcher configuration ────────────────────────────────
   One entry per card on the home launcher. The ten cards used to be ten
   near-identical copies of the same markup; everything that actually
   differs between them lives here as data, and `ToolCard` renders it.

   Tailwind cannot build class names at runtime, so per-accent hover
   classes are spelled out as literals below. */

import type { CSSProperties, ReactNode } from 'react';
import {
  Laptop,
  Gavel,
  Building2,
  GraduationCap,
  Receipt,
  ShieldCheck,
  BarChart3,
} from 'lucide-react';

export type ToolStatus = 'new' | 'pending' | 'approved' | 'denied' | 'revoked' | 'rejected';

/** Tools whose card reflects a per-user access request. */
export type StatusTool = 'po_expediting' | 'tite' | 'sourceguide';

export type ToolAccess =
  /** Open to every signed-in user (the tool's own layout enforces anything stricter). */
  | { kind: 'always' }
  /** Access-request driven: open / pending / denied / request. */
  | { kind: 'status'; tool: StatusTool }
  /** Greyed "Coming Soon" card that admins can click into as a preview. */
  | { kind: 'adminPreview' };

export type ToolBadge =
  | { kind: 'status'; tool: StatusTool }
  | { kind: 'procureGuard' }
  /** Green tick badge with fixed copy. */
  | { kind: 'success'; label: string }
  /** Grey padlock badge (separate portal). */
  | { kind: 'lock'; label: string }
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
  helpHref?: string;
  access: ToolAccess;
  badge: ToolBadge;
  /** Defaults to "Open →". */
  openLabel?: string;
}

const HOVER_GREEN = 'hover:border-[#307c4c] hover:shadow-md hover:shadow-[#307c4c]/10';
const HOVER_TITE = 'hover:border-[#006B0C] hover:shadow-md hover:shadow-[#006B0C]/10';
const HOVER_SOURCE = 'hover:border-[#2A7E4F] hover:shadow-md hover:shadow-[#2A7E4F]/10';

const NESR_GREEN = '#307c4c';
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
    icon: (
      <svg
        className="w-6 h-6 text-[#307c4c]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.75}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V11"
        />
      </svg>
    ),
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
    icon: (
      <svg
        className="w-6 h-6 text-[#307c4c]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.75}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
        />
      </svg>
    ),
    logoClass: 'bg-[#307c4c]/10',
    hoverClass: HOVER_GREEN,
    accent: NESR_GREEN,
    tone: 'live',
    // Open-access: no gate, just open. The layout enforces sign-in.
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
    icon: <Gavel className="w-6 h-6 text-[#307c4c]" />,
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
    icon: (
      <svg
        className="w-6 h-6"
        style={{ color: TITE_GREEN }}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.75}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
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
    group: 'development',
    keywords: 'learning hub training courses sap supply chain academy lms',
    name: 'Learning Hub',
    pill: 'Under Development',
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
    id: 'sns-registry',
    group: 'development',
    keywords: 's&s sns registry single sole source compliance single-quotation exception waiver',
    name: 'S&S Registry',
    subtitle: 'Single & Sole Source Compliance',
    description:
      'System of record for single-quotation compliance: register single and sole source cases, route them through two-level validation, and keep an audit trail against the 12-month expiry.',
    icon: <ShieldCheck className="w-6 h-6 text-gray-400" />,
    logoClass: 'bg-gray-100',
    hoverClass: HOVER_GREEN,
    accent: PREVIEW_GREY,
    tone: 'preview',
    route: '/sns-registry',
    access: { kind: 'adminPreview' },
    badge: { kind: 'preview' },
    openLabel: 'Open preview →',
  },

  {
    id: 'soa-consolidation',
    group: 'development',
    keywords:
      'soa consolidation statement of account reconciliation vendor balance confirmation finance champion corporate rollup',
    name: 'SOA Consolidation',
    subtitle: 'Vendor Statement Reconciliation',
    description:
      'Coordinate country finance champions through vendor outreach, SOA collection, and consolidated handoff to corporate finance for quarterly account reconciliation.',
    icon: <Receipt className="w-6 h-6 text-gray-400" />,
    logoClass: 'bg-gray-100',
    hoverClass: HOVER_GREEN,
    accent: PREVIEW_GREY,
    tone: 'preview',
    route: '/soa-consolidation',
    access: { kind: 'adminPreview' },
    badge: { kind: 'preview' },
    openLabel: 'Open preview →',
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
