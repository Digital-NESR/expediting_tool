// Register, Detail, Map, Alerts, Reports
const { useState: useS2, useMemo: useM2 } = React;

// === REGISTER (table) ===
const Register = ({ shipments, onOpen }) => {
  const fmtDate = window.PORTAL_DATA.fmtDate;
  const [q, setQ] = useS2('');
  const [seg, setSeg] = useS2('All');
  const [movement, setMovement] = useS2('All');
  const [alert, setAlert] = useS2('All');
  const [country, setCountry] = useS2('All');

  const segments = ['All', ...new Set(shipments.map(s => s.segment).filter(Boolean))];
  const countries = ['All', ...new Set(shipments.flatMap(s => [s.from, s.to]).filter(Boolean))];

  const rows = shipments.filter(s => {
    if (q && !`${s.id} ${s.invoice} ${s.bayan} ${s.description} ${s.po} ${s.awb}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (seg !== 'All' && s.segment !== seg) return false;
    if (movement !== 'All' && s.movement !== movement) return false;
    if (alert !== 'All' && s.alert !== alert) return false;
    if (country !== 'All' && s.from !== country && s.to !== country) return false;
    return true;
  });

  const totalDep = rows.reduce((a, s) => a + (s.depositSAR || 0), 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs">Home / Shipment register</div>
          <h1 className="h1">Shipment register</h1>
          <div className="muted mt-8" style={{ fontSize: 13 }}>
            {rows.length} of {shipments.length} records · Customs deposit on view: <b className="tabular">{sar(totalDep)}</b>
          </div>
        </div>
        <div className="row gap-8">
          <button className="btn"><Icon name="upload" size={14}/> Import Excel</button>
          <button className="btn"><Icon name="download" size={14}/> Export</button>
          <button className="btn primary"><Icon name="plus" size={14}/> New shipment</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="row gap-6" style={{ flex: '0 0 280px' }}>
          <Icon name="search" size={14} stroke="var(--ink-3)" />
          <input className="input" style={{ border: 0, padding: 0, flex: 1 }}
            placeholder="Search invoice, Bayan, PO, AWB…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <span style={{ width: 1, height: 24, background: 'var(--line)' }}></span>
        <select className="select" value={seg} onChange={e => setSeg(e.target.value)}>
          {segments.map(x => <option key={x}>{x === 'All' ? 'Segment: All' : x}</option>)}
        </select>
        <select className="select" value={movement} onChange={e => setMovement(e.target.value)}>
          <option>All</option><option>Import</option><option>Export</option>
        </select>
        <select className="select" value={country} onChange={e => setCountry(e.target.value)}>
          {countries.map(x => <option key={x}>{x === 'All' ? 'Country: All' : x}</option>)}
        </select>
        <span className="flex-1"></span>
        {['All','overdue','urgent','action','plan','info','ok','closed'].map(a => (
          <span key={a} className={`chip ${alert === a ? 'active' : ''}`} onClick={() => setAlert(a)}>
            {a === 'All' ? 'All status' : (ALERT_LABEL[a] || a)}
          </span>
        ))}
      </div>

      <div className="table-wrap mt-16">
        <table className="data">
          <thead><tr>
            <th style={{ width: 60 }}>#</th>
            <th>Segment / Description</th>
            <th>Route</th>
            <th>MOT</th>
            <th>Bayan</th>
            <th style={{ textAlign:'right' }}>Deposit (SAR)</th>
            <th>Import</th>
            <th>Effective expiry</th>
            <th>Owner</th>
            <th>Status</th>
            <th style={{ width: 30 }}></th>
          </tr></thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.id} onClick={() => onOpen(s.id)}>
                <td className="mono">{String(s.id).padStart(3,'0')}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{s.segment}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{s.description.slice(0,55)}{s.description.length>55?'…':''}</div>
                </td>
                <td><Flow from={s.from} to={s.to} /></td>
                <td><span className="row gap-6"><MotIcon mot={s.mot} />{s.mot || '—'}</span></td>
                <td className="mono">{s.bayan || '—'}</td>
                <td className="tnum" style={{ textAlign:'right' }}>{s.depositSAR ? s.depositSAR.toLocaleString() : '—'}</td>
                <td className="tnum">{fmtDate(s.importDate)}</td>
                <td className="tnum">
                  <div>{fmtDate(s.extended || s.expiry)}</div>
                  {s.extended && <div className="muted" style={{ fontSize: 11, textDecoration:'line-through' }}>{fmtDate(s.expiry)}</div>}
                </td>
                <td>
                  <div className="row gap-6">
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--brand)', color:'#fff', display:'grid', placeItems:'center', fontSize: 10, fontWeight:600 }}>
                      {s.owner ? s.owner.split(' ').map(p=>p[0]).slice(0,2).join('') : '—'}
                    </span>
                    <span style={{ fontSize: 12 }}>{(s.owner||'').split(' ')[0]}</span>
                  </div>
                </td>
                <td><StatusPill alert={s.alert} /></td>
                <td><Icon name="chevron" size={14} stroke="var(--ink-3)" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
window.Register = Register;

// === DETAIL ===
const Detail = ({ id, shipments, onBack, onOpen }) => {
  const fmtDate = window.PORTAL_DATA.fmtDate;
  const today = window.PORTAL_DATA.today;
  const s = shipments.find(x => x.id === id);
  const [tab, setTab] = useS2('overview');
  if (!s) return null;
  const docs = window.PORTAL_DATA.DOCS_BY_ID[s.id] || [];
  const events = window.PORTAL_DATA.TIMELINE_BY_ID[s.id] || [];
  const eff = s.extended || s.expiry;
  const totalDays = Math.floor((eff - s.importDate) / 86400000);
  const elapsed = Math.floor((today - s.importDate) / 86400000);
  const pct = Math.max(0, Math.min(100, (elapsed / totalDays) * 100));
  const cardClass = s.alert === 'overdue' ? 'overdue' : s.alert === 'urgent' ? 'urgent' : s.alert === 'action' ? 'action' : s.alert === 'closed' ? 'closed' : '';

  // Related shipments (same segment / same PO group)
  const related = shipments.filter(x => x.id !== s.id && (x.po === s.po && s.po && s.po !== 'N/A')).slice(0, 4);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs">
            <a onClick={onBack}>Shipment register</a> / Shipment #{String(s.id).padStart(3,'0')}
          </div>
          <h1 className="h1">{s.description || `${s.segment} — ${s.from} → ${s.to}`}</h1>
          <div className="row gap-8 mt-8">
            <span className="pill info"><span className="dot"></span>{s.segment}</span>
            <MovementPill movement={s.movement} />
            <StatusPill alert={s.alert} />
            <span className="muted" style={{ fontSize: 12 }}>
              Logged {fmtDate(s.importDate)} by {s.owner}
            </span>
          </div>
        </div>
        <div className="row gap-8">
          <button className="btn"><Icon name="mail" size={14}/> Notify owner</button>
          <button className="btn"><Icon name="teams" size={14}/> Post to Teams</button>
          <button className="btn"><Icon name="edit" size={14}/> Edit</button>
          {s.alert !== 'closed' && (
            <button className="btn primary"><Icon name="check" size={14}/> Request extension</button>
          )}
        </div>
      </div>

      {s.alert === 'overdue' && (
        <div className="banner overdue">
          <Icon name="alert" size={18} />
          <div className="flex-1">
            <b>Past re-export deadline by {-s.daysToExpiry} days.</b> Customs deposit ({sar(s.depositSAR)}) at risk. Contact customs broker and legal immediately.
          </div>
        </div>
      )}
      {s.alert === 'urgent' && (
        <div className="banner urgent">
          <Icon name="alert" size={18} />
          <div className="flex-1"><b>{s.daysToExpiry} days remaining.</b> Submit extension request or initiate re-export now.</div>
        </div>
      )}

      <div className="tabs">
        {['overview', 'documents', 'timeline', 'compliance'].map(t => (
          <div key={t} className={`tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
            {t==='documents' && <span className="muted" style={{ marginLeft: 6 }}>({docs.length})</span>}
            {t==='timeline' && <span className="muted" style={{ marginLeft: 6 }}>({events.length})</span>}
          </div>
        ))}
      </div>

      <div className="detail-grid">
        <div className="col gap-20">
          {tab === 'overview' && (
            <>
              <div className="card">
                <div className="card-head"><h2 className="h2">Shipment information</h2></div>
                <div className="card-body">
                  <div className="fields-grid">
                    <Field k="Movement type" v={s.movement} />
                    <Field k="Business segment" v={s.segment} />
                    <Field k="Mode of transport" v={<span className="row gap-6"><MotIcon mot={s.mot}/>{s.mot||'—'}</span>} />
                    <Field k="Origin" v={s.from || '—'} />
                    <Field k="Destination" v={s.to || '—'} />
                    <Field k="Owner" v={s.owner} />
                    <Field k="Invoice number" v={<span className="mono">{s.invoice||'—'}</span>} />
                    <Field k="Invoice value" v={s.invoiceValue ? <span className="tabular">{sar(s.invoiceValue)}</span> : '—'} />
                    <Field k="PO number" v={<span className="mono">{s.po||'—'}</span>} />
                    <Field k="Bayan number" v={<span className="mono">{s.bayan||'—'}</span>} />
                    <Field k="AWB / BL" v={<span className="mono">{s.awb||'—'}</span>} />
                    <Field k="Import date" v={fmtDate(s.importDate)} />
                  </div>
                  {s.comments && (
                    <div className="mt-16" style={{ paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                      <div className="key" style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform:'uppercase', letterSpacing: '.05em' }}>Comments</div>
                      <div style={{ fontSize: 13.5, marginTop: 4 }}>{s.comments}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-head"><h2 className="h2">Customs deposit & duty exposure</h2></div>
                <div className="card-body">
                  <div className="fields-grid">
                    <Field k="Deposit (SAR)" v={<span className="tabular" style={{ fontSize: 18, fontWeight: 700 }}>{sar(s.depositSAR)}</span>} />
                    <Field k="Deposit (USD)" v={<span className="tabular">{usd(s.depositSAR/3.75)}</span>} />
                    <Field k="Refund status" v={s.status === 'Closed' ? <span className="pill ok"><span className="dot"></span>Refund initiated</span> : <span className="pill warn"><span className="dot"></span>Held by customs</span>} />
                  </div>
                </div>
              </div>

              {related.length > 0 && (
                <div className="card">
                  <div className="card-head"><h2 className="h2">Related shipments</h2><span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>Same PO {s.po}</span></div>
                  <div style={{ overflow: 'hidden' }}>
                    <table className="data">
                      <tbody>
                        {related.map(r => (
                          <tr key={r.id} onClick={() => onOpen(r.id)}>
                            <td className="mono" style={{ width: 60 }}>#{String(r.id).padStart(3,'0')}</td>
                            <td>{r.description.slice(0,40)}</td>
                            <td><Flow from={r.from} to={r.to}/></td>
                            <td className="tnum">{fmtDate(r.extended||r.expiry)}</td>
                            <td><StatusPill alert={r.alert} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'documents' && (
            <div className="card">
              <div className="card-head">
                <h2 className="h2">Documents</h2>
                <span className="flex-1"></span>
                <button className="btn sm"><Icon name="upload" size={12}/> Upload</button>
              </div>
              <div className="card-body">
                {docs.length === 0 && <div className="muted">No documents attached.</div>}
                {docs.map((d, i) => (
                  <div className="doc" key={i}>
                    <div className="ico"><Icon name="file" size={18}/></div>
                    <div className="meta">
                      <div className="name">{d.name}</div>
                      <div className="sub">{d.kind} · {d.size} · uploaded by {d.uploadedBy} on {fmtDate(d.uploadedAt)}</div>
                    </div>
                    <button className="btn sm ghost"><Icon name="download" size={14}/></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'timeline' && (
            <div className="card">
              <div className="card-head"><h2 className="h2">Activity timeline</h2></div>
              <div className="card-body">
                <div className="timeline">
                  {events.map((e, i) => (
                    <div key={i} className={`tline-item ${e.kind}`}>
                      <div className="who">{e.who}</div>
                      <div className="text">{e.text}</div>
                      <div className="when">{fmtDate(e.at)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'compliance' && (
            <div className="card">
              <div className="card-head"><h2 className="h2">Compliance checklist</h2></div>
              <div className="card-body">
                <ChecklistRow done={true} text="Bayan registered with customs" />
                <ChecklistRow done={!!s.invoice} text="Commercial invoice on file" />
                <ChecklistRow done={!!s.awb} text="Airway bill / Bill of lading on file" />
                <ChecklistRow done={s.depositSAR > 0 || s.movement === 'Export'} text="Customs deposit recorded" />
                <ChecklistRow done={s.alert !== 'overdue'} text="Within re-export deadline" />
                <ChecklistRow done={!!s.extended} text="Extension granted (if requested)" optional />
                <ChecklistRow done={s.status === 'Closed'} text="Re-export confirmed & deposit refunded" />
              </div>
            </div>
          )}
        </div>

        {/* Side rail */}
        <div className="side-stack">
          <div className={`deadline-card ${cardClass}`}>
            <div className="label">{s.alert === 'closed' ? 'Closed' : s.alert === 'overdue' ? 'Days overdue' : 'Days to deadline'}</div>
            <div className="big tabular">
              {s.alert === 'closed' ? '✓' : s.alert === 'overdue' ? -s.daysToExpiry : s.daysToExpiry}
            </div>
            <div className="date">
              {s.alert === 'closed' ? 'Re-export confirmed' : 'Effective expiry: ' + fmtDate(eff)}
            </div>
            {s.alert !== 'closed' && (
              <div className="progress"><div style={{ width: pct + '%' }}></div></div>
            )}
            <div className="row gap-8 mt-12" style={{ fontSize: 12, opacity: 0.9 }}>
              <span>Imported {fmtDate(s.importDate)}</span>
              <span className="flex-1"></span>
              <span>{fmtDate(eff)}</span>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2 className="h2">Key dates</h2></div>
            <div className="card-body col gap-12">
              <KeyDate label="Imported" date={fmtDate(s.importDate)} />
              <KeyDate label="Original expiry" date={fmtDate(s.expiry)} struck={!!s.extended} />
              {s.extended && <KeyDate label="Extended to" date={fmtDate(s.extended)} highlight />}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2 className="h2">Notifications</h2></div>
            <div className="card-body col gap-8">
              <NotifLine icon="bell" who="60 days before" status={s.daysToExpiry <= 60 || s.status==='Closed' ? 'sent' : 'queued'} />
              <NotifLine icon="bell" who="30 days before" status={s.daysToExpiry <= 30 || s.status==='Closed' ? 'sent' : 'queued'} />
              <NotifLine icon="bell" who="14 days before" status={s.daysToExpiry <= 14 || s.status==='Closed' ? 'sent' : 'queued'} />
              <NotifLine icon="bell" who="7 days before" status={s.daysToExpiry <= 7 || s.status==='Closed' ? 'sent' : 'queued'} />
              <NotifLine icon="alert" who="Past expiry" status={s.alert === 'overdue' ? 'sent' : 'queued'} crit />
            </div>
            <div className="card-body" style={{ borderTop: '1px solid var(--line)' }}>
              <div className="muted" style={{ fontSize: 11.5 }}>Recipients</div>
              <div className="mt-8 row gap-6" style={{ flexWrap:'wrap' }}>
                {[s.owner, 'Customs Manager', 'Finance Lead'].map((p, i) => (
                  <span key={i} className="pill closed"><span className="dot"></span>{p}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Field = ({ k, v }) => (
  <div className="field">
    <div className="key">{k}</div>
    <div className="val">{v}</div>
  </div>
);
const KeyDate = ({ label, date, struck, highlight }) => (
  <div className="row">
    <Icon name="clock" size={14} stroke="var(--ink-3)" />
    <span className="muted" style={{ fontSize: 12 }}>{label}</span>
    <span className="flex-1"></span>
    <span className="tabular" style={{ fontWeight: highlight ? 700 : 500, color: highlight ? 'var(--brand)' : 'var(--ink)', textDecoration: struck ? 'line-through' : 'none' }}>{date}</span>
  </div>
);
const NotifLine = ({ icon, who, status, crit }) => (
  <div className="row gap-8">
    <Icon name={icon} size={14} stroke={crit && status === 'sent' ? 'var(--critical)' : 'var(--ink-3)'} />
    <span style={{ fontSize: 12.5 }}>{who}</span>
    <span className="flex-1"></span>
    <span className="pill" style={{
      background: status === 'sent' ? (crit ? 'var(--critical-bg)' : 'var(--ok-bg)') : 'var(--line)',
      color: status === 'sent' ? (crit ? 'var(--critical)' : 'var(--ok)') : 'var(--ink-3)',
      fontSize: 10.5,
    }}>{status}</span>
  </div>
);
const ChecklistRow = ({ done, text, optional }) => (
  <div className="row gap-12" style={{ padding: '8px 0', borderBottom: '1px solid var(--line-2)' }}>
    <span style={{ width: 22, height: 22, borderRadius: '50%', background: done ? 'var(--ok-bg)' : 'var(--line)', color: done ? 'var(--ok)' : 'var(--ink-3)', display: 'grid', placeItems:'center' }}>
      {done ? <Icon name="check" size={12}/> : <Icon name="clock" size={12}/>}
    </span>
    <span style={{ fontSize: 13.5, color: done ? 'var(--ink)' : 'var(--ink-2)' }}>{text}</span>
    {optional && <span className="muted" style={{ fontSize: 11 }}>· optional</span>}
  </div>
);
window.Detail = Detail;

// === MAP ===
const MapView = ({ shipments, onOpen }) => {
  const open = shipments.filter(s => s.status !== 'Closed');
  const COORDS = window.PORTAL_DATA.COUNTRY_COORDS;

  // group by from→to
  const flowMap = {};
  open.forEach(s => {
    const key = s.from + '|' + s.to;
    flowMap[key] = flowMap[key] || { from: s.from, to: s.to, items: [], worst: 'ok' };
    flowMap[key].items.push(s);
    const order = ['ok','info','plan','action','urgent','overdue'];
    if (order.indexOf(s.alert) > order.indexOf(flowMap[key].worst)) flowMap[key].worst = s.alert;
  });
  const flows = Object.values(flowMap);

  const nodeMap = {};
  open.forEach(s => {
    [s.from, s.to].forEach(c => {
      if (!c) return;
      nodeMap[c] = nodeMap[c] || { name: c, count: 0 };
      nodeMap[c].count++;
    });
  });
  const nodes = Object.values(nodeMap);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs">Home / Map view</div>
          <h1 className="h1">Active movements — global view</h1>
          <div className="muted mt-8" style={{ fontSize: 13 }}>{open.length} active flows across {nodes.length} countries</div>
        </div>
      </div>

      <div className="map-wrap">
        <svg viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid meet" style={{ minHeight: 480 }}>
          {/* Stylized continents (simple paths) */}
          <g className="map-country">
            {/* North America */}
            <path d="M 80 140 Q 130 110, 200 120 L 280 130 L 310 180 L 290 240 L 240 280 L 180 290 L 120 250 L 90 200 Z" />
            {/* South America */}
            <path d="M 250 320 L 300 310 L 320 380 L 300 450 L 270 470 L 240 430 L 230 370 Z" />
            {/* Europe */}
            <path d="M 440 160 L 510 150 L 540 180 L 530 220 L 470 240 L 430 220 Z" />
            {/* Africa */}
            <path d="M 470 250 L 560 250 L 580 320 L 540 410 L 480 420 L 450 360 L 460 290 Z" />
            {/* Middle East */}
            <path d="M 555 220 L 640 220 L 670 270 L 660 320 L 600 340 L 560 310 L 550 270 Z" />
            {/* India */}
            <path d="M 690 270 L 750 280 L 760 340 L 720 380 L 690 360 L 680 320 Z" />
            {/* China/Asia */}
            <path d="M 770 180 L 880 180 L 920 240 L 900 300 L 820 310 L 780 270 Z" />
            {/* UK */}
            <path d="M 460 180 L 480 175 L 485 200 L 470 210 L 455 200 Z" />
          </g>

          {/* Flow arcs */}
          {flows.map((f, i) => {
            const a = COORDS[f.from], b = COORDS[f.to];
            if (!a || !b || !a.x) return null;
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 40 - Math.abs(a.x - b.x) * 0.05;
            return (
              <g key={i}>
                <path d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                  className="map-flow"
                  stroke={bucketColor(f.worst)}
                  strokeWidth={1.4 + Math.min(f.items.length * 0.4, 3)}
                  strokeDasharray="4 3"
                />
                <circle cx={b.x} cy={b.y} r={3} fill={bucketColor(f.worst)} />
              </g>
            );
          })}

          {/* Country nodes */}
          {nodes.map((n, i) => {
            const c = COORDS[n.name];
            if (!c || !c.x) return null;
            const r = 6 + Math.min(n.count * 1.2, 10);
            return (
              <g key={i} className="map-node">
                <circle cx={c.x} cy={c.y} r={r} fill="var(--brand)" />
                <text x={c.x} y={c.y - r - 6} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--ink)">
                  {c.label} · {n.count}
                </text>
              </g>
            );
          })}
        </svg>

        <div style={{ position: 'absolute', top: 16, right: 16, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: 11.5, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Flow status</div>
          {[['overdue','Overdue'],['urgent','Urgent'],['action','Action req\'d'],['plan','Plan ext.'],['info','Monitor'],['ok','On track']].map(([k, l]) => (
            <div key={k} className="row gap-6" style={{ marginTop: 3 }}>
              <span style={{ width: 16, height: 2, background: bucketColor(k) }}></span>
              <span>{l}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card mt-20">
        <div className="card-head"><h2 className="h2">Flows by route</h2></div>
        <table className="data">
          <thead><tr><th>Route</th><th>Count</th><th>Status mix</th><th style={{ textAlign:'right'}}>Total deposit</th><th></th></tr></thead>
          <tbody>
            {flows.sort((a,b) => b.items.length - a.items.length).map((f, i) => {
              const dep = f.items.reduce((a, x) => a + (x.depositSAR||0), 0);
              return (
                <tr key={i}>
                  <td><Flow from={f.from} to={f.to} /></td>
                  <td className="tabular">{f.items.length}</td>
                  <td>
                    <div className="row gap-4">
                      {f.items.map((x, j) => (
                        <span key={j} title={`#${x.id} ${ALERT_LABEL[x.alert]}`} style={{ width: 8, height: 14, background: bucketColor(x.alert), borderRadius: 2, cursor:'pointer' }} onClick={() => onOpen(x.id)}></span>
                      ))}
                    </div>
                  </td>
                  <td className="tnum" style={{ textAlign:'right'}}>{sar(dep)}</td>
                  <td><Icon name="chevron" size={12} stroke="var(--ink-3)"/></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
window.MapView = MapView;

// === ALERTS ===
const Alerts = ({ shipments, onOpen }) => {
  const fmtDate = window.PORTAL_DATA.fmtDate;
  const open = shipments.filter(s => s.status !== 'Closed');
  const groups = [
    { key: 'overdue', label: 'Overdue — escalate now', desc: 'Past re-export deadline. Penalty risk.', items: open.filter(s => s.alert==='overdue') },
    { key: 'urgent', label: 'Urgent — within 7 days', desc: 'Submit extension or initiate re-export immediately.', items: open.filter(s => s.alert==='urgent') },
    { key: 'action', label: 'Action required — within 14 days', desc: 'Begin extension paperwork or schedule re-export.', items: open.filter(s => s.alert==='action') },
    { key: 'plan', label: 'Plan ahead — within 30 days', desc: 'Confirm re-export plan with operations.', items: open.filter(s => s.alert==='plan') },
    { key: 'info', label: 'Monitor — within 60 days', desc: 'Informational. No action yet.', items: open.filter(s => s.alert==='info') },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs">Home / Alerts</div>
          <h1 className="h1">Alerts & notifications</h1>
          <div className="muted mt-8" style={{ fontSize: 13 }}>Automated rollup based on effective expiry dates. Email + Teams notifications fire automatically.</div>
        </div>
        <div className="row gap-8">
          <button className="btn"><Icon name="settings" size={14}/> Notification rules</button>
        </div>
      </div>

      <div className="col gap-16">
        {groups.map(g => (
          <div key={g.key} className="card">
            <div className="card-head">
              <span className="dot" style={{ width: 10, height: 10, borderRadius: '50%', background: bucketColor(g.key), display:'inline-block' }}></span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{g.label}</div>
                <div className="muted" style={{ fontSize: 12 }}>{g.desc}</div>
              </div>
              <span className="flex-1"></span>
              <span className="pill" style={{ background: 'var(--line)', color: 'var(--ink-2)' }}>{g.items.length} shipment{g.items.length!==1?'s':''}</span>
            </div>
            {g.items.length > 0 && (
              <table className="data">
                <tbody>
                  {g.items.sort((a,b) => a.daysToExpiry - b.daysToExpiry).map(s => (
                    <tr key={s.id} onClick={() => onOpen(s.id)}>
                      <td className="mono" style={{ width: 60 }}>#{String(s.id).padStart(3,'0')}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{s.description.slice(0, 50)}</div>
                        <div className="muted" style={{ fontSize: 11.5 }}>{s.segment} · Owner: {s.owner}</div>
                      </td>
                      <td><Flow from={s.from} to={s.to}/></td>
                      <td className="tnum">
                        <div style={{ fontWeight: 600 }}>{s.daysToExpiry < 0 ? `${-s.daysToExpiry}d overdue` : `${s.daysToExpiry}d left`}</div>
                        <div className="muted" style={{ fontSize: 11 }}>{fmtDate(s.extended || s.expiry)}</div>
                      </td>
                      <td className="tnum" style={{ textAlign: 'right' }}>{sar(s.depositSAR)}</td>
                      <td><button className="btn sm">Notify</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {g.items.length === 0 && <div className="card-body muted" style={{ fontSize: 12.5 }}>No shipments in this bucket.</div>}
          </div>
        ))}
      </div>
    </div>
  );
};
window.Alerts = Alerts;

// === REPORTS ===
const Reports = ({ shipments }) => {
  const open = shipments.filter(s => s.status !== 'Closed');
  const closed = shipments.filter(s => s.status === 'Closed');
  const totalDeposit = open.reduce((a, s) => a + (s.depositSAR || 0), 0);
  const refunded = closed.reduce((a, s) => a + (s.depositSAR || 0), 0);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs">Home / Reports</div>
          <h1 className="h1">Audit-ready reports</h1>
          <div className="muted mt-8" style={{ fontSize: 13 }}>Monthly snapshots for customs, finance and legal. Ready to export as PDF or Excel.</div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi"><span className="accent-bar"></span><div className="label">Total active deposit</div><div className="value tabular">{sar(totalDeposit)}</div><div className="sub">{open.length} open shipments</div></div>
        <div className="kpi ok"><span className="accent-bar"></span><div className="label">Refunds initiated YTD</div><div className="value tabular" style={{ color:'var(--ok)' }}>{sar(refunded)}</div><div className="sub">{closed.length} closed shipments</div></div>
        <div className="kpi warn"><span className="accent-bar"></span><div className="label">Penalty risk exposure</div><div className="value tabular" style={{ color: 'var(--warn)' }}>{sar(shipments.filter(s=>s.alert==='overdue').reduce((a,s)=>a+(s.depositSAR||0),0))}</div><div className="sub">From overdue shipments</div></div>
        <div className="kpi"><span className="accent-bar"></span><div className="label">Re-export completion</div><div className="value tabular">{Math.round(closed.length / shipments.length * 100)}%</div><div className="sub">Closed / total all-time</div></div>
      </div>

      <div className="mt-20 card">
        <div className="card-head">
          <h2 className="h2">Available reports</h2>
        </div>
        <div className="card-body col gap-8">
          {[
            ['Monthly customs summary', 'All open & closed temporary movements with Bayan, deposit, expiry, status', 'Customs'],
            ['Finance — duty exposure roll-up', 'Aggregated SAR/USD deposit by segment, country, and aging bucket', 'Finance'],
            ['Legal — penalty risk register', 'Overdue & at-risk shipments with extension status and timeline', 'Legal'],
            ['Re-export confirmations', 'Closed shipments with re-export documentation and refund status', 'Customs / Finance'],
            ['Extensions log', 'All extensions requested and granted, with original vs effective expiry', 'Customs'],
            ['Audit trail — full history', 'Append-only change log per shipment, all events and users', 'All'],
          ].map(([t, d, owner], i) => (
            <div key={i} className="row gap-12" style={{ padding: '14px 4px', borderBottom: i < 5 ? '1px solid var(--line-2)' : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'color-mix(in srgb, var(--brand) 10%, transparent)', color: 'var(--brand)', display:'grid', placeItems:'center' }}>
                <Icon name="chart" size={18}/>
              </div>
              <div className="flex-1">
                <div style={{ fontWeight: 600 }}>{t}</div>
                <div className="muted" style={{ fontSize: 12 }}>{d}</div>
              </div>
              <span className="pill closed"><span className="dot"></span>{owner}</span>
              <button className="btn sm"><Icon name="download" size={12}/> PDF</button>
              <button className="btn sm"><Icon name="download" size={12}/> Excel</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
window.Reports = Reports;
