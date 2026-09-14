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
  /** Display name as it read when the record was raised — a snapshot, not a key. */
  country: string;
  /**
   * `sns_country.code` — the stable identity. Country names are editable
   * reference data, so every scope check and the Registry ID key off this.
   * Empty only for a legacy record whose country name no longer resolves.
   */
  countryCode: string;
  level: ScopeLevel;
  nodes: ScopeNode[];
  segments: string[];
  supplierId: string;
  supplierName: string;
  reason: string;
  justification: string;
  base: BaseStatus;
  spend: number;
  /** Registry ID — null until Level 2 sign-off publishes the record. */
  id: string | null;
  issue: string | null;
  expiry: string | null;
  requestor: string;
  history: HistoryEntry[];
}

export interface Draft {
  cls: Classification;
  /** Country display name. The server resolves it to a `sns_country.code` on save. */
  country: string;
  level: ScopeLevel;
  nodes: ScopeNode[];
  segments: string[];
  supplierId: string;
  supplierName: string;
  spend: string;
  reason: string;
  justification: string;
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
   * `sns_country.code` values the viewer may act in — codes, not names, so a
   * country rename cannot silently widen or break someone's scope. Empty means
   * unrestricted: admins, and read-only/leadership roles that see everything.
   */
  countryCodes: string[];
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
