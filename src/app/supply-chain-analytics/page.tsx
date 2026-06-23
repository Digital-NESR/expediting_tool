'use client';

import { useRouter } from 'next/navigation';
import { BarChart3, ArrowLeft } from 'lucide-react';

export default function SupplyChainAnalyticsPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 font-sans text-slate-900">

      {/* Header */}
      <header className="h-14 bg-white border-b border-gray-200 px-6 flex items-center gap-4 shrink-0">
        <button
          onClick={() => router.push('/home')}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </button>
        <div className="h-5 w-px bg-gray-200" />
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#307c4c]" />
          <span className="text-sm font-semibold text-slate-900">Supply Chain Analytics</span>
        </div>
        <span className="ml-2 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-400">
          Admin Preview
        </span>
      </header>

      {/* Dashboard */}
      <main className="flex-1 flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 bg-white">
          <h1 className="text-lg font-bold text-slate-900">Supply Chain Health Board</h1>
          <p className="text-sm text-slate-400 mt-0.5">KPI Dashboard — 2026</p>
        </div>

        <div className="flex-1 p-6">
          <div className="w-full h-full min-h-[600px] bg-white rounded-xl border border-gray-200 overflow-hidden">
            <iframe
              title="Supply Chain Health Board - 2026"
              src="https://app.powerbi.com/reportEmbed?reportId=c1485412-17dc-476d-8c80-dc56714d9e53&autoAuth=true&ctid=5f13d1c2-10ac-49b8-a85e-4bb3d91135b9"
              className="w-full h-full min-h-[600px] border-0"
              allowFullScreen
            />
          </div>
        </div>
      </main>
    </div>
  );
}
