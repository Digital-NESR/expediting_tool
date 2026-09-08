/* ─────────────────────────────────────────────────────────────
   Admin navigation config — the single source of truth for the
   /admin area. Both the server layout and the client sidebar read
   from this, and the dynamic /admin/[app] route validates against
   it. Pure data only (no server imports) so it is safe to import
   from client and server components alike.
   ───────────────────────────────────────────────────────────── */

export interface AdminSection {
  id: string;
  label: string;
  /** Key into the pending-count badge map (omit if the section has no badge). */
  countKey?: string;
}

export interface AdminApp {
  id: string;
  label: string;
  /** Accent colour for the active-item left border. */
  color: string;
  /** Background for the active item. */
  activeBg: string;
  /** Text colour for the active item. */
  activeColor: string;
  sections: AdminSection[];
}

export const ADMIN_APPS: AdminApp[] = [
  {
    id: 'po-expediting', label: 'PO Expediting',
    color: '#059669', activeBg: '#f0fdf4', activeColor: '#059669',
    sections: [
      { id: 'analytics', label: 'Analytics' },
      { id: 'access-approvals', label: 'Access Approvals', countKey: 'po' },
    ],
  },
  {
    id: 'tite', label: 'TI-TE',
    color: '#059669', activeBg: '#f0fdf4', activeColor: '#059669',
    sections: [
      { id: 'migration', label: 'Migration' },
      { id: 'default-notifiers', label: 'Default Notifiers' },
      { id: 'analytics', label: 'Analytics' },
      { id: 'access-approvals', label: 'Access Approvals', countKey: 'tite' },
    ],
  },
  {
    id: 'procureguard', label: 'ProcureGuard',
    color: '#059669', activeBg: '#f0fdf4', activeColor: '#059669',
    sections: [
      { id: 'admin', label: 'Admin Panel' },
      { id: 'analytics', label: 'Payment Analytics' },
      { id: 'usage', label: 'Usage Analytics' },
      { id: 'access', label: 'Approval Access' },
    ],
  },
  {
    id: 'sourceguide', label: 'SourceGuide',
    color: '#2A7E4F', activeBg: '#eaf4ef', activeColor: '#1f5d3a',
    sections: [
      { id: 'guides', label: 'Source Guides' },
      { id: 'champions', label: 'Champions' },
      { id: 'analytics', label: 'Analytics' },
      { id: 'access', label: 'Access Approvals', countKey: 'sourceguide' },
    ],
  },
  {
    id: 'catalog', label: 'Catalog Repo',
    color: '#307c4c', activeBg: '#eaf4ef', activeColor: '#1d4f31',
    sections: [
      { id: 'admin', label: 'Admin Panel' },
      { id: 'sync', label: 'Sync Health' },
      { id: 'access', label: 'Access Approvals', countKey: 'catalog' },
    ],
  },
  {
    id: 'sns', label: 'S&S Registry',
    color: '#2A7E4F', activeBg: '#eaf4ef', activeColor: '#1d4f31',
    sections: [
      { id: 'access', label: 'Access Approvals', countKey: 'sns' },
      { id: 'reference', label: 'Reference Data' },
    ],
  },
  {
    id: 'laptop', label: 'Laptop Procurement',
    color: '#059669', activeBg: '#f0fdf4', activeColor: '#059669',
    sections: [
      { id: 'admin', label: 'Admin Panel' },
      { id: 'analytics', label: 'Analytics' },
      { id: 'access', label: 'Approval Access', countKey: 'laptop' },
    ],
  },
  {
    id: 'learning-hub', label: 'Learning Hub',
    color: '#059669', activeBg: '#f0fdf4', activeColor: '#059669',
    sections: [
      { id: 'admin', label: 'Content Admin' },
    ],
  },
];

/** Tools that are visible in the sidebar but not yet built. */
export const COMING_SOON = ['GRN & Invoice Reconciliation', 'Supply Chain Analytics'];

export const DEFAULT_APP = 'po-expediting';

export function findAdminApp(id: string | undefined): AdminApp | undefined {
  return ADMIN_APPS.find(a => a.id === id);
}

/** Resolve a section id for an app, falling back to its first section. */
export function resolveSection(app: AdminApp, sectionId: string | undefined): string {
  if (sectionId && app.sections.some(s => s.id === sectionId)) return sectionId;
  return app.sections[0].id;
}

/** Pending-count badge map, keyed by AdminSection.countKey. */
export type AdminCounts = Record<string, number>;

/* Legacy `/admin?tool=<id>` deep links → new `/admin/<app>?section=<section>`,
   so old bookmarks and notification-email links keep working. */
export const LEGACY_TOOL_MAP: Record<string, { app: string; section: string }> = {
  'po-expediting':                { app: 'po-expediting', section: 'analytics' },
  'access-approvals':             { app: 'po-expediting', section: 'access-approvals' },
  'tite-migration':               { app: 'tite', section: 'migration' },
  'tite-default-notifiers':       { app: 'tite', section: 'default-notifiers' },
  'tite-analytics':               { app: 'tite', section: 'analytics' },
  'tite-access-approvals':        { app: 'tite', section: 'access-approvals' },
  'procureguard-admin':           { app: 'procureguard', section: 'admin' },
  'procureguard-analytics':       { app: 'procureguard', section: 'analytics' },
  'procureguard-usage':           { app: 'procureguard', section: 'usage' },
  'procureguard-access':          { app: 'procureguard', section: 'access' },
  'sourceguide-guides':           { app: 'sourceguide', section: 'guides' },
  'sourceguide-champions':        { app: 'sourceguide', section: 'champions' },
  'sourceguide-analytics':        { app: 'sourceguide', section: 'analytics' },
  'sourceguide-access':           { app: 'sourceguide', section: 'access' },
  'catalog-admin':                { app: 'catalog', section: 'admin' },
  'catalog-sync':                 { app: 'catalog', section: 'sync' },
  'catalog-access':               { app: 'catalog', section: 'access' },
  'sns-access':                   { app: 'sns', section: 'access' },
  'sns-reference':                { app: 'sns', section: 'reference' },
  'laptop-procurement-admin':     { app: 'laptop', section: 'admin' },
  'laptop-procurement-analytics': { app: 'laptop', section: 'analytics' },
  'laptop-procurement-access':    { app: 'laptop', section: 'access' },
  'learning-hub-admin':           { app: 'learning-hub', section: 'admin' },
  'learning-hub-access':          { app: 'learning-hub', section: 'access' },
};
