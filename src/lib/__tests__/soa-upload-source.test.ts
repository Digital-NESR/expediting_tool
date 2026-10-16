import { describe, expect, it } from 'vitest';
import {
  filedByChampion,
  filedByNobody,
  filedBySupplier,
  matchesUploadSource,
  type SourcedFile,
} from '@/lib/soa/upload-source';

/**
 * The "Filed by" filter on Response Tracking.
 *
 * It exists so a champion can find the statements they uploaded by hand, which are the ones they
 * may need to go back and correct before the country is handed off. What is pinned here is the
 * part that is easy to get wrong and silent when it is: a replaced file still says who filed it,
 * and reading it would put a vendor under the champion long after the supplier's own filing
 * became the one that counts.
 */

const file = (source: SourcedFile['source'], superseded = false): SourcedFile => ({
  source,
  superseded,
});

describe('filing source', () => {
  it('finds a champion upload', () => {
    expect(filedByChampion([file('champion')])).toBe(true);
    expect(filedBySupplier([file('champion')])).toBe(false);
  });

  it('finds a supplier filing', () => {
    expect(filedBySupplier([file('supplier_portal')])).toBe(true);
    expect(filedByChampion([file('supplier_portal')])).toBe(false);
  });

  /* A champion files the supplier's emailed reply beside the spreadsheet the supplier uploaded.
     Both readings are true and the vendor shows under either filter. */
  it('holds a vendor with one of each under both', () => {
    const both = [file('champion'), file('supplier_portal')];
    expect(filedByChampion(both)).toBe(true);
    expect(filedBySupplier(both)).toBe(true);
  });

  /* The reason this module exists rather than a `.some()` at each call site. */
  it('ignores a replaced file', () => {
    const files = [file('champion', true), file('supplier_portal')];
    expect(filedByChampion(files)).toBe(false);
    expect(filedBySupplier(files)).toBe(true);
  });

  it('puts a vendor with nothing on file under its own answer, not nowhere', () => {
    expect(matchesUploadSource([], 'champion')).toBe(false);
    expect(matchesUploadSource([], 'supplier_portal')).toBe(false);
    expect(matchesUploadSource([], 'none')).toBe(true);
    expect(filedByNobody([])).toBe(true);
  });

  /* A superseded file is not a file. A vendor whose only upload was replaced and never redone
     has nothing on file, which is the state HQ Dubai's Abu Dhabi National Takaful landed in. */
  it('counts a vendor whose only file was removed as having nothing on file', () => {
    expect(filedByNobody([file('champion', true)])).toBe(true);
    expect(matchesUploadSource([file('champion', true)], 'none')).toBe(true);
    expect(matchesUploadSource([file('champion', true)], 'champion')).toBe(false);
  });

  /*
   * The arithmetic the missing option broke.
   *
   * HQ Dubai's Consolidation screen lists 57 suppliers: 11 uploaded by a champion, 31 filed by
   * the supplier, and 15 closed as having no pending invoices with no statement to collect.
   * With three options the pills read 57 / 11 / 31 and picking either of the last two made 15
   * rows vanish with nothing to say why. Every row must match exactly one of the three answers
   * below 'Anyone', so the counts add up to what is shown above them.
   */
  it('accounts for every row across the three answers', () => {
    const rows: SourcedFile[][] = [
      [file('champion')],
      [file('supplier_portal')],
      [file('champion'), file('supplier_portal')],
      [],
      [file('supplier_portal', true)],
    ];
    for (const files of rows) {
      const matched = (['champion', 'supplier_portal', 'none'] as const).filter((f) =>
        matchesUploadSource(files, f),
      );
      expect(matched.length, `no answer holds ${JSON.stringify(files)}`).toBeGreaterThan(0);
      expect(matchesUploadSource(files, 'all')).toBe(true);
    }
  });

  /* "Anyone" is not a third route, it is the absence of this filter, so it must not quietly drop
     the vendors the status pills are still showing. */
  it('leaves everyone in scope under Anyone', () => {
    expect(matchesUploadSource([], 'all')).toBe(true);
    expect(matchesUploadSource([file('supplier_portal')], 'all')).toBe(true);
  });
});
