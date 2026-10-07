import { describe, expect, it } from 'vitest';
import {
  WORKSHEETS,
  worksheetByKey,
  worksheetFields,
  worksheetForModule,
  worksheetProgress,
} from '@/lib/learning-hub/worksheet-content';

/**
 * The eight worksheets, as data.
 *
 * These definitions are GENERATED from the Word documents rather than written, so what matters is
 * not that any one question reads correctly — it is that a regeneration cannot quietly produce a
 * sheet with duplicate field ids, a task with nowhere to type, or a module title that no longer
 * matches the release it belongs to. Every one of those would lose answers rather than fail loudly.
 */

describe('the worksheet set', () => {
  it('covers all eight releases', () => {
    expect(WORKSHEETS).toHaveLength(8);
    expect(WORKSHEETS.map((w) => w.key)).toEqual([
      'l1',
      'l2-r1',
      'l2-r2',
      'l2-r3',
      'l3-r1',
      'l3-r2',
      'l3-r3',
      'l3-r4',
    ]);
  });

  /* A field id is where an answer is stored. Two fields sharing one would silently overwrite each
     other, and the learner would watch an answer they typed appear under a different question. */
  it('gives every field an id that is unique within its sheet', () => {
    for (const sheet of WORKSHEETS) {
      const ids = worksheetFields(sheet).map((f) => f.id);
      expect(new Set(ids).size, `${sheet.key} has a duplicate field id`).toBe(ids.length);
    }
  });

  it('has something to answer on every sheet', () => {
    for (const sheet of WORKSHEETS) {
      expect(worksheetFields(sheet).length, sheet.key).toBeGreaterThan(5);
      expect(sheet.sections.length, sheet.key).toBeGreaterThan(0);
    }
  });

  /* Every task has to lead somewhere: its own box, the grid that follows it, or a line telling the
     learner which section to work it in. A task with none of the three is one whose answer table
     was lost in conversion, and it would render as a question nobody can answer. */
  it('gives every task and question somewhere to write', () => {
    for (const sheet of WORKSHEETS) {
      for (const section of sheet.sections) {
        for (const block of section.blocks) {
          if (block.type !== 'task' && block.type !== 'question') continue;
          const reachable = block.field || block.answeredBy || block.redirect;
          expect(reachable, `${sheet.key} / ${block.id} leads nowhere`).toBeTruthy();
        }
      }
    }
  });

  /* A grid named as a task's answer must exist on the same sheet, or the task points at nothing. */
  it('points every grid-answered task at a grid that is really there', () => {
    for (const sheet of WORKSHEETS) {
      const gridIds = new Set(
        sheet.sections.flatMap((s) => s.blocks.filter((b) => b.type === 'grid').map((b) => b.id)),
      );
      for (const section of sheet.sections) {
        for (const block of section.blocks) {
          if ((block.type === 'task' || block.type === 'question') && block.answeredBy) {
            expect(gridIds.has(block.answeredBy), `${sheet.key} / ${block.id}`).toBe(true);
          }
        }
      }
    }
  });

  it('leaves at least one cell to fill in every grid', () => {
    for (const sheet of WORKSHEETS) {
      for (const section of sheet.sections) {
        for (const block of section.blocks) {
          if (block.type !== 'grid') continue;
          const inputs = block.rows.flat().filter((c) => c.input).length;
          expect(inputs, `${sheet.key} / ${block.id} is a grid with nothing to complete`).toBeGreaterThan(0);
          // Every row has to be as wide as the header, or cells land under the wrong column.
          for (const row of block.rows) expect(row).toHaveLength(block.head.length);
        }
      }
    }
  });

  it('ships the worked answers with every sheet', () => {
    for (const sheet of WORKSHEETS) {
      expect(sheet.answers.length, sheet.key).toBeGreaterThan(0);
    }
  });
});

describe('finding a sheet', () => {
  /* The module title is the only join between a definition and the database. If it drifts, the
     release silently loses its worksheet rather than erroring, so it is pinned here. */
  it.each([
    ['Level 1', 'l1'],
    ['Demand Management & Forecasting', 'l2-r1'],
    ['Supply Planning & Inventory Control', 'l2-r2'],
    ['Supply, Logistics & Trade', 'l2-r3'],
    ['Supply Chain Strategy', 'l3-r1'],
    ['Supply Chain and Product Design', 'l3-r2'],
    ['Systems, Communication and Projects', 'l3-r3'],
    ['Metrics, Improvement and Change', 'l3-r4'],
  ])('matches module %s to worksheet %s', (moduleTitle, key) => {
    expect(worksheetForModule(moduleTitle)?.key).toBe(key);
  });

  it('is not thrown by casing or stray spaces in a module title', () => {
    expect(worksheetForModule('  supply chain strategy ')?.key).toBe('l3-r1');
  });

  it('returns null for a release with no worksheet', () => {
    expect(worksheetForModule('Upstream Drilling')).toBeNull();
    expect(worksheetByKey('nope')).toBeNull();
  });
});

describe('progress', () => {
  const sheet = worksheetByKey('l1')!;
  const fields = worksheetFields(sheet);
  const firstText = fields.find((f) => f.kind === 'text')!;
  const firstGrid = fields.find((f) => f.kind === 'grid')!;

  it('counts nothing for an untouched sheet', () => {
    expect(worksheetProgress(sheet, {})).toEqual({ answered: 0, total: fields.length });
  });

  it('ignores whitespace, so a stray space is not an answer', () => {
    expect(worksheetProgress(sheet, { [firstText.id]: '   ' }).answered).toBe(0);
    expect(worksheetProgress(sheet, { [firstText.id]: 'Because' }).answered).toBe(1);
  });

  /* A grid counts once any cell is filled rather than when all are. The discounting table has
     fifteen boxes, and somebody who did twelve has plainly engaged with it; nothing here gates
     anything, so the generous reading is the useful one. */
  it('counts a partly filled grid as answered', () => {
    expect(worksheetProgress(sheet, { [firstGrid.id]: { '0:5': '169,200' } }).answered).toBe(1);
    expect(worksheetProgress(sheet, { [firstGrid.id]: { '0:5': '  ' } }).answered).toBe(0);
    expect(worksheetProgress(sheet, { [firstGrid.id]: {} }).answered).toBe(0);
  });

  it('does not count an answer to a field the sheet no longer has', () => {
    expect(worksheetProgress(sheet, { 'sa.t-deleted-task': 'an orphan' }).answered).toBe(0);
  });
});
