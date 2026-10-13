/**
 * Who filed a statement: the supplier through their own upload link, or a champion by hand.
 *
 * One definition, because three places ask the same question and a disagreement between them is
 * invisible: the Response Tracking filter narrows the table by it, the file chips label each
 * statement with it, and the consolidated workbook's Response Tracking tab reports the route.
 */

export type UploadSource = 'all' | 'champion' | 'supplier_portal';

/** The shape this module needs off a submission; the full row carries more. */
export interface SourcedFile {
  superseded: boolean;
  source: 'champion' | 'supplier_portal';
}

/**
 * Only the live files answer the question.
 *
 * A replaced upload is out of the arithmetic everywhere else, so a vendor whose champion upload
 * was superseded by the supplier's own filing belongs under the supplier: the file that counts is
 * the one that came from there, and filing it under the champion would hand back the wrong rows
 * to someone looking for their own corrections.
 */
const live = (files: readonly SourcedFile[]) => files.filter((f) => !f.superseded);

export const filedByChampion = (files: readonly SourcedFile[]): boolean =>
  live(files).some((f) => f.source === 'champion');

export const filedBySupplier = (files: readonly SourcedFile[]): boolean =>
  live(files).some((f) => f.source === 'supplier_portal');

/**
 * Whether a vendor's statements belong under the chosen filter.
 *
 * A vendor can sit under both: a champion who files a supplier's emailed reply beside the
 * spreadsheet the supplier uploaded has one of each, and both readings are true. Neither filter
 * holds a vendor who has sent nothing, which is what the status pills are for.
 */
export function matchesUploadSource(files: readonly SourcedFile[], filter: UploadSource): boolean {
  if (filter === 'all') return true;
  return filter === 'champion' ? filedByChampion(files) : filedBySupplier(files);
}
