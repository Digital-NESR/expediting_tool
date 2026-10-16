/**
 * Who filed a statement: the supplier through their own upload link, or a champion by hand.
 *
 * One definition, because three places ask the same question and a disagreement between them is
 * invisible: the Response Tracking filter narrows the table by it, the file chips label each
 * statement with it, and the consolidated workbook's Response Tracking tab reports the route.
 */

export type UploadSource = 'all' | 'champion' | 'supplier_portal' | 'none';

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
 * Nobody filed anything, which is a real answer to "who filed this" and not the absence of one.
 *
 * It exists because leaving it out put a hole in the Consolidation screen. That page lists the
 * 57 suppliers in HQ Dubai's file; 11 were uploaded by a champion and 31 filed by the supplier,
 * and the remaining 15 are vendors a champion closed as having no pending invoices. They have no
 * statement because there was none to collect, and they are in the workbook as marker rows
 * saying so. With only the two filters they matched neither, so picking either made 15 rows
 * disappear with nothing to say why, and the pill counts did not add up to the total sitting
 * above them.
 */
export const filedByNobody = (files: readonly SourcedFile[]): boolean => live(files).length === 0;

/**
 * Whether a vendor's statements belong under the chosen filter.
 *
 * A vendor can sit under both: a champion who files a supplier's emailed reply beside the
 * spreadsheet the supplier uploaded has one of each, and both readings are true. A vendor with
 * nothing on file sits under `none`, so the options between them account for every row rather
 * than quietly dropping some.
 */
export function matchesUploadSource(files: readonly SourcedFile[], filter: UploadSource): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'champion':
      return filedByChampion(files);
    case 'supplier_portal':
      return filedBySupplier(files);
    case 'none':
      return filedByNobody(files);
  }
}
