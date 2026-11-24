'use client';

/* The admin upload panel with in-browser stand-ins for its server calls: files are parsed and
   diffed, templates and checklists built, and uploads undone by the real health-board code against
   an in-memory store, so every state of the panel can be seen signed out. Nothing reaches a
   database. */

import { useMemo } from 'react';
import HealthBoardDataClient, { type HealthBoardDataApi } from '@/app/admin/HealthBoardDataClient';
import type { KpiValue } from '@/lib/health-board/calc';
import { kpiByCode, normalisePeriod, type Country } from '@/lib/health-board/definitions';
import { diffUpload, type StoredCell } from '@/lib/health-board/diff';
import { parseKpiGrid, type ParsedRow } from '@/lib/health-board/parse';
import type { LoadSummary } from '@/lib/health-board/queries';
import { checklist, expectedCells, templateCsv } from '@/lib/health-board/template';

interface Cell extends StoredCell {
  loadId: number;
}

export default function HealthBoardDataPreview() {
  const api = useMemo<HealthBoardDataApi>(() => {
    const cell = (
      kpi: string,
      period: string,
      country: string,
      valueText: string,
      category = 'Purchasing',
    ): Cell => ({
      kpi,
      year: 2026,
      period,
      country,
      valueText,
      targetWords: null,
      category,
      loadId: 1,
    });
    const store: Cell[] = [
      cell('KPI - OTD', 'January', 'Global', '57.78231227'),
      cell('KPI - OTD', 'February', 'Global', '61.22010088'),
      cell('KPI - OTD', 'January', 'Oman', '40'),
      cell('KPI - PO Approval', 'October', 'Global', '5.1'),
      cell('KPI - DSOH', 'January', 'UAE', '96', 'Materials Management'),
    ];
    const history: { load: number; before: Cell | null; after: Cell }[] = [];
    const loads: LoadSummary[] = [
      {
        id: 1,
        kind: 'initial-load',
        fileName: 'all-kpis-sharepoint-export-2026-11-24.csv',
        loadedBy: 'preview',
        loadedAt: new Date().toISOString(),
        rowsInFile: 7067,
        rowsAdded: 7013,
        rowsChanged: 0,
        rowsUnchanged: 0,
        rowsRejected: 0,
        note: null,
      },
    ];
    const asValues = (): KpiValue[] =>
      store.map((c) => ({
        kpi: c.kpi,
        year: c.year,
        period: normalisePeriod(c.period)!,
        country: c.country as Country,
        value: c.valueText === null ? null : Number(c.valueText),
        targetWords: c.targetWords,
        category: c.category,
      }));
    const run = (grid: string[][]) => {
      const parsed = parseKpiGrid(grid);
      return { parsed, diff: diffUpload(parsed.rows, store) };
    };
    const line = (r: ParsedRow, b: StoredCell | null) => ({
      line: r.line,
      kpi: kpiByCode(r.kpi)?.name ?? r.kpi,
      country: r.country,
      period: r.period,
      year: r.year,
      before: b?.valueText ?? null,
      after: r.valueText,
      targetBefore: b?.targetWords ?? null,
      targetAfter: r.targetWords,
    });
    return {
      preview: async (fileName, grid) => {
        const { parsed, diff } = run(grid);
        const rejected = parsed.problems.filter((p) => p.severity === 'reject');
        return {
          success: true,
          data: {
            fileName,
            rowsInFile:
              parsed.rows.length + new Set(rejected.map((p) => p.line)).size + parsed.blank.length,
            blank: parsed.blank.length,
            added: diff.added.length,
            changed: diff.changed.length,
            unchanged: diff.unchanged.length,
            rejected,
            warnings: parsed.problems.filter((p) => p.severity === 'warn'),
            categoryNotes: diff.categoryNotes,
            changes: diff.changed.map((c) => line(c.row, c.before)),
            additions: diff.added.slice(0, 200).map((r) => line(r, null)),
            fingerprint: 'preview',
          },
        };
      },
      commit: async (fileName, grid) => {
        const { diff } = run(grid);
        const id = loads[0].id + 1;
        for (const r of diff.added) {
          const c: Cell = { ...r, valueText: r.valueText, loadId: id };
          store.push(c);
          history.push({ load: id, before: null, after: c });
        }
        for (const ch of diff.changed) {
          const i = store.findIndex(
            (s) =>
              s.kpi === ch.row.kpi &&
              s.year === ch.row.year &&
              s.period === ch.row.period &&
              s.country === ch.row.country,
          );
          const before = { ...store[i] };
          store[i] = {
            ...store[i],
            valueText: ch.row.valueText,
            targetWords: ch.row.targetWords,
            loadId: id,
          };
          history.push({ load: id, before, after: store[i] });
        }
        loads.unshift({
          id,
          kind: 'upload',
          fileName,
          loadedBy: 'preview',
          loadedAt: new Date().toISOString(),
          rowsInFile: grid.length - 1,
          rowsAdded: diff.added.length,
          rowsChanged: diff.changed.length,
          rowsUnchanged: diff.unchanged.length,
          rowsRejected: 0,
          note: null,
        });
        return {
          success: true,
          data: {
            loadId: id,
            added: diff.added.length,
            changed: diff.changed.length,
            unchanged: diff.unchanged.length,
          },
        };
      },
      loads: async () => ({ success: true, data: loads.map((l) => ({ ...l })) }),
      template: async (year, period) => {
        const p = normalisePeriod(period)!;
        const cells = expectedCells(asValues(), year, p);
        return {
          success: true,
          data: {
            fileName: `health-board-${year}-${p.toLowerCase()}.csv`,
            csv: templateCsv(cells, year, p),
            lines: cells.length,
          },
        };
      },
      checklist: async (year, period) => ({
        success: true,
        data: checklist(expectedCells(asValues(), year, normalisePeriod(period)!)),
      }),
      undo: async (loadId) => {
        if (loads[0].id !== loadId)
          return { success: false, error: 'Only the most recent upload can be undone.' };
        let restored = 0;
        let removed = 0;
        for (const h of history.filter((x) => x.load === loadId).reverse()) {
          const i = store.indexOf(h.after);
          if (h.before) {
            store[i] = h.before;
            restored++;
          } else {
            store.splice(i, 1);
            removed++;
          }
        }
        loads[0] = { ...loads[0], note: `Undone by load ${loadId + 1}.` };
        loads.unshift({
          ...loads[0],
          id: loadId + 1,
          fileName: `Undo of load ${loadId}: ${loads[0].fileName}`,
          rowsAdded: 0,
          rowsChanged: restored + removed,
          rowsUnchanged: 0,
          note: null,
        });
        return { success: true, data: { restored, removed } };
      },
    };
  }, []);

  return <HealthBoardDataClient api={api} />;
}
