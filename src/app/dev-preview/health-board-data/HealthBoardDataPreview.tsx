'use client';

/* The admin upload panel with in-browser stand-ins for its three server calls: the file is parsed
   and diffed by the real parse/diff code against an in-memory store, so every state of the panel
   (preview, rejections, warnings, save, history) can be seen signed out. Nothing reaches a
   database. */

import { useMemo } from 'react';
import HealthBoardDataClient, { type HealthBoardDataApi } from '@/app/admin/HealthBoardDataClient';
import { kpiByCode } from '@/lib/health-board/definitions';
import { diffUpload, type StoredCell } from '@/lib/health-board/diff';
import { parseKpiGrid } from '@/lib/health-board/parse';
import type { LoadSummary } from '@/lib/health-board/queries';

export default function HealthBoardDataPreview() {
  const api = useMemo<HealthBoardDataApi>(() => {
    const store: StoredCell[] = [
      {
        kpi: 'KPI - OTD',
        year: 2026,
        period: 'January',
        country: 'Global',
        valueText: '57.78231227',
        targetWords: null,
        category: 'Purchasing',
      },
    ];
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
    const run = (grid: string[][]) => {
      const parsed = parseKpiGrid(grid);
      return { parsed, diff: diffUpload(parsed.rows, store) };
    };
    return {
      preview: async (fileName, grid) => {
        const { parsed, diff } = run(grid);
        const rejected = parsed.problems.filter((p) => p.severity === 'reject');
        const line = (r: (typeof parsed.rows)[number], b: StoredCell | null) => ({
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
          success: true,
          data: {
            fileName,
            rowsInFile: parsed.rows.length + new Set(rejected.map((p) => p.line)).size,
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
        for (const r of diff.added) store.push({ ...r, valueText: r.valueText });
        loads.unshift({
          id: loads.length + 1,
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
            loadId: loads.length,
            added: diff.added.length,
            changed: diff.changed.length,
            unchanged: diff.unchanged.length,
          },
        };
      },
      loads: async () => ({ success: true, data: [...loads] }),
    };
  }, []);

  return <HealthBoardDataClient api={api} />;
}
