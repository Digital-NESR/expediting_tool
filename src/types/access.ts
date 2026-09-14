/**
 * Shared access-request status vocabulary.
 *
 * Every tool in this repo (PO Expediting, TI-TE, SourceGuide, Catalog Manager,
 * S&S Registry, Laptop Procurement, Learning Hub) stores its access requests in a
 * one-row-per-user table with a `status` text column. Historically two spellings of
 * the "not allowed in" outcome coexisted: TI-TE / Catalog Manager / S&S Registry wrote
 * `'Rejected'` and `'Revoked'`, while PO Expediting and SourceGuide wrote `'Denied'`
 * for BOTH outcomes — so a rejection and a revocation were indistinguishable in the data.
 *
 * `AccessStatus` is the canonical set every writer must use from now on.
 */
export type AccessStatus = 'Pending' | 'Approved' | 'Rejected' | 'Revoked';

/**
 * What a READER may actually find in the database today. Identical to `AccessStatus`
 * plus the legacy `'Denied'` value, which still sits in rows written before the
 * vocabulary was unified and stays valid until the one-off data migration
 * (`UPDATE access_requests SET status = 'Rejected' WHERE status = 'Denied'`) has run
 * against every database.
 *
 * Use `AccessStatus` when writing, `StoredAccessStatus` when reading.
 */
export type StoredAccessStatus = AccessStatus | 'Denied';

/**
 * The lowercase, session-side projection of the status, as carried on
 * `session.user.toolAccess[tool].status` (see the NextAuth `jwt` callback).
 * `'new'` means "no request row exists"; `'denied'` is the legacy bucket and also the
 * catch-all the callback falls back to for any unrecognised stored value.
 *
 * Only `'approved'` ever grants access — every other member is a deny.
 */
export type SessionAccessStatus =
  | 'new' | 'pending' | 'approved' | 'rejected' | 'revoked' | 'denied';
