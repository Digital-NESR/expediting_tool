// Main app shell
const { useState: useStateA, useEffect: useEffectA } = React;

const NAV_ITEMS = [
{ id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
{ id: 'register', label: 'Shipments', icon: 'list' },
{ id: 'alerts', label: 'Alerts', icon: 'bell' },
{ id: 'map', label: 'Map view', icon: 'map' },
{ id: 'reports', label: 'Reports', icon: 'chart' }];


const App = () => {
  const tweakDefaults = /*EDITMODE-BEGIN*/{
    "themeColor": "#003D6B",
    "darkMode": false
  } /*EDITMODE-END*/;

  const [tweaks, setTweak] = useTweaks(tweakDefaults);
  const [page, setPage] = useStateA('dashboard');
  const [openId, setOpenId] = useStateA(null);

  const shipments = window.PORTAL_DATA.SHIPMENTS;

  useEffectA(() => {
    document.documentElement.style.setProperty('--brand', tweaks.themeColor);
    // adjust brand-2 to a slightly lighter version
    document.documentElement.style.setProperty('--brand-2', mixHex(tweaks.themeColor, '#FFFFFF', 0.18));
    document.documentElement.style.setProperty('--brand-ink', mixHex(tweaks.themeColor, '#000000', 0.4));
    document.documentElement.dataset.theme = tweaks.darkMode ? 'dark' : 'light';
  }, [tweaks.themeColor, tweaks.darkMode]);

  const open = (id) => {setOpenId(id);setPage('detail');};
  const counts = {
    register: shipments.filter((s) => s.status !== 'Closed').length,
    alerts: shipments.filter((s) => ['overdue', 'urgent', 'action', 'plan'].includes(s.alert)).length
  };

  return (
    <div className="app">
      <header className="topbar" style={{ backgroundColor: "rgb(0, 107, 12)" }}>
        <div className="product-mark">
          <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.12)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13, letterSpacing: '-.03em' }}>
            TI<span style={{ color: 'var(--accent-2)' }}>·</span>TE
          </div>
          <span>NESR Temporary Import / Export</span>
          <span className="ms-app"><span className="ms-icon"></span></span>
        </div>
        <span className="spacer"></span>
        <div className="search">
          <Icon name="search" size={14} />
          <input placeholder="Search shipments, Bayan, PO, invoice…" />
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.2)', padding: '1px 5px', borderRadius: 3 }}>⌘K</span>
        </div>
        <button className="icon-btn" title="Refresh"><Icon name="refresh" size={16} /></button>
        <button className="icon-btn" title="Notifications" onClick={() => setPage('alerts')}>
          <Icon name="bell" size={16} />
          {counts.alerts > 0 && <span className="dot"></span>}
        </button>
        <button className="icon-btn" title="Settings"><Icon name="settings" size={16} /></button>
        <div className="avatar" title="Ahmed Al-Otaibi">AO</div>
      </header>

      <aside className="sidebar">
        <div className="group-label">Navigate</div>
        {NAV_ITEMS.map((n) =>
        <div key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => {setPage(n.id);setOpenId(null);}}>
            <span className="ico"><Icon name={n.icon} size={16} /></span>
            <span>{n.label}</span>
            {n.id === 'register' && <span className="count">{counts.register}</span>}
            {n.id === 'alerts' && counts.alerts > 0 && <span className="count" style={{ background: 'var(--urgent-bg)', color: 'var(--urgent)' }}>{counts.alerts}</span>}
          </div>
        )}

        <div className="group-label">Workspace</div>
        <div className="nav-item"><span className="ico"><Icon name="file" size={16} /></span>Documents library</div>
        <div className="nav-item"><span className="ico"><Icon name="paperclip" size={16} /></span>Templates</div>
        <div className="nav-item"><span className="ico"><Icon name="settings" size={16} /></span>Admin · Settings</div>

        <div className="group-label">My filters</div>
        <div className="nav-item" style={{ fontSize: 12.5 }}><span className="ico" style={{ background: 'var(--urgent)', borderRadius: 4 }}></span>Overdue (mine)</div>
        <div className="nav-item" style={{ fontSize: 12.5 }}><span className="ico" style={{ background: 'var(--warn)', borderRadius: 4 }}></span>Due ≤ 14 days</div>
        <div className="nav-item" style={{ fontSize: 12.5 }}><span className="ico" style={{ background: 'var(--info)', borderRadius: 4 }}></span>Pending extensions</div>

        <div className="footer">
          <div style={{ fontWeight: 600, color: 'var(--ink-2)' }}>NESR · KSA Region</div>
          <div>Customs &amp; trade compliance</div>
          <div className="mt-8">v1.4.0 · Power Platform</div>
        </div>
      </aside>

      <main className="main">
        {page === 'dashboard' && <Dashboard shipments={shipments} onOpen={open} onNav={setPage} />}
        {page === 'register' && <Register shipments={shipments} onOpen={open} />}
        {page === 'detail' && <Detail id={openId} shipments={shipments} onBack={() => setPage('register')} onOpen={open} />}
        {page === 'alerts' && <Alerts shipments={shipments} onOpen={open} />}
        {page === 'map' && <MapView shipments={shipments} onOpen={open} />}
        {page === 'reports' && <Reports shipments={shipments} />}
      </main>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Brand">
          <TweakColor label="Theme color" value={tweaks.themeColor} onChange={(v) => setTweak('themeColor', v)}
          presets={['#003D6B', '#00558F', '#0E4F70', '#1A4D2E', '#5B0E2D', '#1F1147', '#1F2A37', '#0072CE']} />
        </TweakSection>
        <TweakSection title="Appearance">
          <TweakToggle label="Dark mode" value={tweaks.darkMode} onChange={(v) => setTweak('darkMode', v)} />
        </TweakSection>
      </TweaksPanel>
    </div>);

};

// hex mix helper
function mixHex(a, b, t) {
  const ha = a.replace('#', ''),hb = b.replace('#', '');
  const ar = parseInt(ha.slice(0, 2), 16),ag = parseInt(ha.slice(2, 4), 16),ab = parseInt(ha.slice(4, 6), 16);
  const br = parseInt(hb.slice(0, 2), 16),bg = parseInt(hb.slice(2, 4), 16),bb = parseInt(hb.slice(4, 6), 16);
  const r = Math.round(ar + (br - ar) * t),g = Math.round(ag + (bg - ag) * t),bl = Math.round(ab + (bb - ab) * t);
  return '#' + [r, g, bl].map((x) => x.toString(16).padStart(2, '0')).join('');
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);