// Pages — Dashboard, Register, Detail, Map, Alerts, Reports
const { useState, useMemo, useEffect } = React;

// === DASHBOARD ===
const Dashboard = ({ shipments, onOpen, onNav }) => {
  const today = window.PORTAL_DATA.today;
  const fmtDate = window.PORTAL_DATA.fmtDate;
  const open = shipments.filter(s => s.status !== 'Closed');
  const overdue = open.filter(s => s.alert === 'overdue');
  const urgent = open.filter(s => s.alert === 'urgent');
  const action = open.filter(s => s.alert === 'action');
  const totalDeposit = open.reduce((a, s) => a + (s.depositSAR || 0), 0);
  const totalUSD = totalDeposit / 3.75;

  // Buckets
  const buckets = [
    { key: 'overdue', label: 'Overdue', items: overdue, alert: 'overdue' },
    { key: 'urgent', label: '≤ 7 days', items: urgent, alert: 'urgent' },
    { key: 'action', label: '8–14 days', items: action, alert: 'action' },
    { key: 'plan', label: '15–30 days', items: open.filter(s => s.alert === 'plan'), alert: 'plan' },
    { key: 'info', label: '31–60 days', items: open.filter(s => s.alert === 'info'), alert: 'info' },
    { key: 'ok', label: '60+ days', items: open.filter(s => s.alert === 'ok'), alert: 'ok' },
  ];

  // By segment
  const segMap = {};
  open.forEach(s => {
    segMap[s.segment] = segMap[s.segment] || { count: 0, deposit: 0 };
    segMap[s.segment].count++;
    segMap[s.segment].deposit += s.depositSAR || 0;
  });
  const segments = Object.entries(segMap).sort((a, b) => b[1].count - a[1].count);

  // Action queue
  const actionQueue = open
    .filter(s => ['overdue', 'urgent', 'action', 'plan'].includes(s.alert))
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry)
    .slice(0, 8);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs">Home / Dashboard</div>
          <h1 className="h1">Compliance dashboard</h1>
          <div className="muted mt-8" style={{ fontSize: 13 }}>
            {fmtDate(today)} · {open.length} active temporary movements · {overdue.length + urgent.length} need action this week
          </div>
        </div>
        <div className="row gap-8">
          <button className="btn"><Icon name="download" size={14}/> Export PDF</button>
          <button className="btn primary" onClick={() => onNav('register')}><Icon name="plus" size={14}/> New shipment</button>
        </div>
      </div>

      {overdue.length > 0 && (
        <div className="banner overdue">
          <Icon name="alert" size={18} />
          <div className="flex-1">
            <b>{overdue.length} shipment{overdue.length > 1 ? 's are' : ' is'} past re-export deadline.</b> Penalty risk — escalate to legal & customs immediately.
          </div>
          <button className="btn sm" onClick={() => onNav('alerts')}>Review</button>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi"><span className="accent-bar"></span>
          <div className="label">Active movements</div>
          <div className="value">{open.length}</div>
          <div className="sub">{open.filter(s=>s.movement==='Import').length} imports · {open.filter(s=>s.movement==='Export').length} exports</div>
        </div>
        <div className="kpi critical"><span className="accent-bar"></span>
          <div className="label">Overdue</div>
          <div className="value" style={{ color: 'var(--critical)' }}>{overdue.length}</div>
          <div className="sub">Past expiry, action required</div>
        </div>
        <div className="kpi urgent"><span className="accent-bar"></span>
          <div className="label">Due this week</div>
          <div className="value" style={{ color: 'var(--urgent)' }}>{urgent.length}</div>
          <div className="sub">≤ 7 days to expiry</div>
        </div>
        <div className="kpi"><span className="accent-bar"></span>
          <div className="label">Customs deposit at risk</div>
          <div className="value tabular">{sar(totalDeposit)}</div>
          <div className="sub tabular">≈ {usd(totalUSD)} USD</div>
        </div>
      </div>

      <div className="mt-20" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-head">
            <h2 className="h2">Action queue</h2>
            <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>Sorted by days remaining</span>
            <span className="flex-1"></span>
            <button className="btn sm ghost" onClick={() => onNav('register')}>View all <Icon name="chevron" size={12}/></button>
          </div>
          <div style={{ overflow: 'hidden' }}>
            <table className="data">
              <thead><tr>
                <th>Shipment</th><th>Route</th><th>Movement</th><th style={{ textAlign:'right'}}>Deposit</th><th>Expiry</th><th>Status</th>
              </tr></thead>
              <tbody>
                {actionQueue.map(s => (
                  <tr key={s.id} onClick={() => onOpen(s.id)}>
                    <td>
                      <div style={{ fontWeight: 600 }}>#{String(s.id).padStart(3,'0')} · {s.segment}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{s.description.slice(0, 48)}{s.description.length>48?'…':''}</div>
                    </td>
                    <td><Flow from={s.from} to={s.to} /></td>
                    <td><MovementPill movement={s.movement} /></td>
                    <td className="tnum" style={{ textAlign:'right'}}>{s.depositSAR ? sar(s.depositSAR) : '—'}</td>
                    <td className="tnum">
                      <div>{fmtDate(s.extended || s.expiry)}</div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {s.daysToExpiry < 0 ? `${-s.daysToExpiry}d overdue` : `${s.daysToExpiry}d left`}
                      </div>
                    </td>
                    <td><StatusPill alert={s.alert} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2 className="h2">Compliance health</h2>
          </div>
          <div className="card-body">
            <ComplianceDonut buckets={buckets} total={open.length} />
            <div className="col gap-8 mt-16">
              {buckets.map(b => (
                <div key={b.key} className="row gap-8" style={{ fontSize: 12.5 }}>
                  <span className="dot-sq" style={{ width:10, height:10, borderRadius: 2, background: bucketColor(b.alert) }}></span>
                  <span>{b.label}</span>
                  <span className="flex-1"></span>
                  <span className="tabular" style={{ fontWeight: 600 }}>{b.items.length}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-20" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-head"><h2 className="h2">By business segment</h2></div>
          <div className="card-body">
            {segments.map(([seg, info]) => {
              const pct = (info.deposit / totalDeposit) * 100;
              return (
                <div key={seg} className="col" style={{ marginBottom: 12 }}>
                  <div className="row" style={{ fontSize: 12.5 }}>
                    <span style={{ fontWeight: 600 }}>{seg}</span>
                    <span className="muted" style={{ fontSize: 11.5, marginLeft: 8 }}>· {info.count} active</span>
                    <span className="flex-1"></span>
                    <span className="tabular">{sar(info.deposit)}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--line-2)', borderRadius: 3, overflow:'hidden', marginTop:5 }}>
                    <div style={{ width: pct + '%', height: '100%', background: 'var(--brand)' }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2 className="h2">Recent activity</h2>
            <span className="flex-1"></span>
            <span className="muted" style={{ fontSize: 11.5 }}>Last 7 days</span>
          </div>
          <div className="card-body">
            <div className="timeline">
              <div className="tline-item document">
                <div className="who">Khalid Reza</div>
                <div className="text">Uploaded extension approval for #043 (TRS rental)</div>
                <div className="when">2 hours ago</div>
              </div>
              <div className="tline-item alert">
                <div className="who">System · automated</div>
                <div className="text">Re-export deadline passed for #044 (Sand king — Algeria)</div>
                <div className="when">Yesterday · 06:00</div>
              </div>
              <div className="tline-item extension">
                <div className="who">Customs Authority</div>
                <div className="text">Extension granted for #016 (Motors — UAE), new expiry 8 Mar 2026</div>
                <div className="when">2 days ago</div>
              </div>
              <div className="tline-item closed">
                <div className="who">Salem Khoury</div>
                <div className="text">Re-export confirmed for #027 (SLK Unit 59)</div>
                <div className="when">3 days ago</div>
              </div>
              <div className="tline-item created">
                <div className="who">Layla Hassan</div>
                <div className="text">Logged new shipment #047 — Pressure/Temp logging suite</div>
                <div className="when">5 days ago</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const bucketColor = (alert) => ({
  overdue: 'var(--critical)',
  urgent: 'var(--urgent)',
  action: 'var(--warn)',
  plan: 'var(--plan)',
  info: 'var(--info)',
  ok: 'var(--ok)',
}[alert] || 'var(--ink-3)');
window.bucketColor = bucketColor;

const ComplianceDonut = ({ buckets, total }) => {
  const size = 160, r = 60, cx = size/2, cy = size/2;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
      <svg width={size} height={size} className="donut">
        <circle cx={cx} cy={cy} r={r} stroke="var(--line-2)" strokeWidth="14" fill="none" />
        {buckets.map(b => {
          if (b.items.length === 0) return null;
          const frac = b.items.length / total;
          const len = C * frac;
          const el = <circle key={b.key}
            cx={cx} cy={cy} r={r}
            stroke={bucketColor(b.alert)} strokeWidth="14" fill="none"
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}
          />;
          offset += len;
          return el;
        })}
      </svg>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign:'center' }}>
        <div style={{ fontSize: 28, fontWeight: 700 }}>{total}</div>
        <div className="muted" style={{ fontSize: 11 }}>open</div>
      </div>
    </div>
  );
};
window.Dashboard = Dashboard;
