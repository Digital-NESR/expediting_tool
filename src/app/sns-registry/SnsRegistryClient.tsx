'use client';

import DashboardScreen from './components/DashboardScreen';
import DetailScreen from './components/DetailScreen';
import ExpiryScreen from './components/ExpiryScreen';
import Footer from './components/Footer';
import Header from './components/Header';
import InboxScreen from './components/InboxScreen';
import NewRecordWizard from './components/NewRecordWizard';
import RegistryScreen from './components/RegistryScreen';
import { useRegistryApp } from './lib/useRegistryApp';
import type { ReferenceData, RegistryRecord, SnsViewer } from './lib/types';

export default function SnsRegistryClient({
  viewer,
  reference,
  initialRecords,
}: {
  viewer: SnsViewer;
  reference: ReferenceData;
  initialRecords: RegistryRecord[];
}) {
  const app = useRegistryApp({ viewer, reference, initialRecords });

  return (
    <div className="sns-root">
      <Header app={app} />

      {app.error && (
        <div
          role="alert"
          style={{ background: '#F8DCDC', borderBottom: '1px solid #C99999', color: '#9B1C1C', fontSize: 12.5, padding: '11px 28px', display: 'flex', justifyContent: 'space-between', gap: 16 }}
        >
          <span>{app.error}</span>
          <button
            onClick={() => app.setError(null)}
            style={{ background: 'none', border: 0, color: '#9B1C1C', fontWeight: 'bold', cursor: 'pointer', fontSize: 12.5 }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div style={{ flex: '1 1 auto', maxWidth: 1460, width: '100%', margin: '0 auto', padding: '26px 28px 64px' }}>
        {app.screen === 'registry' && <RegistryScreen app={app} />}
        {app.screen === 'detail' && <DetailScreen app={app} />}
        {app.screen === 'new' && <NewRecordWizard app={app} />}
        {app.screen === 'inbox' && <InboxScreen app={app} />}
        {app.screen === 'expiry' && <ExpiryScreen app={app} />}
        {app.screen === 'dash' && <DashboardScreen app={app} />}
      </div>

      <Footer />
    </div>
  );
}
