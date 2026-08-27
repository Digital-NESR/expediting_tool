'use client';

import Link from 'next/link';
import type { RegistryApp } from '../lib/useRegistryApp';
import { ROLE_SHORT } from '../lib/constants';
import { displayStatus } from '../lib/helpers';
import type { Screen } from '../lib/types';

const NAV: { screen: Screen; label: string }[] = [
  { screen: 'registry', label: 'Registry' },
  { screen: 'new', label: 'New Record' },
  { screen: 'inbox', label: 'Validation Inbox' },
  { screen: 'expiry', label: 'Expiry & Review' },
  { screen: 'dash', label: 'Dashboard' },
];

export default function Header({ app }: { app: RegistryApp }) {
  const { viewer } = app;

  // Badge counts reflect what this viewer can act on, not the whole registry —
  // a Level 1 validator approved for Kuwait should not see Oman's queue depth.
  const actionable = app.records.filter((r) => app.canActOn(r.country));
  const pendingCount = actionable.filter((r) => {
    const s = displayStatus(r);
    return s === 'Pending Level 1' || s === 'Pending Level 2';
  }).length;
  const expiryCount = actionable.filter((r) => {
    const s = displayStatus(r);
    return s === 'Expiring soon' || s === 'Expired';
  }).length;
  const badges: Record<string, number> = { inbox: pendingCount, expiry: expiryCount };

  // Requestors create records; nobody else can, so the tab is simply absent
  // rather than present-and-rejected.
  const canCreate = viewer.isAdmin || viewer.roleKind === 'req';
  const nav = NAV.filter((n) => n.screen !== 'new' || canCreate);

  const roleLabel = viewer.isAdmin
    ? 'Admin — full access'
    : ROLE_SHORT[viewer.role ?? ''] ?? viewer.role ?? '';
  const countryLabel = viewer.countries.length === 0 ? 'All countries' : viewer.countries.join(', ');

  return (
    <div style={{ background: '#2A7E4F', color: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 0 rgba(0,0,0,0.12)' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'space-between', gap: 16, minHeight: 56, borderBottom: '1px solid rgba(255,255,255,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 22px', flex: '0 0 auto' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nesr_logo_white.png" alt="NESR" style={{ height: 38, width: 'auto', display: 'block' }} />
          <div style={{ width: 1, height: 30, background: 'rgba(255,255,255,0.35)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 14, fontWeight: 'bold', letterSpacing: 0.3 }}>Single &amp; Sole Source Registry</div>
            <div style={{ fontSize: 10, color: '#C5E0D2', letterSpacing: 0.5 }}>SYSTEM OF RECORD FOR SINGLE-QUOTATION COMPLIANCE</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '0 22px', flex: '0 0 auto', background: 'rgba(0,0,0,0.14)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            <div style={{ fontSize: 12.5, fontWeight: 'bold', whiteSpace: 'nowrap' }}>{viewer.name}</div>
            <div style={{ fontSize: 10.5, color: '#C5E0D2', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
              {roleLabel} · {countryLabel}
            </div>
          </div>
          <Link
            href="/home"
            style={{ color: '#fff', fontSize: 12, fontWeight: 'bold', border: '1px solid rgba(255,255,255,0.45)', borderRadius: 2, padding: '7px 12px', whiteSpace: 'nowrap' }}
          >
            ← Back to Home
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch', gap: 2, padding: '0 14px', minHeight: 44, overflowX: 'auto' }}>
        {nav.map((n) => {
          const active = app.screen === n.screen || (app.screen === 'detail' && n.screen === 'registry');
          const badge = badges[n.screen] || 0;
          return (
            <button
              key={n.screen}
              onClick={() => (n.screen === 'new' ? app.newDraft() : app.go(n.screen))}
              className={`nav-tab${active ? ' active' : ''}`}
            >
              <span style={{ whiteSpace: 'nowrap' }}>{n.label}</span>
              {badge > 0 && (
                <span style={{ background: '#fff', color: '#2A7E4F', borderRadius: 9, fontSize: 10.5, fontWeight: 'bold', padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
