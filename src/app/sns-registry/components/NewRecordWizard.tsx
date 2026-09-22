'use client';

import { STAGE1, STAGE2 } from '../lib/constants';
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  clsLabel,
  leafOf,
  money,
  nodeKey,
  nodePath,
  taxCategories,
  taxCommodities,
  taxFamilies,
  taxSubs,
} from '../lib/helpers';
import { formatDate, todayISO } from '../lib/date';
import SupplierPicker from './SupplierPicker';
import { uploadSnsRecordDocument } from '@/app/actions/sns-documents';
import type { RegistryApp } from '../lib/useRegistryApp';
import type { ScopeNode } from '../lib/types';
import { validateForSubmission } from '../lib/validate';

/** Shared chrome, so the wizard reads as the same family as the rest. */
const SECTION_TITLE = 'text-[14px] font-bold text-slate-900';
const SECTION_NOTE = 'mt-1 text-[12.5px] leading-relaxed text-slate-500';
const FIELD_LABEL = 'text-[10.5px] font-bold uppercase tracking-wider text-slate-400';
const RULE = 'my-6 h-px bg-slate-200';

function levelWord(level: 'Family' | 'Commodity', count: number): string {
  if (level === 'Family') return count > 1 ? 'families' : 'family';
  return count > 1 ? 'commodities' : 'commodity';
}

export default function NewRecordWizard({ app }: { app: RegistryApp }) {
  /* Held here rather than on the Draft: a Draft crosses the server-action
     boundary and must stay serialisable, and there is nothing to attach the
     file to until the insert has returned an rid.

     Declared before the early return below — a hook has to run in the same
     order on every render. */
  const [evidence, setEvidence] = useState<File | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  const d = app.draft;
  if (!d) return null;

  const step = app.step;
  const selKeys = d.nodes.map(nodeKey);
  const famMode = d.level === 'Family';
  const b = app.browse;

  const stepsSummary = [
    {
      label: 'Classification & Country',
      sub: d.country ? `${clsLabel(d.cls)} · ${d.country}` : 'Single or sole source',
    },
    {
      label: 'Taxonomy & Segment',
      sub: d.nodes.length
        ? `${d.nodes.length} ${levelWord(d.level, d.nodes.length)}`
        : 'Family or Commodity level',
    },
    { label: 'Supplier & Justification', sub: d.supplierName || 'One supplier per record' },
    { label: 'Review & Submit', sub: 'Check and route for validation' },
  ];

  const toggleNode = (node: ScopeNode) => app.toggleNode(node);

  const dup = app.records.find(
    (r) =>
      r.supplierId &&
      r.supplierId === d.supplierId &&
      r.country === d.country &&
      (r.base === 'Active' || r.base === 'Extended'),
  );

  /* The same rules the server applies, from the same module — the wizard is a
     convenience, not the gate. */
  const missing = validateForSubmission(d);

  const reviewFields = [
    { label: 'Classification', value: clsLabel(d.cls) },
    { label: 'Country / entity', value: d.country || 'Not set' },
    { label: 'Scope level', value: d.level },
    { label: 'Scope', value: d.nodes.map(leafOf).join(', ') || 'Not set' },
    { label: 'Segment tags', value: d.segments.join(', ') || 'Not set' },
    {
      label: 'Supplier',
      value: d.supplierName ? `${d.supplierId} — ${d.supplierName}` : 'Not set',
    },
    { label: 'Reason code', value: d.reason || 'Not set' },
    {
      label: 'Estimated annual spend',
      value: d.spend ? money(parseInt(String(d.spend).replace(/[^0-9]/g, ''), 10)) : 'Not set',
    },
    { label: 'Expiry date', value: d.expiry ? formatDate(d.expiry) : 'Not set' },
  ];

  const cats = new Set(d.nodes.map((n) => n.cat));
  const selectedScopeCount = `${d.nodes.length} ${famMode ? 'family' : 'commodity'}${d.nodes.length === 1 ? '' : ' lines'}${cats.size > 1 ? ` across ${cats.size} categories` : ''}`;

  /** Uploads the chosen evidence against the record once it exists. */
  const attachEvidence = async (rid: number): Promise<string | null> => {
    if (!evidence) return null;
    const form = new FormData();
    form.set('rid', String(rid));
    form.set('kind', 'evidence');
    form.set('file', evidence);
    const res = await uploadSnsRecordDocument(form);
    return res.success
      ? null
      : `The record was saved, but the evidence file was not attached: ${res.error ?? 'upload failed'}. Attach it from the record.`;
  };

  const submit = () => {
    if (missing.length) {
      app.setStep(4);
      return;
    }
    app.commit('Pending Level 1', attachEvidence);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-900">New Registry Record</h2>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-500">
          A record is scoped to one country and one supplier, at Family or Commodity level only.
        </p>
      </div>

      <div className="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        {stepsSummary.map((s, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => app.setStep(n)}
              className={`border-b-[3px] border-r border-r-slate-200 px-4 py-3.5 text-left transition-colors ${
                active
                  ? 'border-b-[#307c4c] bg-[#307c4c]/5'
                  : 'border-b-transparent bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold text-white ${
                    done ? 'bg-[#6AAF8E]' : active ? 'bg-[#307c4c]' : 'bg-slate-300'
                  }`}
                >
                  {n}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block truncate text-[12.5px] font-bold ${
                      active ? 'text-[#1d4f31]' : 'text-slate-700'
                    }`}
                  >
                    {s.label}
                  </span>
                  <span className="block truncate text-[11px] text-slate-400">{s.sub}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
        {step === 1 && (
          <div>
            <h3 className={SECTION_TITLE}>Classification</h3>
            <p className={`${SECTION_NOTE} max-w-3xl`}>
              These two record types are kept structurally separate: different reason codes,
              different evidence requirements.
            </p>
            <div className="mt-3.5 grid max-w-4xl gap-3.5 lg:grid-cols-2">
              {[
                {
                  code: 'SGL' as const,
                  title: 'Single-Source',
                  kind: 'A business decision — justification-based',
                  body: 'Alternative suppliers exist, but NESR has chosen to procure from one vendor only: standardization, an active master agreement, warranty preservation, or a strategic relationship.',
                  evidence:
                    'Justification required: the business rationale for restricting sourcing, not proof that no alternative exists.',
                },
                {
                  code: 'SOL' as const,
                  title: 'Sole-Source',
                  kind: 'A market condition — evidence-based',
                  body: 'Only one supplier is capable of fulfilling the requirement in that country: patented technology, an OEM part, a sole licensed distributor, or a regulatory restriction.',
                  evidence:
                    'Evidence required: market check, OEM confirmation, or similar proof that no viable alternative exists.',
                },
              ].map((c) => {
                const sel = d.cls === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => app.setDraft({ cls: c.code, reason: '' })}
                    className={`rounded-xl border-2 px-4 py-4 text-left transition-colors ${
                      sel
                        ? 'border-[#307c4c] bg-[#307c4c]/5'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                          sel ? 'border-[#307c4c] bg-[#307c4c]' : 'border-slate-300 bg-white'
                        }`}
                      />
                      <span className="text-[14px] font-bold text-slate-900">{c.title}</span>
                      <span className="rounded bg-[#307c4c]/15 px-1.5 py-px font-mono text-[11px] font-bold text-[#1d4f31]">
                        {c.code}
                      </span>
                    </div>
                    <p className="mt-2.5 text-[12px] font-bold text-[#307c4c]">{c.kind}</p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-slate-800">{c.body}</p>
                    <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
                      {c.evidence}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className={RULE} />
            <h3 className={SECTION_TITLE}>Country / entity scope</h3>
            <p className={SECTION_NOTE}>
              One country from the confirmed list, or Global for cases that apply across all
              entities.
            </p>
            <div className="mt-3 flex max-w-4xl flex-wrap gap-2">
              {app.countries
                .filter((c) => app.canActOn(c[1]))
                .map((c) => {
                  const sel = d.country === c[0];
                  return (
                    <button
                      key={c[0]}
                      type="button"
                      onClick={() => app.setDraft({ country: c[0] })}
                      className={`rounded-lg border px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                        sel
                          ? 'border-[#307c4c] bg-[#307c4c] text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-[#307c4c]/40'
                      }`}
                    >
                      {c[0]} · {c[1]}
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h3 className={SECTION_TITLE}>Taxonomy scope</h3>
                <p className={`${SECTION_NOTE} max-w-3xl`}>
                  Spend Type › Category › Sub-Category › Family › Commodity. Records are raised at
                  Family or Commodity level only. A selected group may span multiple Categories,
                  provided Country and Supplier are the same.
                </p>
              </div>
              <div className="flex shrink-0 overflow-hidden rounded-lg border border-[#307c4c]">
                {(['Family', 'Commodity'] as const).map((l) => {
                  const sel = d.level === l;
                  return (
                    <button
                      key={l}
                      type="button"
                      onClick={() => app.setLevel(l)}
                      className={`px-4 py-2 text-[12px] font-bold transition-colors ${
                        sel ? 'bg-[#307c4c] text-white' : 'bg-white text-[#307c4c]'
                      }`}
                    >
                      Raise at {l} level
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <TaxColumn title="Category" hint="reference only">
                {taxCategories(app.tax).map((c) => (
                  <TaxItem
                    key={c.name}
                    label={c.name}
                    meta={c.spend}
                    active={b.cat === c.name}
                    onClick={() =>
                      app.setBrowse({
                        cat: c.name,
                        sub: taxSubs(app.tax, c.name)[0] || '',
                        fam: '',
                      })
                    }
                  />
                ))}
              </TaxColumn>
              <TaxColumn title="Sub-category" hint="reference only">
                {taxSubs(app.tax, b.cat).map((s) => (
                  <TaxItem
                    key={s}
                    label={s}
                    active={b.sub === s}
                    onClick={() => app.setBrowse({ cat: b.cat, sub: s, fam: '' })}
                  />
                ))}
              </TaxColumn>
              <TaxColumn title="Family" hint={famMode ? 'selectable' : 'drill down'} on={famMode}>
                {taxFamilies(app.tax, b.cat, b.sub).map((f) => {
                  const node: ScopeNode = { cat: b.cat, sub: b.sub, fam: f, com: '' };
                  const on = selKeys.includes(nodeKey(node));
                  return (
                    <TaxItem
                      key={f}
                      label={f}
                      meta={famMode ? '' : String(taxCommodities(app.tax, b.cat, b.sub, f).length)}
                      active={b.fam === f && !famMode}
                      checked={famMode ? on : undefined}
                      onClick={() =>
                        famMode
                          ? toggleNode(node)
                          : app.setBrowse({ cat: b.cat, sub: b.sub, fam: f })
                      }
                    />
                  );
                })}
              </TaxColumn>
              <TaxColumn
                title="Commodity"
                hint={famMode ? 'not selectable' : 'selectable'}
                on={!famMode}
              >
                {taxCommodities(app.tax, b.cat, b.sub, b.fam).map((cm) => {
                  const node: ScopeNode = { cat: b.cat, sub: b.sub, fam: b.fam, com: cm };
                  const on = selKeys.includes(nodeKey(node));
                  return (
                    <TaxItem
                      key={cm}
                      label={cm}
                      dim={famMode}
                      checked={!famMode ? on : undefined}
                      onClick={() => {
                        if (!famMode) toggleNode(node);
                      }}
                    />
                  );
                })}
              </TaxColumn>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5">
              <p className={`${FIELD_LABEL} mb-2`}>Selected scope — {selectedScopeCount}</p>
              <div className="flex flex-wrap gap-2">
                {d.nodes.map((n) => (
                  <div
                    key={nodeKey(n)}
                    className="flex items-center gap-2 rounded-lg border border-[#6AAF8E] bg-white py-1.5 pl-3 pr-1.5 text-[12px]"
                  >
                    <div>
                      <div className="font-bold text-slate-800">{leafOf(n)}</div>
                      <div className="text-[10.5px] text-slate-500">
                        {nodePath(n).replace(/ › $/, '')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => app.removeNode(n)}
                      aria-label={`Remove ${leafOf(n)}`}
                      className="h-5 w-5 shrink-0 rounded bg-slate-100 font-bold text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              {d.nodes.length === 0 && (
                <p className="text-[12px] text-slate-500">
                  Nothing selected yet. Drill down and tick one or more{' '}
                  {famMode ? 'Families' : 'Commodities'}.
                </p>
              )}
            </div>

            <div className={RULE} />
            <h3 className={SECTION_TITLE}>Business segment tags</h3>
            <p className={SECTION_NOTE}>
              Tagged in addition to the taxonomy path. One or more of the confirmed NESR business
              segments.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {app.segments.map((s) => {
                const on = d.segments.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      app.setDraft({
                        segments: on ? d.segments.filter((x) => x !== s) : d.segments.concat([s]),
                      })
                    }
                    className={`rounded-lg border px-3 py-1.5 text-[12px] font-bold transition-colors ${
                      on
                        ? 'border-[#307c4c] bg-[#307c4c]/15 text-[#1d4f31]'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-[#307c4c]/40'
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <div>
              <h3 className={SECTION_TITLE}>Supplier</h3>
              <p className={SECTION_NOTE}>
                Chosen from the approved vendor list, so the SAP ID and name always agree with each
                other. One supplier per record.
              </p>
              <div className="mt-3.5 flex max-w-[420px] flex-col gap-3.5">
                <SupplierPicker
                  sapId={d.supplierId}
                  name={d.supplierName}
                  onPick={(o) => app.setDraft({ supplierId: o.sapId, supplierName: o.name })}
                  onClear={() => app.setDraft({ supplierId: '', supplierName: '' })}
                />
                <Field
                  label="Estimated annual spend (USD)"
                  value={d.spend}
                  placeholder="e.g. 1250000"
                  onChange={(v) => app.setDraft({ spend: v })}
                />
                <Field
                  label="Expiry date"
                  type="date"
                  min={todayISO()}
                  value={d.expiry}
                  placeholder="YYYY-MM-DD"
                  onChange={(v) => app.setDraft({ expiry: v })}
                  hint="The Registry ID is built from this date, so it cannot be issued without one."
                />
              </div>
              {!!dup && (
                <div className="mt-4 max-w-[420px] rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-amber-700">
                    Possible duplicate
                  </p>
                  <p className="text-[12.5px] leading-relaxed text-amber-900">
                    An active record already exists for this supplier in {d.country} (
                    {dup.id || 'pending'}, {dup.nodes.map(leafOf).join(', ')}). Check whether the
                    existing ID already covers your requirement.
                  </p>
                </div>
              )}
            </div>

            <div>
              <h3 className={SECTION_TITLE}>Reason code</h3>
              <p className={SECTION_NOTE}>
                {d.cls === 'SGL'
                  ? 'Single-source reason codes describe why NESR has restricted sourcing to one vendor.'
                  : 'Sole-source reason codes describe why no alternative supplier exists.'}
              </p>
              <div className="mt-3.5 flex max-w-[460px] flex-col gap-2">
                {app.reasons[d.cls].map((r) => {
                  const sel = d.reason === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => app.setDraft({ reason: r })}
                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        sel
                          ? 'border-[#307c4c] bg-[#307c4c]/5'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span
                        className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                          sel ? 'border-[#307c4c] bg-[#307c4c]' : 'border-slate-300 bg-white'
                        }`}
                      />
                      <span className="text-[12.5px] font-bold text-slate-800">{r}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="mb-5 mt-1 h-px bg-slate-200" />
              <h3 className={SECTION_TITLE}>Justification narrative</h3>
              <p className={SECTION_NOTE}>
                {d.cls === 'SGL'
                  ? 'State the business rationale for restricting sourcing to this vendor.'
                  : 'State the market condition and how it was verified.'}
              </p>
              <textarea
                value={d.justification}
                onChange={(e) => app.setDraft({ justification: e.target.value })}
                placeholder="State the business case or technical rationale. Keep sentences to 25 words."
                className="mt-2.5 min-h-[120px] w-full max-w-[920px] resize-y rounded-lg border border-slate-200 p-3 text-[13px] leading-relaxed outline-none transition-colors focus:border-[#307c4c]"
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h3 className={SECTION_TITLE}>Evidence attachment</h3>
            <p className={`${SECTION_NOTE} max-w-3xl`}>
              {d.cls === 'SGL'
                ? 'The contract clause, warranty terms, or equivalent support for the business rationale.'
                : 'The market survey, OEM letter, or equivalent proof that no viable alternative exists.'}
            </p>
            <div className="mt-3 flex max-w-[560px] flex-wrap items-center gap-4 rounded-xl border-2 border-dashed border-[#6AAF8E] bg-[#307c4c]/5 p-5">
              <span
                className={`flex h-[42px] w-[34px] shrink-0 items-center justify-center rounded text-[9px] font-bold text-white ${
                  evidence ? 'bg-[#307c4c]' : 'bg-slate-300'
                }`}
              >
                DOC
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-[13px] font-bold text-slate-800">
                  {evidence ? evidence.name : 'No file attached'}
                </p>
                <p className="mt-0.5 text-[11.5px] text-slate-500">
                  {evidence
                    ? `${Math.max(1, Math.round(evidence.size / 1024))} KB — uploaded when the record is saved.`
                    : 'PDF, DOCX, XLSX or MSG, up to 1 MB. Kept on the record for audit.'}
                </p>
              </div>
              {evidence && (
                <button
                  type="button"
                  onClick={() => setEvidence(null)}
                  className="shrink-0 text-[11.5px] font-semibold text-[#307c4c] underline underline-offset-2 hover:no-underline"
                >
                  Remove
                </button>
              )}
              <label className="shrink-0 cursor-pointer rounded-lg bg-gradient-to-r from-[#307c4c] to-[#2b6f44] px-3.5 py-2 text-[12px] font-semibold text-white shadow-sm shadow-[#307c4c]/30 transition-opacity hover:opacity-90">
                <span>{evidence ? 'Replace' : 'Choose file'}</span>
                <input
                  type="file"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    // Checked again on the server — this is only so an oversized
                    // file is rejected before the record is submitted, rather
                    // than after it has already been created.
                    if (f && f.size > 1024 * 1024) {
                      setEvidenceError(
                        `That file is ${(f.size / (1024 * 1024)).toFixed(1)} MB. Attachments are limited to 1 MB.`,
                      );
                      setEvidence(null);
                      e.target.value = '';
                      return;
                    }
                    setEvidenceError(null);
                    setEvidence(f);
                  }}
                  className="hidden"
                />
              </label>
            </div>

            {evidenceError && (
              <p className="mt-2.5 max-w-[560px] rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700">
                {evidenceError}
              </p>
            )}

            <div className={RULE} />
            <h3 className={`${SECTION_TITLE} mb-3`}>Review before submission</h3>
            <div className="grid max-w-[1000px] overflow-hidden rounded-xl border border-slate-200 sm:grid-cols-2 xl:grid-cols-3">
              {reviewFields.map((f) => (
                <div key={f.label} className="border-b border-r border-slate-100 px-4 py-3">
                  <p className={FIELD_LABEL}>{f.label}</p>
                  <p
                    className={`mt-0.5 break-words text-[12.5px] ${
                      /Not (set|attached)/.test(f.value) ? 'text-red-600' : 'text-slate-800'
                    }`}
                  >
                    {f.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 max-w-[1000px] rounded-r-xl border-l-4 border-[#307c4c] bg-slate-50 px-4 py-3.5 text-[12.5px] leading-relaxed text-slate-700">
              On submission this record is routed to the {STAGE1} for{' '}
              {d.country || 'the selected country'}, then to the {STAGE2} for final sign-off. The
              Registry ID is generated only when the record is published to Active, and is valid for
              a fixed 12 months from issue date.
            </div>

            {missing.length > 0 && (
              <div className="mt-4 max-w-[1000px] rounded-xl border border-red-200 bg-red-50 px-3.5 py-3">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-red-700">
                  Incomplete
                </p>
                <p className="text-[12.5px] leading-relaxed text-red-900">
                  Still required before submission: {missing.join(', ')}.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={app.cancelDraft}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-red-200 hover:text-red-600"
          >
            Discard
          </button>
          <div className="flex flex-wrap gap-2.5">
            {step > 1 && (
              <button
                type="button"
                onClick={() => app.setStep(Math.max(1, step - 1))}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-[#307c4c]/30 hover:text-[#307c4c]"
              >
                Back
              </button>
            )}
            {step < 4 && (
              <button
                type="button"
                onClick={() => app.setStep(Math.min(4, step + 1))}
                className="rounded-lg bg-gradient-to-r from-[#307c4c] to-[#2b6f44] px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm shadow-[#307c4c]/30 transition-opacity hover:opacity-90"
              >
                Continue
              </button>
            )}
            {step === 4 && (
              <button
                type="button"
                onClick={() => app.commit('Draft', attachEvidence)}
                disabled={app.busy}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-[#307c4c]/30 hover:text-[#307c4c] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save as Draft
              </button>
            )}
            {step === 4 && (
              <button
                type="button"
                onClick={submit}
                disabled={app.busy}
                className="rounded-lg bg-gradient-to-r from-[#307c4c] to-[#2b6f44] px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm shadow-[#307c4c]/30 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {app.busy ? 'Submitting…' : `Submit for ${STAGE1} validation`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
  type = 'text',
  min,
  hint,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  type?: string;
  min?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={FIELD_LABEL}>{label}</label>
      <input
        type={type}
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none transition-colors focus:border-[#307c4c]"
      />
      {hint && <span className="text-[11px] leading-relaxed text-slate-400">{hint}</span>}
    </div>
  );
}

function TaxColumn({
  title,
  hint,
  on,
  children,
}: {
  title: string;
  hint: string;
  /** Whether this column is the one you can tick at the current level. */
  on?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[300px] flex-col overflow-hidden rounded-xl border border-slate-200">
      <div className="flex justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-3 py-2">
        <span className={FIELD_LABEL}>{title}</span>
        <span
          className={`text-[10.5px] font-bold uppercase tracking-wider ${
            on ? 'text-[#307c4c]' : 'text-slate-400'
          }`}
        >
          {hint}
        </span>
      </div>
      <div className="max-h-[340px] overflow-auto">{children}</div>
    </div>
  );
}

function TaxItem({
  label,
  meta,
  active,
  checked,
  dim,
  onClick,
}: {
  label: string;
  meta?: string;
  active?: boolean;
  checked?: boolean;
  dim?: boolean;
  onClick: () => void;
}) {
  const bg = active ? 'bg-[#307c4c]/15' : checked ? 'bg-[#307c4c]/5' : 'bg-white hover:bg-slate-50';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left text-[12px] transition-colors ${bg} ${
        dim ? 'text-slate-400' : 'text-slate-800'
      }`}
    >
      {checked !== undefined && (
        <span
          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border-[1.5px] text-[10px] font-bold text-white ${
            checked ? 'border-[#307c4c] bg-[#307c4c]' : 'border-slate-300 bg-white'
          }`}
        >
          {checked ? '✓' : ''}
        </span>
      )}
      <span className="flex-1">{label}</span>
      {meta && <span className="shrink-0 text-[11px] text-slate-400">{meta}</span>}
    </button>
  );
}
