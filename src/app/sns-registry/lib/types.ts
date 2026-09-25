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
  | 'Rejected'
  /** Retired — the supplier account was closed. Stops the renewal reminders. */
  | 'Closed';

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
  /** How many times the record has survived a periodic review. */
  /**
   * Who validates this record, by name, resolved from the approver lists.
   * Null / empty when nobody is assigned yet — the screens say so rather than
   * naming a role with no person behind it.
   */
  level1Name: string | null;
  level2Names: string[];
  renewalCount: number;
  /**
   * The record this one was raised to replace, or null for a first-time
   * record. A periodic review raises a replacement rather than editing in
   * place, so this is what ties the generations of one arrangement together.
   */
  renewalOfRid: number | null;
  /** Set only once the record has been retired; null while it is live. */
  closed: { at: string; by: string; reason: string } | null;
  /** Attachment counts, so the list can show what is on file without the bytes. */
  evidenceCount: number;
  reviewCount: number;
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
  /**
   * Expiry, entered by the requestor as YYYY-MM-DD rather than derived from the
   * issue date. The Registry ID encodes its year and month, so it has to be
   * known before Level 2 can mint one.
   */
  expiry: string;
}

export type Screen = 'registry' | 'detail' | 'new' | 'inbox' | 'expiry' | 'dash';

/* ─── Access control ───────────────────────────────────────────── */

export type SnsRole =
  | 'Requestor — Sourcing / Procurement'
  | 'Validator L1 — Country Supply Chain Manager'
  | 'Validator L2 — Category Manager / SC Director'
  | 'Read-only — Supply Chain Management / Auditor'
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
   * Named on the Approvers screen, which is what confers validation authority
   * — not the access request, which nobody makes about themselves. Level 1 is
   * by country, Level 2 by category, and one person can be both.
   */
  isLevel1: boolean;
  isLevel2: boolean;
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
