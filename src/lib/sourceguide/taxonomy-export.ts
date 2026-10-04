/**
 * The whole spend taxonomy as one NESR-branded workbook.
 *
 * The screen is a drill-down: it answers "where does this commodity live" one level at a time, for
 * one branch at a time. The questions people take away from it are the other kind, and the screen
 * cannot answer any of them: how big is each spend type next to the others, which categories carry
 * the weight, what is the whole list so I can filter it in my own way. So the export is not a dump
 * of what is on screen. It is the same facts arranged four more ways, which is the point of
 * exporting at all.
 *
 * Seven sheets, in the order somebody actually reads them: what this is, then the four roll-ups
 * from coarsest to finest, then the full list, then the shape of the tree.
 *
 * The tallies are pure and separately tested. Only the workbook assembly below touches ExcelJS,
 * because the arithmetic is the part that can be wrong in a way nobody notices.
 */

import ExcelJS from 'exceljs';

/** One commodity record: its five levels, plus the two fields only the full list shows. */
export interface TaxonomyExportRow {
  spendType: string;
  category: string;
  subCategory: string;
  family: string;
  commodity: string;
  code: string;
  description: string;
}

/** The four groupable levels, outermost first. Commodity is the leaf and never a group. */
const KEYS = ['spendType', 'category', 'subCategory', 'family'] as const;

export const LEVEL_LABELS = ['Spend Type', 'Category', 'Sub-Category', 'Family', 'Commodity'];

/* A roll-up sheet's deeper columns hold counts, not names, so they are headed with the plural.
   Headed with the singular they read as "the category of this spend type", which is a different
   and wrong claim about a cell containing the number 10. */
const LEVEL_PLURALS = ['Spend Types', 'Categories', 'Sub-Categories', 'Families', 'Commodities'];

export interface TaxonomyTally {
  /** The values of every level down to and including the grouped one. */
  path: string[];
  /** Distinct counts at each level below this one, in order. */
  deeper: number[];
  commodities: number;
  /** Share of all commodity records, 0..1. */
  share: number;
}

/**
 * Group the rows at `depth` levels and count what sits under each group.
 *
 * Deeper levels are counted on their full path, not their bare name. "General" is a sub-category
 * under dozens of categories and they are different sub-categories; counting the names alone
 * would collapse them into one and report a spend type as having far fewer parts than it has.
 */
export function tallyBy(rows: TaxonomyExportRow[], depth: 1 | 2 | 3 | 4): TaxonomyTally[] {
  const below = KEYS.slice(depth);
  const groups = new Map<string, { path: string[]; sets: Set<string>[]; commodities: number }>();

  for (const row of rows) {
    const path = KEYS.slice(0, depth).map((k) => row[k]);
    const key = path.join('\u0000');
    let group = groups.get(key);
    if (!group) {
      group = { path, sets: below.map(() => new Set<string>()), commodities: 0 };
      groups.set(key, group);
    }
    group.commodities += 1;
    below.forEach((_, i) => {
      // Path from the root down to that deeper level, which is what makes it distinct.
      group.sets[i].add(
        KEYS.slice(0, depth + i + 1)
          .map((k) => row[k])
          .join('\u0000'),
      );
    });
  }

  const total = rows.length || 1;
  return [...groups.values()]
    .map((g) => ({
      path: g.path,
      deeper: g.sets.map((s) => s.size),
      commodities: g.commodities,
      share: g.commodities / total,
    }))
    .sort(
      (a, b) => b.commodities - a.commodities || a.path.join(' ').localeCompare(b.path.join(' ')),
    );
}

export interface TaxonomyTotals {
  spendTypes: number;
  categories: number;
  subCategories: number;
  families: number;
  commodities: number;
}

/** The five headline counts, each on full paths for the same reason `tallyBy` is. */
export function taxonomyTotals(rows: TaxonomyExportRow[]): TaxonomyTotals {
  const seen = KEYS.map(() => new Set<string>());
  for (const row of rows) {
    KEYS.forEach((_, i) =>
      seen[i].add(
        KEYS.slice(0, i + 1)
          .map((k) => row[k])
          .join('\u0000'),
      ),
    );
  }
  return {
    spendTypes: seen[0].size,
    categories: seen[1].size,
    subCategories: seen[2].size,
    families: seen[3].size,
    commodities: rows.length,
  };
}

/* ── NESR brand tokens (Brand Guideline Manual, Jan 2021) ───────────────────── */

const GREEN = 'FF2A7E4F';
const LIGHT_GREEN = 'FF6AAF8E';
const PALE_GREEN = 'FFC5E0D2';
const BLACK = 'FF1F1F1D';
const GRAY = 'FF58595B';
const WHITE = 'FFFFFFFF';

const BODY = { name: 'Arial', size: 10, color: { argb: BLACK } } as const;
const BODY_BOLD = { name: 'Arial', size: 10, bold: true, color: { argb: BLACK } } as const;
const HEAD_CELL = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE } } as const;
const META = { name: 'Arial', size: 9, color: { argb: GRAY } } as const;

const fill = (argb: string): ExcelJS.FillPattern => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb },
});

/**
 * The three-row masthead every sheet wears: green band with the logo and the sheet's name, a pale
 * strip of provenance, then air. Data starts at row 4 on every sheet, so the frozen pane and the
 * autofilter can be stated once rather than counted per sheet.
 */
const FIRST_DATA_ROW = 5;
const HEADER_ROW = 4;

function masthead(
  ws: ExcelJS.Worksheet,
  opts: { title: string; subtitle: string; width: number; logoId: number | null; exportedAt: Date },
) {
  const last = ws.getColumn(opts.width).letter;

  ws.mergeCells(`A1:${last}1`);
  const band = ws.getCell('A1');
  band.value = opts.title;
  band.fill = fill(GREEN);
  band.font = { name: 'Arial', size: 14, bold: true, color: { argb: WHITE } };
  band.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 36;

  if (opts.logoId != null) {
    /* Floated over the band's left end rather than placed in a cell, because the title is
       centred across the same merge and the two would otherwise fight for column A. */
    ws.addImage(opts.logoId, { tl: { col: 0.25, row: 0.3 }, ext: { width: 86, height: 26 } });
  }

  ws.mergeCells(`A2:${last}2`);
  const meta = ws.getCell('A2');
  meta.value = `${opts.subtitle}  ·  Exported ${opts.exportedAt.toISOString().slice(0, 10)}  ·  National Energy Services Reunited Corp.  ·  www.nesr.com`;
  meta.fill = fill(PALE_GREEN);
  meta.font = META;
  meta.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(2).height = 18;

  ws.getRow(3).height = 6;
}

/** Column headers on row 4, green on white-bordered green, and everything above them frozen. */
function headerRow(ws: ExcelJS.Worksheet, labels: string[]) {
  const row = ws.getRow(HEADER_ROW);
  labels.forEach((label, i) => {
    const cell = row.getCell(i + 1);
    cell.value = label;
    cell.fill = fill(GREEN);
    cell.font = HEAD_CELL;
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = {
      left: { style: 'thin', color: { argb: WHITE } },
      right: { style: 'thin', color: { argb: WHITE } },
    };
  });
  row.height = 26;
  row.commit();
  ws.views = [{ state: 'frozen', ySplit: HEADER_ROW }];
}

/** Banded rows, Arial throughout. Called once per sheet after the data is in. */
function stripe(ws: ExcelJS.Worksheet, firstRow: number, lastRow: number, width: number) {
  for (let r = firstRow; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const pale = (r - firstRow) % 2 === 1;
    for (let c = 1; c <= width; c++) {
      const cell = row.getCell(c);
      cell.font = BODY;
      if (pale) cell.fill = fill(PALE_GREEN);
    }
  }
}

/**
 * A native Excel data bar across a count column.
 *
 * ExcelJS cannot author charts - it reads them and cannot write them - so every visual in this
 * workbook has to be something a cell can carry. A data bar is the honest version of a bar chart
 * for a ranked list this long: it scales to the column, it survives sorting and filtering, and it
 * needs no plot area for 1,200 categories to fight over.
 */
function dataBars(ws: ExcelJS.Worksheet, column: number, firstRow: number, lastRow: number) {
  if (lastRow < firstRow) return;
  const letter = ws.getColumn(column).letter;
  /* `color` is cast through because ExcelJS's own typings for a data-bar rule omit it, while the
     writer uses it: the generated sheet XML carries <color rgb="FF2A7E4F"/> inside the dataBar.
     Without the cast the bars would have to be left at the default blue, in a branded workbook. */
  const rule = {
    type: 'dataBar',
    priority: 1,
    cfvo: [{ type: 'min' }, { type: 'max' }],
    color: { argb: GREEN },
  } as unknown as ExcelJS.DataBarRuleType;

  ws.addConditionalFormatting({ ref: `${letter}${firstRow}:${letter}${lastRow}`, rules: [rule] });
}

/** One roll-up sheet: the grouped levels, the distinct counts beneath, the count and its share. */
function tallySheet(
  wb: ExcelJS.Workbook,
  opts: {
    name: string;
    subtitle: string;
    depth: 1 | 2 | 3 | 4;
    rows: TaxonomyExportRow[];
    logoId: number | null;
    exportedAt: Date;
  },
) {
  const tallies = tallyBy(opts.rows, opts.depth);
  const pathLabels = LEVEL_LABELS.slice(0, opts.depth);
  const deeperLabels = LEVEL_PLURALS.slice(opts.depth, 4);
  const labels = [...pathLabels, ...deeperLabels, 'Commodities', 'Share of Total'];

  const ws = wb.addWorksheet(opts.name);
  masthead(ws, {
    title: `Spend Taxonomy  ·  ${opts.name}`,
    subtitle: opts.subtitle,
    width: labels.length,
    logoId: opts.logoId,
    exportedAt: opts.exportedAt,
  });
  headerRow(ws, labels);

  tallies.forEach((t) => {
    ws.addRow([...t.path, ...t.deeper, t.commodities, t.share]);
  });

  const lastRow = HEADER_ROW + tallies.length;
  stripe(ws, FIRST_DATA_ROW, lastRow, labels.length);

  const countCol = pathLabels.length + deeperLabels.length + 1;
  const shareCol = countCol + 1;
  for (let r = FIRST_DATA_ROW; r <= lastRow; r++) {
    ws.getRow(r).getCell(countCol).numFmt = '#,##0';
    ws.getRow(r).getCell(shareCol).numFmt = '0.0%';
  }
  dataBars(ws, countCol, FIRST_DATA_ROW, lastRow);

  // A total, because a reader who filters this sheet needs something to check their filter against.
  const total = ws.addRow([
    'Total',
    ...Array(pathLabels.length - 1).fill(''),
    ...deeperLabels.map((_, i) => tallyBy(opts.rows, (opts.depth + i + 1) as 1 | 2 | 3 | 4).length),
    opts.rows.length,
    1,
  ]);
  total.eachCell((cell) => {
    cell.fill = fill(LIGHT_GREEN);
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE } };
  });
  total.getCell(countCol).numFmt = '#,##0';
  total.getCell(shareCol).numFmt = '0.0%';

  pathLabels.forEach((_, i) => {
    ws.getColumn(i + 1).width = i === 0 ? 30 : 34;
  });
  deeperLabels.forEach((_, i) => {
    ws.getColumn(pathLabels.length + i + 1).width = 15;
  });
  ws.getColumn(countCol).width = 14;
  ws.getColumn(shareCol).width = 13;

  ws.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: lastRow, column: labels.length },
  };
}

/** The raw list. Everything, one commodity per row, filterable. */
function fullListSheet(
  wb: ExcelJS.Workbook,
  rows: TaxonomyExportRow[],
  logoId: number | null,
  exportedAt: Date,
) {
  const labels = [...LEVEL_LABELS, 'UNSPSC Code', 'Description'];
  const ws = wb.addWorksheet('All Commodities');
  masthead(ws, {
    title: 'Spend Taxonomy  ·  All Commodities',
    subtitle: 'Every commodity record, one per row',
    width: labels.length,
    logoId,
    exportedAt,
  });
  headerRow(ws, labels);

  const sorted = [...rows].sort(
    (a, b) =>
      a.spendType.localeCompare(b.spendType) ||
      a.category.localeCompare(b.category) ||
      a.subCategory.localeCompare(b.subCategory) ||
      a.family.localeCompare(b.family) ||
      a.commodity.localeCompare(b.commodity),
  );
  for (const r of sorted) {
    ws.addRow([
      r.spendType,
      r.category,
      r.subCategory,
      r.family,
      r.commodity,
      r.code,
      r.description,
    ]);
  }

  const lastRow = HEADER_ROW + sorted.length;
  stripe(ws, FIRST_DATA_ROW, lastRow, labels.length);

  /* Text, not a number. UNSPSC codes are fixed-width identifiers with leading zeros, and Excel
     drops those the moment it decides a column is numeric. */
  for (let r = FIRST_DATA_ROW; r <= lastRow; r++) ws.getRow(r).getCell(6).numFmt = '@';

  [30, 34, 34, 34, 42, 16, 60].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  ws.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: lastRow, column: labels.length },
  };
}

/**
 * The tree, as a tree.
 *
 * The roll-up sheets each flatten one level; this is the only sheet that shows the shape. Excel's
 * own outline grouping does the collapsing, so a reader opens a spend type and sees its categories
 * without scrolling past the other ten thousand rows.
 */
function treeSheet(
  wb: ExcelJS.Workbook,
  rows: TaxonomyExportRow[],
  logoId: number | null,
  exportedAt: Date,
) {
  const labels = ['Level', 'Name', 'Commodities'];
  const ws = wb.addWorksheet('Tree View');
  masthead(ws, {
    title: 'Spend Taxonomy  ·  Tree View',
    subtitle: 'The hierarchy, collapsible. Use the outline controls at the left edge',
    width: labels.length,
    logoId,
    exportedAt,
  });
  headerRow(ws, labels);

  // Nested maps, built once, so each level is written under the parent it belongs to.
  type Node = { count: number; children: Map<string, Node> };
  const root: Node = { count: 0, children: new Map() };
  for (const r of rows) {
    let node = root;
    node.count += 1;
    for (const value of [r.spendType, r.category, r.subCategory, r.family, r.commodity]) {
      let next = node.children.get(value);
      if (!next) {
        next = { count: 0, children: new Map() };
        node.children.set(value, next);
      }
      next.count += 1;
      node = next;
    }
  }

  const walk = (node: Node, depth: number) => {
    const ordered = [...node.children.entries()].sort(
      (a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]),
    );
    for (const [value, child] of ordered) {
      const row = ws.addRow([LEVEL_LABELS[depth], `${'    '.repeat(depth)}${value}`, child.count]);
      row.outlineLevel = depth;
      row.getCell(1).font = { name: 'Arial', size: 9, color: { argb: GRAY } };
      row.getCell(2).font = depth <= 1 ? BODY_BOLD : BODY;
      row.getCell(3).numFmt = '#,##0';
      row.getCell(3).font = BODY;
      if (depth === 0) {
        for (let c = 1; c <= labels.length; c++) row.getCell(c).fill = fill(PALE_GREEN);
      }
      if (depth < 4) walk(child, depth + 1);
    }
  };
  walk(root, 0);

  // Collapsed to the top two levels on open; the whole thing expanded is 12,000 rows of noise.
  ws.properties.outlineLevelRow = 1;
  [16, 72, 14].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

/** The front page: what this is, how big it is, and what each of the other sheets answers. */
function overviewSheet(
  wb: ExcelJS.Workbook,
  rows: TaxonomyExportRow[],
  logoId: number | null,
  exportedAt: Date,
) {
  const ws = wb.addWorksheet('Overview');
  masthead(ws, {
    title: 'NESR Spend Taxonomy',
    subtitle: 'The full classification of what NESR buys',
    width: 5,
    logoId,
    exportedAt,
  });

  const totals = taxonomyTotals(rows);
  const section = (label: string) => {
    const row = ws.addRow([label]);
    row.getCell(1).font = { name: 'Arial', size: 12, bold: true, color: { argb: GREEN } };
    row.height = 22;
    return row;
  };

  ws.addRow([]);
  section('At a Glance');
  (
    [
      ['Spend Types', totals.spendTypes],
      ['Categories', totals.categories],
      ['Sub-Categories', totals.subCategories],
      ['Families', totals.families],
      ['Commodities', totals.commodities],
    ] as [string, number][]
  ).forEach(([label, value]) => {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = BODY;
    row.getCell(2).font = { name: 'Arial', size: 11, bold: true, color: { argb: GREEN } };
    row.getCell(2).numFmt = '#,##0';
    row.getCell(2).alignment = { horizontal: 'left' };
  });

  const coded = rows.filter((r) => r.code.trim()).length;
  const coverage = ws.addRow(['With a UNSPSC code', coded]);
  coverage.getCell(1).font = BODY;
  coverage.getCell(2).font = { name: 'Arial', size: 11, bold: true, color: { argb: GREEN } };
  coverage.getCell(2).numFmt = '#,##0';
  coverage.getCell(2).alignment = { horizontal: 'left' };

  ws.addRow([]);
  section('Largest Spend Types by Commodity Count');
  const top = tallyBy(rows, 1).slice(0, 10);
  const barFirst = ws.rowCount + 1;
  top.forEach((t) => {
    const row = ws.addRow([t.path[0], t.commodities, t.share]);
    row.getCell(1).font = BODY;
    row.getCell(2).font = BODY;
    row.getCell(2).numFmt = '#,##0';
    row.getCell(3).font = META;
    row.getCell(3).numFmt = '0.0%';
  });
  dataBars(ws, 2, barFirst, ws.rowCount);

  ws.addRow([]);
  section('What Is in This Workbook');
  (
    [
      ['Overview', 'This sheet. Headline counts and the largest spend types.'],
      ['Spend Types', 'One row per spend type, with everything beneath it counted.'],
      ['Categories', 'One row per category, within its spend type.'],
      ['Sub-Categories', 'One row per sub-category, within its category.'],
      ['Families', 'One row per family, the level directly above a commodity.'],
      ['All Commodities', 'The raw list. Every commodity with its UNSPSC code and description.'],
      ['Tree View', 'The hierarchy itself, collapsible from spend type down to commodity.'],
    ] as [string, string][]
  ).forEach(([name, what]) => {
    const row = ws.addRow([name, what]);
    row.getCell(1).font = BODY_BOLD;
    row.getCell(2).font = BODY;
  });

  ws.addRow([]);
  const note = ws.addRow([
    'Counts are of commodity records. A sub-category or family name such as "General" occurs under many parents; each is counted separately, because each is a different place in the taxonomy.',
  ]);
  note.getCell(1).font = META;
  ws.mergeCells(`A${note.number}:E${note.number}`);
  note.getCell(1).alignment = { wrapText: true, vertical: 'top' };
  note.height = 30;

  [26, 58, 14, 14, 14].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

/** The exported file's name, which carries the date so two downloads never collide. */
export function taxonomyExportFileName(exportedAt: Date): string {
  return `NESR Spend Taxonomy ${exportedAt.toISOString().slice(0, 10)}.xlsx`;
}

export async function buildTaxonomyWorkbook(
  rows: TaxonomyExportRow[],
  opts: { logo?: Uint8Array | null; exportedAt?: Date } = {},
): Promise<Buffer> {
  const exportedAt = opts.exportedAt ?? new Date();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NESR SC Agents';
  wb.created = exportedAt;

  /* ExcelJS declares its own `Buffer` type, which does not line up with Node's under
     `skipLibCheck: false`; the bytes are the same either way. */
  const logoId = opts.logo
    ? wb.addImage({ buffer: opts.logo as unknown as ExcelJS.Buffer, extension: 'png' })
    : null;

  overviewSheet(wb, rows, logoId, exportedAt);
  (
    [
      ['Spend Types', 'The coarsest cut, one row per spend type', 1],
      ['Categories', 'One row per category, inside its spend type', 2],
      ['Sub-Categories', 'One row per sub-category, inside its category', 3],
      ['Families', 'One row per family, the level above a commodity', 4],
    ] as [string, string, 1 | 2 | 3 | 4][]
  ).forEach(([name, subtitle, depth]) => {
    tallySheet(wb, { name, subtitle, depth, rows, logoId, exportedAt });
  });
  fullListSheet(wb, rows, logoId, exportedAt);
  treeSheet(wb, rows, logoId, exportedAt);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
