'use client';

/* ─────────────────────────────────────────────────────────────
   Supply Chain Analytics · Health Board Data.

   The only way numbers reach the native Health Board. The admin picks a file in the same
   format as the old SharePoint "All KPIs" export, sees exactly what it would add and change,
   and only then saves. A file with any rejected row cannot be saved: fix the file and preview
   again. Every save is logged with the old value of each changed cell.
   ───────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from 'react';
import { readSpreadsheet } from '@/lib/spreadsheet-import';
import {
  commitHealthBoardUpload,
  getHealthBoardLoads,
  previewHealthBoardUpload,
  type UploadPreview,
  type UploadPreviewLine,
} from '@/app/actions/health-board';
import type { LoadSummary } from '@/lib/health-board/queries';
import { COUNTRIES, KPIS } from '@/lib/health-board/definitions';
import { UPLOAD_COLUMNS } from '@/lib/health-board/parse';

const BRAND = '#307c4c';

function templateCsv(): string {
  const rows = [
    UPLOAD_COLUMNS.join(','),
    'Global,57.78,January,2026,KPI - OTD,Purchasing,%,',
    'Global,60,Target,2026,KPI - OTD,Purchasing,%,>= 60',
    'Global,12.89162,YTD,2026,KPI - P&L (M&S),Materials Management,%,',
  ];
  return rows.join('\r\n') + '\r\n';
}

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'health-board-upload-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'red' | 'green' }) {
  const colour =
    tone === 'red' && value > 0
      ? 'text-red-600'
      : tone === 'green'
        ? 'text-[#307c4c]'
        : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${colour}`}>
        {value.toLocaleString('en-US')}
      </p>
    </div>
  );
}

function LinesTable({ lines, showBefore }: { lines: UploadPreviewLine[]; showBefore: boolean }) {
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
      <table className="w-full text-[12.5px]">
        <thead className="sticky top-0 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Line</th>
            <th className="px-3 py-2">KPI</th>
            <th className="px-3 py-2">Country</th>
            <th className="px-3 py-2">Period</th>
            {showBefore && <th className="px-3 py-2 text-right">Now</th>}
            <th className="px-3 py-2 text-right">{showBefore ? 'Becomes' : 'Value'}</th>
            <th className="px-3 py-2">Target text</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.line} className="border-t border-slate-100">
              <td className="px-3 py-1.5 tabular-nums text-slate-400">{l.line}</td>
              <td className="px-3 py-1.5 text-slate-800">{l.kpi}</td>
              <td className="px-3 py-1.5">{l.country}</td>
              <td className="px-3 py-1.5">
                {l.period} {l.year}
              </td>
              {showBefore && (
                <td className="px-3 py-1.5 text-right font-mono text-slate-500">
                  {l.before ?? '—'}
                </td>
              )}
              <td className="px-3 py-1.5 text-right font-mono text-slate-900">{l.after ?? '—'}</td>
              <td className="px-3 py-1.5 text-slate-500">
                {showBefore && (l.targetBefore ?? '') !== (l.targetAfter ?? '')
                  ? `${l.targetBefore ?? '—'} → ${l.targetAfter ?? '—'}`
                  : (l.targetAfter ?? '')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The three server calls, injectable so /dev-preview/health-board-data can render the panel
 *  signed out with stand-ins. Production always uses the real, admin-gated actions. */
export interface HealthBoardDataApi {
  preview: typeof previewHealthBoardUpload;
  commit: typeof commitHealthBoardUpload;
  loads: typeof getHealthBoardLoads;
}

const REAL_API: HealthBoardDataApi = {
  preview: previewHealthBoardUpload,
  commit: commitHealthBoardUpload,
  loads: getHealthBoardLoads,
};

export default function HealthBoardDataClient({ api = REAL_API }: { api?: HealthBoardDataApi }) {
  const [loads, setLoads] = useState<LoadSummary[] | null>(null);
  const [file, setFile] = useState<{ name: string; grid: string[][] } | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [busy, setBusy] = useState<'reading' | 'saving' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const refreshLoads = useCallback(async () => {
    const r = await api.loads();
    setLoads(r.success ? r.data : []);
    if (!r.success) setError(r.error);
  }, [api]);

  useEffect(() => {
    void refreshLoads();
  }, [refreshLoads]);

  async function onPick(f: File | undefined) {
    setPreview(null);
    setSaved(null);
    setError(null);
    setFile(null);
    if (!f) return;
    setBusy('reading');
    try {
      const sheets = await readSpreadsheet(f);
      if (!sheets.length) throw new Error('The file has no sheets.');
      const grid = sheets[0].rows;
      const r = await api.preview(f.name, grid);
      if (!r.success) throw new Error(r.error);
      setFile({ name: f.name, grid });
      setPreview(r.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the file.');
    } finally {
      setBusy(null);
    }
  }

  async function onSave() {
    if (!file || !preview) return;
    setBusy('saving');
    setError(null);
    const r = await api.commit(file.name, file.grid, preview.fingerprint);
    setBusy(null);
    if (!r.success) {
      setError(r.error);
      return;
    }
    setSaved(
      `Saved: ${r.data.added} added, ${r.data.changed} changed, ${r.data.unchanged} unchanged. The board shows them now.`,
    );
    setPreview(null);
    setFile(null);
    void refreshLoads();
  }

  const canSave = preview && preview.rejected.length === 0 && preview.added + preview.changed > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Health Board Data</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">
          Upload KPI values for the native Supply Chain Health Board. Use the same columns as the
          old SharePoint &ldquo;All KPIs&rdquo; export ({UPLOAD_COLUMNS.join(', ')}), as .csv or
          .xlsx. A row for a KPI, country, month and year that already exists replaces it; the old
          value is kept in the history. Nothing is saved until you confirm, and a file with any
          rejected row is not saved at all.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white"
          style={{ background: BRAND }}
        >
          {busy === 'reading' ? 'Reading…' : 'Choose file'}
          <input
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            disabled={busy !== null}
            onChange={(e) => {
              void onPick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        <button
          type="button"
          onClick={downloadTemplate}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Download template
        </button>
        {file && <span className="text-sm text-slate-500">{file.name}</span>}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {saved}
        </div>
      )}

      {preview && (
        <div className="space-y-5 rounded-xl border border-slate-200 bg-slate-50/60 p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Rows in file" value={preview.rowsInFile} />
            <Stat label="New" value={preview.added} tone="green" />
            <Stat label="Changed" value={preview.changed} />
            <Stat label="Unchanged" value={preview.unchanged} />
            <Stat label="Rejected" value={preview.rejected.length} tone="red" />
          </div>

          {preview.rejected.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-red-700">
                Rejected rows: fix these in the file and choose it again. Nothing can be saved until
                there are none.
              </h3>
              <ul className="max-h-60 overflow-auto rounded-lg border border-red-200 bg-white text-[12.5px]">
                {preview.rejected.map((p, i) => (
                  <li key={i} className="border-t border-red-100 px-3 py-1.5 first:border-0">
                    <span className="mr-2 tabular-nums text-slate-400">Line {p.line}</span>
                    {p.message}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(preview.warnings.length > 0 || preview.categoryNotes.length > 0) && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-amber-700">Check before saving</h3>
              <ul className="max-h-48 overflow-auto rounded-lg border border-amber-200 bg-white text-[12.5px]">
                {preview.categoryNotes.map((n, i) => (
                  <li
                    key={`c${i}`}
                    className="border-t border-amber-100 px-3 py-1.5 first:border-0"
                  >
                    Category: {n}
                  </li>
                ))}
                {preview.warnings.map((p, i) => (
                  <li
                    key={`w${i}`}
                    className="border-t border-amber-100 px-3 py-1.5 first:border-0"
                  >
                    <span className="mr-2 tabular-nums text-slate-400">Line {p.line}</span>
                    {p.message}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {preview.changes.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">
                Values that will change ({preview.changes.length})
              </h3>
              <LinesTable lines={preview.changes} showBefore />
            </section>
          )}

          {preview.additions.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">
                New values ({preview.added}
                {preview.added > preview.additions.length
                  ? `, first ${preview.additions.length} shown`
                  : ''}
                )
              </h3>
              <LinesTable lines={preview.additions} showBefore={false} />
            </section>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!canSave || busy !== null}
              onClick={() => void onSave()}
              className="rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: BRAND }}
            >
              {busy === 'saving' ? 'Saving…' : `Save ${preview.added + preview.changed} value(s)`}
            </button>
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setFile(null);
              }}
              className="text-sm text-slate-500 hover:text-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <summary className="cursor-pointer font-semibold text-slate-700">
          Accepted KPI names, countries and months
        </summary>
        <div className="mt-3 grid gap-6 md:grid-cols-3">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              KPI column
            </p>
            <ul className="space-y-0.5 font-mono text-[12px] text-slate-700">
              {KPIS.map((k) => (
                <li key={k.code}>
                  {k.code}
                  {k.frequency === 'quarterly' && (
                    <span className="ml-1 font-sans text-slate-400">(quarterly)</span>
                  )}
                  {k.ytd === 'entered' && (
                    <span className="ml-1 font-sans text-slate-400">(takes YTD)</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Country column
            </p>
            <p className="text-[12.5px] text-slate-600">
              {COUNTRIES.join(', ')}. The usual spellings (KSA, KSA LOCL, UAE - EOS, SSA…) are
              accepted and mapped as before.
            </p>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Month column
            </p>
            <p className="text-[12.5px] text-slate-600">
              January … December, Baseline, Target, and YTD (P&amp;L KPIs only). Quarterly KPIs take
              March, June, September and December only.
            </p>
          </div>
        </div>
      </details>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Upload history</h3>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-[12.5px]">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2">By</th>
                <th className="px-3 py-2 text-right">New</th>
                <th className="px-3 py-2 text-right">Changed</th>
                <th className="px-3 py-2 text-right">Unchanged</th>
              </tr>
            </thead>
            <tbody>
              {loads === null ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : (
                loads.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">
                      {new Date(l.loadedAt).toLocaleString('en-GB', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-3 py-1.5 text-slate-800">
                      {l.fileName}
                      {l.kind === 'initial-load' && (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                          initial load
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-slate-500">{l.loadedBy}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.rowsAdded}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.rowsChanged}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.rowsUnchanged}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
