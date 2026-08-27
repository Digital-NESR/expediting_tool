'use client';

import type { ReactNode } from 'react';
import { clsLabel, leafOf, money, nodeKey, nodePath, taxCategories, taxCommodities, taxFamilies, taxSubs } from '../lib/helpers';
import type { RegistryApp } from '../lib/useRegistryApp';
import type { ScopeNode } from '../lib/types';

function levelWord(level: 'Family' | 'Commodity', count: number): string {
  if (level === 'Family') return count > 1 ? 'families' : 'family';
  return count > 1 ? 'commodities' : 'commodity';
}

export default function NewRecordWizard({ app }: { app: RegistryApp }) {
  const d = app.draft;
  if (!d) return null;

  const step = app.step;
  const selKeys = d.nodes.map(nodeKey);
  const famMode = d.level === 'Family';
  const b = app.browse;

  const stepsSummary = [
    { label: 'Classification & Country', sub: d.country ? `${clsLabel(d.cls)} · ${d.country}` : 'Single or sole source' },
    { label: 'Taxonomy & Segment', sub: d.nodes.length ? `${d.nodes.length} ${levelWord(d.level, d.nodes.length)}` : 'Family or Commodity level' },
    { label: 'Supplier & Justification', sub: d.supplierName || 'One supplier per record' },
    { label: 'Evidence & Review', sub: d.evidence || 'Attach and submit' },
  ];

  const toggleNode = (node: ScopeNode) => app.toggleNode(node);

  const dup = app.records.find((r) => r.supplierId && r.supplierId === d.supplierId && r.country === d.country && (r.base === 'Active' || r.base === 'Extended'));

  const missing: string[] = [];
  if (!d.country) missing.push('country');
  if (!d.nodes.length) missing.push('taxonomy scope');
  if (!d.segments.length) missing.push('at least one segment tag');
  if (!d.supplierId || !d.supplierName) missing.push('supplier SAP ID and name');
  if (!d.reason) missing.push('reason code');
  if (!d.justification.trim()) missing.push('justification narrative');
  if (!d.evidence) missing.push('evidence attachment');

  const reviewFields = [
    { label: 'CLASSIFICATION', value: clsLabel(d.cls) },
    { label: 'COUNTRY / ENTITY', value: d.country || 'Not set' },
    { label: 'SCOPE LEVEL', value: d.level },
    { label: 'SCOPE', value: d.nodes.map(leafOf).join(', ') || 'Not set' },
    { label: 'SEGMENT TAGS', value: d.segments.join(', ') || 'Not set' },
    { label: 'SUPPLIER', value: d.supplierName ? `${d.supplierId} — ${d.supplierName}` : 'Not set' },
    { label: 'REASON CODE', value: d.reason || 'Not set' },
    { label: 'ESTIMATED ANNUAL SPEND', value: d.spend ? money(parseInt(String(d.spend).replace(/[^0-9]/g, ''), 10)) : 'Not set' },
    { label: 'EVIDENCE', value: d.evidence || 'Not attached' },
  ];

  const cats = new Set(d.nodes.map((n) => n.cat));
  const selectedScopeCount = `${d.nodes.length} ${famMode ? 'FAMILY' : 'COMMODITY'}${d.nodes.length === 1 ? '' : ' LINES'}${cats.size > 1 ? ` ACROSS ${cats.size} CATEGORIES` : ''}`;

  const submit = () => {
    if (missing.length) {
      app.setStep(4);
      return;
    }
    app.commit('Pending Level 1');
  };

  return (
    <div>
      <div style={{ borderLeft: '4px solid #2A7E4F', paddingLeft: 12, marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 'bold' }}>New Registry Record</h1>
        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#58595B' }}>A record is scoped to one country and one supplier, at Family or Commodity level only.</p>
      </div>

      <div style={{ display: 'flex', marginBottom: 18, background: '#fff', border: '1px solid #E4E6E6' }}>
        {stepsSummary.map((s, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          return (
            <div key={s.label} onClick={() => app.setStep(n)} style={{ flex: 1, padding: '14px 18px', borderRight: '1px solid #E4E6E6', borderBottom: `3px solid ${active ? '#2A7E4F' : 'transparent'}`, cursor: 'pointer', background: active ? '#F2F8F5' : '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: done ? '#6AAF8E' : active ? '#2A7E4F' : '#D1D3D4', color: '#fff', fontSize: 11.5, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 'bold', color: active ? '#1D5B39' : '#1F1F1D' }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: '#58595B' }}>{s.sub}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E4E6E6', padding: '22px 24px' }}>
        {step === 1 && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 4 }}>Classification</div>
            <div style={{ fontSize: 12.5, color: '#58595B', marginBottom: 14, maxWidth: 760 }}>These two record types are kept structurally separate: different reason codes, different evidence requirements.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 900 }}>
              {[
                { code: 'SGL' as const, title: 'Single-Source', kind: 'A market condition — evidence-based', body: 'Only one supplier is capable of fulfilling the requirement in that country: patented technology, an OEM part, a sole licensed distributor, or a regulatory restriction.', evidence: 'Evidence required: market check, OEM confirmation, or similar proof that no viable alternative exists.' },
                { code: 'SOL' as const, title: 'Sole-Source', kind: 'A business decision — justification-based', body: 'Alternative suppliers exist, but NESR has chosen to procure from one vendor only: standardization, an active master agreement, warranty preservation, or a strategic relationship.', evidence: 'Justification required: the business rationale for restricting sourcing, not proof that no alternative exists.' },
              ].map((c) => {
                const sel = d.cls === c.code;
                return (
                  <div key={c.code} onClick={() => app.setDraft({ cls: c.code, reason: '' })} style={{ border: `2px solid ${sel ? '#2A7E4F' : '#E4E6E6'}`, background: sel ? '#F5FAF7' : '#fff', padding: '16px 18px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${sel ? '#2A7E4F' : '#D1D3D4'}`, background: sel ? '#2A7E4F' : '#fff' }} />
                      <div style={{ fontSize: 14, fontWeight: 'bold' }}>{c.title}</div>
                      <div style={{ fontFamily: 'Consolas,Menlo,monospace', fontSize: 11, fontWeight: 'bold', color: '#1D5B39', background: '#C5E0D2', padding: '2px 6px' }}>{c.code}</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 'bold', color: '#2A7E4F', marginTop: 10 }}>{c.kind}</div>
                    <div style={{ fontSize: 12.5, color: '#1F1F1D', lineHeight: 1.55, marginTop: 4 }}>{c.body}</div>
                    <div style={{ fontSize: 11.5, color: '#58595B', lineHeight: 1.5, marginTop: 8 }}>{c.evidence}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ height: 1, background: '#E4E6E6', margin: '22px 0' }} />
            <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 4 }}>Country / entity scope</div>
            <div style={{ fontSize: 12.5, color: '#58595B', marginBottom: 12 }}>One country from the confirmed list, or Global for cases that apply across all entities.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 900 }}>
              {app.countries.filter((c) => app.canActOn(c[0])).map((c) => {
                const sel = d.country === c[0];
                return (
                  <button key={c[0]} onClick={() => app.setDraft({ country: c[0] })} style={{ border: `1px solid ${sel ? '#2A7E4F' : '#D1D3D4'}`, background: sel ? '#2A7E4F' : '#fff', color: sel ? '#fff' : '#1F1F1D', fontSize: 12.5, fontWeight: 'bold', padding: '8px 13px', borderRadius: 2, cursor: 'pointer' }}>
                    {c[0]} &middot; {c[1]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 4 }}>Taxonomy scope</div>
                <div style={{ fontSize: 12.5, color: '#58595B', maxWidth: 720 }}>Spend Type &#8250; Category &#8250; Sub-Category &#8250; Family &#8250; Commodity. Records are raised at Family or Commodity level only. A selected group may span multiple Categories, provided Country and Supplier are the same.</div>
              </div>
              <div style={{ display: 'flex', border: '1px solid #2A7E4F' }}>
                {(['Family', 'Commodity'] as const).map((l) => {
                  const sel = d.level === l;
                  return (
                    <button key={l} onClick={() => app.setLevel(l)} style={{ border: 0, background: sel ? '#2A7E4F' : '#fff', color: sel ? '#fff' : '#2A7E4F', fontSize: 12, fontWeight: 'bold', padding: '9px 16px', cursor: 'pointer' }}>
                      Raise at {l} level
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 16 }}>
              <TaxColumn title="CATEGORY" hint="reference only" hintColor="#8A8C8E">
                {taxCategories(app.tax).map((c) => (
                  <TaxItem key={c.name} label={c.name} meta={c.spend} active={b.cat === c.name} onClick={() => app.setBrowse({ cat: c.name, sub: taxSubs(app.tax, c.name)[0] || '', fam: '' })} />
                ))}
              </TaxColumn>
              <TaxColumn title="SUB-CATEGORY" hint="reference only" hintColor="#8A8C8E">
                {taxSubs(app.tax, b.cat).map((s) => (
                  <TaxItem key={s} label={s} active={b.sub === s} onClick={() => app.setBrowse({ cat: b.cat, sub: s, fam: '' })} />
                ))}
              </TaxColumn>
              <TaxColumn title="FAMILY" hint={famMode ? 'selectable' : 'drill down'} hintColor={famMode ? '#2A7E4F' : '#8A8C8E'}>
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
                      onClick={() => (famMode ? toggleNode(node) : app.setBrowse({ cat: b.cat, sub: b.sub, fam: f }))}
                    />
                  );
                })}
              </TaxColumn>
              <TaxColumn title="COMMODITY" hint={famMode ? 'not selectable' : 'selectable'} hintColor={famMode ? '#8A8C8E' : '#2A7E4F'}>
                {taxCommodities(app.tax, b.cat, b.sub, b.fam).map((cm) => {
                  const node: ScopeNode = { cat: b.cat, sub: b.sub, fam: b.fam, com: cm };
                  const on = selKeys.includes(nodeKey(node));
                  return (
                    <TaxItem
                      key={cm}
                      label={cm}
                      dim={famMode}
                      checked={!famMode ? on : undefined}
                      onClick={() => { if (!famMode) toggleNode(node); }}
                    />
                  );
                })}
              </TaxColumn>
            </div>

            <div style={{ marginTop: 16, border: '1px solid #E4E6E6', background: '#FAFBFA', padding: '14px 16px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.6, marginBottom: 9 }}>SELECTED SCOPE &#8212; {selectedScopeCount}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {d.nodes.map((n) => (
                  <div key={nodeKey(n)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #6AAF8E', padding: '6px 8px 6px 11px', fontSize: 12 }}>
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{leafOf(n)}</div>
                      <div style={{ fontSize: 10.5, color: '#58595B' }}>{nodePath(n).replace(/ › $/, '')}</div>
                    </div>
                    <button onClick={() => app.removeNode(n)} style={{ border: 0, background: '#F4F5F5', color: '#58595B', width: 20, height: 20, cursor: 'pointer', fontWeight: 'bold', borderRadius: 2 }}>&#215;</button>
                  </div>
                ))}
              </div>
              {d.nodes.length === 0 && (
                <div style={{ fontSize: 12, color: '#58595B' }}>Nothing selected yet. Drill down and tick one or more {famMode ? 'Families' : 'Commodities'}.</div>
              )}
            </div>

            <div style={{ height: 1, background: '#E4E6E6', margin: '22px 0' }} />
            <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 4 }}>Business segment tags</div>
            <div style={{ fontSize: 12.5, color: '#58595B', marginBottom: 12 }}>Tagged in addition to the taxonomy path. One or more of the confirmed NESR business segments.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {app.segments.map((s) => {
                const on = d.segments.includes(s);
                return (
                  <button key={s} onClick={() => app.setDraft({ segments: on ? d.segments.filter((x) => x !== s) : d.segments.concat([s]) })} style={{ border: `1px solid ${on ? '#2A7E4F' : '#D1D3D4'}`, background: on ? '#C5E0D2' : '#fff', color: on ? '#1D5B39' : '#58595B', fontSize: 12, fontWeight: 'bold', padding: '7px 12px', borderRadius: 2, cursor: 'pointer' }}>
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 26, alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 4 }}>Supplier</div>
              <div style={{ fontSize: 12.5, color: '#58595B', marginBottom: 14 }}>Supplier SAP ID and SAP Name are both mandatory. One supplier per record.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
                <Field label="SUPPLIER SAP ID" value={d.supplierId} placeholder="e.g. 1004521" onChange={(v) => app.setDraft({ supplierId: v })} />
                <Field label="SUPPLIER SAP NAME" value={d.supplierName} placeholder="Legal name as held in SAP" onChange={(v) => app.setDraft({ supplierName: v })} />
                <Field label="ESTIMATED ANNUAL SPEND (USD)" value={d.spend} placeholder="e.g. 1250000" onChange={(v) => app.setDraft({ spend: v })} />
              </div>
              {!!dup && (
                <div style={{ marginTop: 16, border: '1px solid #E8B96A', background: '#FEF6E7', padding: '12px 14px', maxWidth: 420 }}>
                  <div style={{ fontSize: 11, fontWeight: 'bold', color: '#8A6100', letterSpacing: 0.5, marginBottom: 5 }}>POSSIBLE DUPLICATE</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                    An active record already exists for this supplier in {d.country} ({dup.id || 'pending'}, {dup.nodes.map(leafOf).join(', ')}). Check whether the existing ID already covers your requirement.
                  </div>
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 4 }}>Reason code</div>
              <div style={{ fontSize: 12.5, color: '#58595B', marginBottom: 14 }}>
                {d.cls === 'SGL' ? 'Single-source reason codes describe why no alternative supplier exists.' : 'Sole-source reason codes describe why NESR has restricted sourcing to one vendor.'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 460 }}>
                {app.reasons[d.cls].map((r) => {
                  const sel = d.reason === r;
                  return (
                    <div key={r} onClick={() => app.setDraft({ reason: r })} style={{ border: `1px solid ${sel ? '#2A7E4F' : '#E4E6E6'}`, background: sel ? '#F5FAF7' : '#fff', padding: '11px 13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${sel ? '#2A7E4F' : '#D1D3D4'}`, background: sel ? '#2A7E4F' : '#fff', flex: '0 0 auto' }} />
                      <div style={{ fontSize: 12.5, fontWeight: 'bold' }}>{r}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ height: 1, background: '#E4E6E6', margin: '4px 0 20px' }} />
              <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 4 }}>Justification narrative</div>
              <div style={{ fontSize: 12.5, color: '#58595B', marginBottom: 10 }}>
                {d.cls === 'SGL' ? 'State the market condition and how it was verified.' : 'State the business rationale for restricting sourcing to this vendor.'}
              </div>
              <textarea
                value={d.justification}
                onChange={(e) => app.setDraft({ justification: e.target.value })}
                placeholder="State the business case or technical rationale. Keep sentences to 25 words."
                style={{ width: '100%', maxWidth: 920, minHeight: 120, border: '1px solid #D1D3D4', padding: 11, resize: 'vertical', lineHeight: 1.55 }}
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 4 }}>Evidence attachment</div>
            <div style={{ fontSize: 12.5, color: '#58595B', marginBottom: 12 }}>
              {d.cls === 'SGL' ? 'Market survey, OEM letter, or equivalent proof that no viable alternative exists.' : 'Contract clause, warranty terms, or equivalent support for the business rationale.'}
            </div>
            <div style={{ border: '2px dashed #6AAF8E', background: '#F7FBF9', padding: 20, maxWidth: 560, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 34, height: 42, background: '#2A7E4F', color: '#fff', fontSize: 9, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>DOC</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 'bold' }}>{d.evidence || 'No file attached'}</div>
                <div style={{ fontSize: 11.5, color: '#58595B', marginTop: 3 }}>PDF, DOCX, XLSX or MSG. Retained on the record for audit reference.</div>
              </div>
              <label style={{ background: '#2A7E4F', color: '#fff', fontWeight: 'bold', fontSize: 12, padding: '9px 14px', cursor: 'pointer', borderRadius: 2, flex: '0 0 auto' }}>
                <span>Choose file</span>
                <input type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) app.setDraft({ evidence: f.name }); }} style={{ display: 'none' }} />
              </label>
            </div>

            <div style={{ height: 1, background: '#E4E6E6', margin: '24px 0' }} />
            <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 12 }}>Review before submission</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid #E4E6E6', maxWidth: 1000 }}>
              {reviewFields.map((f) => (
                <div key={f.label} style={{ padding: '12px 16px', borderBottom: '1px solid #F0F1F1', borderRight: '1px solid #F0F1F1' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.5 }}>{f.label}</div>
                  <div style={{ fontSize: 12.5, marginTop: 4, color: /Not (set|attached)/.test(f.value) ? '#9B1C1C' : '#1F1F1D' }}>{f.value}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 18, background: '#F7F9F8', borderLeft: '4px solid #2A7E4F', padding: '14px 16px', maxWidth: 1000 }}>
              <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                On submission this record is routed to the Country Supply Chain Manager for {d.country || 'the selected country'} (Level 1), then to the Category Manager or Supply Chain Director (Level 2). The Registry ID is generated only when the record is published to Active, and is valid for a fixed 12 months from issue date.
              </div>
            </div>

            {missing.length > 0 && (
              <div style={{ marginTop: 16, border: '1px solid #E4A0A0', background: '#FCF4F4', padding: '12px 14px', maxWidth: 1000 }}>
                <div style={{ fontSize: 11, fontWeight: 'bold', color: '#9B1C1C', letterSpacing: 0.5, marginBottom: 5 }}>INCOMPLETE</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>Still required before submission: {missing.join(', ')}.</div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 26, paddingTop: 18, borderTop: '1px solid #E4E6E6' }}>
          <button onClick={app.cancelDraft} className="btn-neutral" style={{ padding: '10px 16px' }}>Discard</button>
          <div style={{ display: 'flex', gap: 10 }}>
            {step > 1 && <button onClick={() => app.setStep(Math.max(1, step - 1))} className="btn-outline" style={{ padding: '10px 18px' }}>Back</button>}
            {step < 4 && <button onClick={() => app.setStep(Math.min(4, step + 1))} className="btn-primary" style={{ padding: '10px 22px' }}>Continue</button>}
            {step === 4 && <button onClick={() => app.commit('Draft')} disabled={app.busy} className="btn-outline" style={{ padding: '10px 18px' }}>Save as Draft</button>}
            {step === 4 && <button onClick={submit} disabled={app.busy} className="btn-primary" style={{ padding: '10px 22px' }}>{app.busy ? 'Submitting…' : 'Submit for Level 1 Validation'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.6 }}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ border: '1px solid #D1D3D4', padding: '9px 10px', borderRadius: 2 }} />
    </div>
  );
}

function TaxColumn({ title, hint, hintColor, children }: { title: string; hint: string; hintColor: string; children: ReactNode }) {
  return (
    <div style={{ border: '1px solid #E4E6E6', display: 'flex', flexDirection: 'column', minHeight: 300 }}>
      <div style={{ background: '#F7F9F8', borderBottom: '1px solid #E4E6E6', padding: '8px 11px', fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.6, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>{title}</span>
        <span style={{ color: hintColor }}>{hint}</span>
      </div>
      <div style={{ overflow: 'auto', maxHeight: 340 }}>{children}</div>
    </div>
  );
}

function TaxItem({ label, meta, active, checked, dim, onClick }: { label: string; meta?: string; active?: boolean; checked?: boolean; dim?: boolean; onClick: () => void }) {
  const bg = active ? '#C5E0D2' : checked ? '#EDF5F0' : '#fff';
  return (
    <div onClick={onClick} className="taxonomy-item" style={{ padding: '8px 11px', fontSize: 12, cursor: 'pointer', background: bg, color: dim ? '#8A8C8E' : '#1F1F1D', borderBottom: '1px solid #F2F3F3', display: 'flex', alignItems: 'center', gap: 8 }}>
      {checked !== undefined && (
        <span style={{ width: 13, height: 13, border: `1.5px solid ${checked ? '#2A7E4F' : '#D1D3D4'}`, background: checked ? '#2A7E4F' : '#fff', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
          {checked ? '✓' : ''}
        </span>
      )}
      <span style={{ flex: 1 }}>{label}</span>
      {meta && <span style={{ color: '#8A8C8E', fontSize: 11 }}>{meta}</span>}
    </div>
  );
}
