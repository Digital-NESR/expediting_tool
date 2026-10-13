import { describe, expect, it } from 'vitest';
import {
  filedByChampion,
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

  it('holds nobody who has sent nothing', () => {
    expect(matchesUploadSource([], 'champion')).toBe(false);
    expect(matchesUploadSource([], 'supplier_portal')).toBe(false);
    expect(matchesUploadSource([file('champion', true)], 'champion')).toBe(false);
  });

  /* "Anyone" is not a third route, it is the absence of this filter, so it must not quietly drop
     the vendors the status pills are still showing. */
  it('leaves everyone in scope under Anyone', () => {
    expect(matchesUploadSource([], 'all')).toBe(true);
    expect(matchesUploadSource([file('supplier_portal')], 'all')).toBe(true);
  });
});
