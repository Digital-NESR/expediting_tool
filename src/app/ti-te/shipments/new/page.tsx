'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import TiteSidebar from '@/components/TiteSidebar';

export default function NewShipmentPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <TiteSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center gap-3 shrink-0 sticky top-0 z-30">
        <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0" style={{ background: '#006B0C' }}>
          <span className="text-white font-extrabold text-[10px] tracking-tight">TI·TE</span>
        </div>
        <span className="font-semibold text-slate-900 text-sm">New Shipment</span>
      </header>

      <main className="max-w-[700px] mx-auto px-6 pb-16 pt-10">
        <div className="mb-6">
          <p className="text-xs text-slate-400 mb-1">
            <button className="hover:underline text-[#006B0C]" onClick={() => router.push('/ti-te/shipments')}>
              Shipment register
            </button>
            {' / '}New shipment
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Add new shipment</h1>
          <p className="text-sm text-slate-500 mt-1">Log a new temporary import or export movement.</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5" style={{ background: '#006B0C18' }}>
              <svg className="w-7 h-7" style={{ color: '#006B0C' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Shipment form coming soon</h2>
            <p className="text-sm text-slate-500 max-w-sm leading-relaxed mb-6">
              The ability to log new TI-TE shipments directly from this portal is under development. For now, please add records directly in the database.
            </p>
            <button
              onClick={() => router.push('/ti-te/shipments')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: '#006B0C' }}
            >
              ← Back to register
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
