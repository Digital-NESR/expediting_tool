/* ─── Supply Chain Analytics sections ────────────────────────────
   The four boards used to be tabs along the top of one page. Each now has a route of its own and
   a card on the /supply-chain-analytics directory, drawn the way the /home launcher draws a tool.

   Who sees what is unchanged from the tab strip: the travel board is open to everyone the layout
   lets in (a platform admin, or anyone holding a Travel Portal grant); the other three are
   platform admin only. `visibleSections` is the one place that rule is written, and every section
   page checks the same function, so a card that is not drawn is also a route that will not
   render. */

import type { ReactNode } from 'react';
import { BarChart3, Plane, Receipt, Target } from 'lucide-react';

export type SectionId = 'power-bi' | 'travel' | 'purchase-orders' | 'sourcing';

export interface SectionDef {
  id: SectionId;
  name: string;
  subtitle: string;
  description: string;
  icon: ReactNode;
  /** Platform admins only; otherwise anyone the layout admits. */
  adminOnly: boolean;
}

export const SECTIONS: SectionDef[] = [
  {
    id: 'power-bi',
    name: 'Supply Chain Health Board',
    subtitle: 'Power BI · 2026',
    description:
      'The Supply Chain Health Board Power BI report, embedded as published: sourcing, procurement, logistics and inventory KPIs.',
    icon: <BarChart3 className="h-6 w-6 text-[#307c4c]" />,
    adminOnly: true,
  },
  {
    id: 'travel',
    name: 'Travel Portal',
    subtitle: 'Live from the travel feed',
    description:
      'Travel spend, bookings and travellers by country, cost centre and channel, scoped to the countries you hold a grant for.',
    icon: <Plane className="h-6 w-6 text-[#307c4c]" />,
    adminOnly: false,
  },
  {
    id: 'purchase-orders',
    name: 'Purchase Orders',
    subtitle: 'SAP extract · refreshed daily',
    description:
      'The PO book from the SAP extract warehouse: spend over time and by dimension, plus the past-due board.',
    icon: <Receipt className="h-6 w-6 text-[#307c4c]" />,
    adminOnly: true,
  },
  {
    id: 'sourcing',
    name: 'Sourcing Opportunities',
    subtitle: 'Candidate projects from spend history',
    description:
      'Candidate sourcing projects identified from purchasing history, with the spend and supplier spread behind each one.',
    icon: <Target className="h-6 w-6 text-[#307c4c]" />,
    adminOnly: true,
  },
];

export function sectionHref(id: SectionId): string {
  return `/supply-chain-analytics/${id}`;
}

export function sectionById(id: SectionId): SectionDef {
  const section = SECTIONS.find((s) => s.id === id);
  if (!section) throw new Error(`Unknown analytics section: ${id}`);
  return section;
}

/** The sections this reader may open. The layout has already refused anyone with neither door. */
export function visibleSections(isPlatformAdmin: boolean): SectionDef[] {
  return SECTIONS.filter((s) => isPlatformAdmin || !s.adminOnly);
}
