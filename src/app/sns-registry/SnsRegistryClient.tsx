'use client';

import { useState } from 'react';
import DashboardScreen from './components/DashboardScreen';
import DetailScreen from './components/DetailScreen';
import ExpiryScreen from './components/ExpiryScreen';
import InboxScreen from './components/InboxScreen';
import NewRecordWizard from './components/NewRecordWizard';
import RegistryScreen from './components/RegistryScreen';
import SnsRegistrySidebar from './components/SnsRegistrySidebar';
import { useRegistryApp } from './lib/useRegistryApp';
import type { ReferenceData, RegistryRecord, Screen, SnsViewer } from './lib/types';

/** What the topbar calls the screen you are on. */
const SCREEN_TITLE: Record<Screen, string> = {
  registry: 'Registry',
  detail: 'Registry Record',
  new: 'New Record',
  inbox: 'Validation Inbox',
  expiry: 'Expiry & Review',
  dash: 'Dashboard',
};

export default function SnsRegistryClient({
  viewer,
  reference,
  initialRecords,
  initialRecordId,
}: {
  viewer: SnsViewer;
  reference: ReferenceData;
  initialRecords: RegistryRecord[];
  initialRecordId: number | null;
}) {
  const app = useRegistryApp({ viewer, reference, initialRecords, initialRecordId });
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <SnsRegistrySidebar app={app} isOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Sticky so the burger stays reachable on a long registry, and on a
          narrow screen where the sidebar is a drawer rather than docked. */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:hidden"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-[0.9375rem] font-bold tracking-tight text-slate-900">
              {SCREEN_TITLE[app.screen]}
            </h1>
            <p className="truncate text-[0.6875rem] text-slate-400">
              System of record for single-quotation compliance
            </p>
          </div>

          <span className="ml-auto hidden shrink-0 rounded-full bg-[#307c4c]/10 px-3 py-1 text-[0.6875rem] font-semibold text-[#1d4f31] sm:inline">
            {viewer.isAdmin ? 'Admin · all countries' : 'S&S Registry'}
          </span>
        </div>
      </header>

      {app.error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-4 border-b border-red-200 bg-red-50 px-4 py-3 text-[0.8125rem] text-red-700 sm:px-6"
        >
          <span>{app.error}</span>
          <button
            type="button"
            onClick={() => app.setError(null)}
            className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1460px] px-4 pb-16 pt-6 sm:px-6">
        {app.screen === 'registry' && <RegistryScreen app={app} />}
        {app.screen === 'detail' && <DetailScreen app={app} />}
        {app.screen === 'new' && <NewRecordWizard app={app} />}
        {app.screen === 'inbox' && <InboxScreen app={app} />}
        {app.screen === 'expiry' && <ExpiryScreen app={app} />}
        {app.screen === 'dash' && <DashboardScreen app={app} />}
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-[1460px] flex-wrap items-center justify-between gap-3">
          <p className="text-[0.6875rem] text-slate-400">
            National Energy Services Reunited Corp. · www.nesr.com
          </p>
          <p className="text-[0.6875rem] text-slate-400">
            SAP remains the sole system of approval and execution
          </p>
        </div>
      </footer>
    </div>
  );
}
