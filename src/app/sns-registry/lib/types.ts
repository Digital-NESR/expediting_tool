export type SpendType = 'Direct' | 'Indirect';
export type Classification = 'SGL' | 'SOL';
export type ScopeLevel = 'Family' | 'Commodity';

export type BaseStatus =
  | 'Draft'
  | 'Pending Level 1'
  | 'Pending Level 2'
  | 'Active'
  | 'Extended'
  | 'Expired'
  | 'Rejected';

export type DisplayStatus = BaseStatus | 'Expiring soon';

export type RoleKind = 'req' | 'l1' | 'l2' | 'ro' | 'lead' | 'admin';

/* ─── Reference data (loaded from sns_registry_db) ─────────────── */

export interface TaxFamily {
  name: string;
  commodities: string[];
}

export interface TaxSub {
  name: string;
  families: TaxFamily[];
}

export interface TaxCategory {
  spendType: SpendType;
  name: string;
  subs: TaxSub[];
}

export type Country = [name: string, code: string];

/** Everything the New Record wizard needs to render its pickers. */
export interface ReferenceData {
  tax: TaxCategory[];
  countries: Country[];
  segments: string[];
  reasons: Record<Classification, string[]>;
}

/* ─── Records ──────────────────────────────────────────────────── */

export interface ScopeNode {
  cat: string;
  sub: string;
  fam: string;
  com: string;
}

export interface HistoryEntry {
  step: string;
  actor: string;
  date: string;
  note: string;
}

export interface RegistryRecord {
  /** Surrogate key (sns_record.rid). The human-facing ID is `id`, issued at Level 2. */
  rid: number;
  cls: Classification;
  country: string;
  level: ScopeLevel;
  nodes: ScopeNode[];
  segments: string[];
  supplierId: string;
  supplierName: string;
  reason: string;
  justification: string;
  base: BaseStatus;
  spend: number;
  poCount: number;
  evidence: string;
  /** Registry ID — null until Level 2 sign-off publishes the record. */
  id: string | null;
  issue: string | null;
  expiry: string | null;
  requestor: string;
  history: HistoryEntry[];
}

export interface Draft {
  cls: Classification;
  country: string;
  level: ScopeLevel;
  nodes: ScopeNode[];
  segments: string[];
  supplierId: string;
  supplierName: string;
  spend: string;
  reason: string;
  justification: string;
  evidence: string;
}

export type Screen = 'registry' | 'detail' | 'new' | 'inbox' | 'expiry' | 'dash';

/* ─── Access control ───────────────────────────────────────────── */

export type SnsRole =
  | 'Requestor — Sourcing / Procurement'
  | 'Validator L1 — Country Supply Chain Manager'
  | 'Validator L2 — Category Manager / SC Director'
  | 'Read-only — Procurement Officer / Auditor'
  | 'Supply Chain Leadership';

export type SnsAccessStatus = 'new' | 'pending' | 'approved' | 'rejected' | 'revoked';

/** The signed-in user's effective permissions, resolved server-side. */
export interface SnsViewer {
  email: string;
  name: string;
  /** Env-listed platform admins bypass the request queue entirely. */
  isAdmin: boolean;
  role: SnsRole | null;
  roleKind: RoleKind;
  /**
   * Countries the viewer may act in. Empty means unrestricted — which is the
   * case for admins, and for read-only/leadership roles that see everything.
   */
  countries: string[];
}

export interface SnsAccessRequestRow {
  userEmail: string;
  displayName: string | null;
  jobTitle: string | null;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Revoked';
  requestedRole: string;
  approvedRole: string | null;
  requestedCountries: string[];
  approvedCountries: string[];
  reason: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
}
