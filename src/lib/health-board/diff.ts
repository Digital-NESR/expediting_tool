/*
 * What an upload would do to the stored values: which cells it adds, which it changes and which
 * it leaves as they are. Pure, so the preview the admin approves and the write that follows are
 * computed by the same function.
 */

import { rowKey, type ParsedRow } from './parse';

export interface StoredCell {
  kpi: string;
  year: number;
  period: string;
  country: string;
  valueText: string | null;
  targetWords: string | null;
  category: string;
}

export interface CellChange {
  row: ParsedRow;
  before: StoredCell;
}

export interface UploadDiff {
  added: ParsedRow[];
  changed: CellChange[];
  unchanged: ParsedRow[];
  /** KPI × year whose category in the file differs from the one already stored. */
  categoryNotes: string[];
}

const sameNumber = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : Number(a) === Number(b);

export function diffUpload(rows: readonly ParsedRow[], stored: readonly StoredCell[]): UploadDiff {
  const byKey = new Map(stored.map((s) => [rowKey(s), s]));
  const storedCategory = new Map<string, string>();
  for (const s of stored) storedCategory.set(`${s.kpi}|${s.year}`, s.category);

  const added: ParsedRow[] = [];
  const changed: CellChange[] = [];
  const unchanged: ParsedRow[] = [];
  const notes = new Set<string>();

  for (const r of rows) {
    const cat = storedCategory.get(`${r.kpi}|${r.year}`);
    if (cat && cat !== r.category) {
      notes.add(`${r.kpi} ${r.year}: the file says "${r.category}", the board has "${cat}".`);
    }
    const before = byKey.get(rowKey(r));
    if (!before) {
      added.push(r);
    } else if (
      sameNumber(before.valueText, r.valueText) &&
      (before.targetWords ?? '') === (r.targetWords ?? '') &&
      before.category === r.category
    ) {
      unchanged.push(r);
    } else {
      changed.push({ row: r, before });
    }
  }
  return { added, changed, unchanged, categoryNotes: [...notes] };
}
