/**
 * Who can change a mapping.
 *
 * A plain module with no imports so both sides can read it: the sidebar and the search screen
 * are client components and cannot pull in `access.ts`, which opens a pool and resolves a
 * session. The expression lived inline in `SourceGuideSidebar` and is now needed in three more
 * places -- including one that decides whether unmapped AVL vendors are sent to a browser at
 * all -- and four copies of a permission test is three too many.
 *
 * Note what this is NOT: it is not a read gate. Every approved SourceGuide user reads
 * everything, by design (see the note in `tool-scope.ts`), so an empty country list means "no
 * edit rights", never "no access".
 */

export interface SgManageFacts {
  isAdmin: boolean;
  viewOnly: boolean;
  approvedCountries: string[];
}

/** An admin, or a champion holding at least one country. */
export function canManage(u: SgManageFacts): boolean {
  return u.isAdmin || (!u.viewOnly && u.approvedCountries.length > 0);
}
