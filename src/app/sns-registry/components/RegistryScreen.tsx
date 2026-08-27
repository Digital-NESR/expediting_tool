'use client';

import { displayStatus } from '../lib/helpers';
import { shapeRow } from '../lib/shapeRow';
import type { RegistryApp } from '../lib/useRegistryApp';

const STATUSES = ['Draft', 'Pending Level 1', 'Pending Level 2', 'Active', 'Extended', 'Expiring soon', 'Expired', 'Rejected'];

export default function RegistryScreen({ app }: { app: RegistryApp }) {
  const counts = (status: string) => app.records.filter((r) => displayStatus(r) === status).length;
  const rows = app.filteredRecords;

  const kpis = [
    { label: 'Active IDs', value: counts('Active') + counts('Extended'), sub: 'valid for SAP reference', color: '#2A7E4F' },
    { label: 'Expiring soon', value: counts('Expiring soon'), sub: 'within 60 days', color: '#E09A4E' },
    { label: 'Expired', value: counts('Expired'), sub: 'reference is non-compliant', color: '#B34141' },
    { label: 'In validation', value: counts('Pending Level 1') + counts('Pending Level 2'), sub: 'awaiting L1 or L2', color: '#6AAF8E' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 18 }}>
        <div style={{ borderLeft: '4px solid #2A7E4F', paddingLeft: 12 }}>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 'bold', letterSpacing: 0.2 }}>Registry Search</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#58595B', maxWidth: 640 }}>
            Check for an active single-source or sole-source ID before you raise a single-quotation PO or RFQ.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
          <button onClick={app.exportCsv} className="btn-outline">Export to Excel</button>
          <button onClick={app.newDraft} className="btn-primary">New Registry Record</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 18 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #E4E6E6', borderTop: `4px solid ${k.color}`, padding: '14px 16px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.7, textTransform: 'uppercase' }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: k.color, lineHeight: 1.15, marginTop: 6 }}>{k.value}</div>
            <div style={{ fontSize: 11.5, color: '#58595B', marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E4E6E6' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', padding: '14px 16px', borderBottom: '1px solid #E4E6E6', background: '#FAFBFA' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 260px', minWidth: 220 }}>
            <label style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.6 }}>SEARCH</label>
            <input
              value={app.filters.q}
              onChange={(e) => app.setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="ID, supplier, family, commodity"
              style={{ border: '1px solid #D1D3D4', padding: '8px 10px', borderRadius: 2, width: '100%' }}
            />
          </div>
          <FilterSelect label="COUNTRY / ENTITY" value={app.filters.fCountry} options={['All countries', ...app.countries.map((c) => c[0])]} onChange={(v) => app.setFilters((f) => ({ ...f, fCountry: v }))} />
          <FilterSelect label="CLASSIFICATION" value={app.filters.fCls} options={['All classifications', 'SINGLE-SOURCE', 'SOLE-SOURCE']} onChange={(v) => app.setFilters((f) => ({ ...f, fCls: v }))} />
          <FilterSelect label="STATUS" value={app.filters.fStatus} options={['All statuses', ...STATUSES]} onChange={(v) => app.setFilters((f) => ({ ...f, fStatus: v }))} />
          <FilterSelect label="SEGMENT" value={app.filters.fSeg} options={['All segments', ...app.segments]} onChange={(v) => app.setFilters((f) => ({ ...f, fSeg: v }))} />
          <button onClick={app.resetFilters} className="btn-neutral" style={{ fontSize: 12, padding: '8px 14px' }}>Reset</button>
        </div>

        <div style={{ padding: '9px 16px', fontSize: 11.5, color: '#58595B', borderBottom: '1px solid #E4E6E6' }}>
          {rows.length} of {app.records.length} records — click any row to open the full case
        </div>

        <table style={{ width: '100%', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: '#2A7E4F', color: '#fff', textAlign: 'left' }}>
              {['REGISTRY ID', 'CLASSIFICATION', 'COUNTRY', 'SUPPLIER', 'SCOPE', 'ANNUAL SPEND', 'STATUS', 'EXPIRY'].map((h, i) => (
                <th key={h} style={{ padding: '9px 12px', fontSize: 10.5, letterSpacing: 0.6, borderRight: i < 7 ? '1px solid rgba(255,255,255,0.25)' : undefined, textAlign: h === 'ANNUAL SPEND' ? 'right' : 'left' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const sh = shapeRow(r);
              return (
                <tr key={sh.rid} onClick={() => app.open(sh.rid)} className="table-row" style={{ background: i % 2 ? '#F7FAF8' : '#FFFFFF', cursor: 'pointer', borderBottom: '1px solid #EDEFEF' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'Consolas,Menlo,monospace', fontWeight: 'bold', color: '#1D5B39', whiteSpace: 'nowrap' }}>{sh.idLabel}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 'bold', letterSpacing: 0.4, padding: '3px 7px', borderRadius: 2, background: sh.clsBg, color: sh.clsFg }}>{sh.clsLabel}</span>
                  </td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{sh.country}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 'bold' }}>{sh.supplierName}</div>
                    <div style={{ fontSize: 11, color: '#58595B' }}>SAP {sh.supplierId}</div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div>{sh.scopeLabel}</div>
                    <div style={{ fontSize: 11, color: '#58595B' }}>{sh.scopeDetail}</div>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{sh.spendLabel}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 'bold', padding: '3px 8px', borderRadius: 10, background: sh.statusBg, color: sh.statusFg }}>{sh.status}</span>
                  </td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <div>{sh.expiryLabel}</div>
                    <div style={{ fontSize: 11, color: sh.expiryNoteColor }}>{sh.expiryNote}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div style={{ padding: '44px 16px', textAlign: 'center', color: '#58595B', fontSize: 13 }}>
            <div style={{ fontWeight: 'bold', color: '#1F1F1D', marginBottom: 6 }}>No records match these filters</div>
            <div>No active ID exists for this combination. Raise a new registry record before proceeding with a single quotation.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '0 1 190px' }}>
      <label style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.6 }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ border: '1px solid #D1D3D4', padding: '8px 6px', borderRadius: 2, background: '#fff', width: '100%' }}>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
