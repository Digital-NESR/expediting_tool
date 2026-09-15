/* ─── Home / tool launcher ───────────────────────────────────────
   Server component: the decorative background, the header chrome and the
   SCAI panel are plain markup and never reach the browser as JavaScript.
   The interactive half lives in <ToolLauncher> (client). */

import Image from 'next/image';
import HeaderUser from './HeaderUser';
import ScaiPanel from './ScaiPanel';
import ToolLauncher from './ToolLauncher';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 font-sans text-slate-900 relative overflow-hidden">
      {/* ── Decorative background graphics ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        {/* Top-right large semicircle */}
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full border-[60px] border-[#307c4c]/[0.04]" />
        {/* Bottom-left semicircle */}
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] rounded-full bg-[#307c4c]/[0.03]" />
        {/* Mid-right arc */}
        <div className="absolute top-1/3 -right-20 w-[300px] h-[300px] rounded-full border-[40px] border-[#307c4c]/[0.035] border-l-transparent border-b-transparent" />
        {/* Top-left small circle */}
        <div className="absolute top-48 left-16 w-[180px] h-[180px] rounded-full bg-[#307c4c]/[0.025]" />
        {/* Bottom-right ring */}
        <div className="absolute bottom-24 right-1/4 w-[220px] h-[220px] rounded-full border-[30px] border-[#307c4c]/[0.03]" />
        {/* Center-left half-circle clipped */}
        <div className="absolute top-2/3 -left-24 w-[350px] h-[350px] rounded-full border-[50px] border-[#307c4c]/[0.03] border-r-transparent border-t-transparent" />
        {/* Top-center arc */}
        <div className="absolute -top-16 left-1/3 w-[400px] h-[400px] rounded-full border-[45px] border-[#307c4c]/[0.03] border-b-transparent border-l-transparent" />
        {/* Mid-left semicircle */}
        <div className="absolute top-1/2 -left-48 w-[450px] h-[450px] rounded-full border-[55px] border-[#307c4c]/[0.035] border-l-transparent" />
        {/* Bottom-center filled */}
        <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-[#307c4c]/[0.02]" />
        {/* Right edge mid-bottom arc */}
        <div className="absolute bottom-1/3 -right-36 w-[380px] h-[380px] rounded-full border-[42px] border-[#307c4c]/[0.03] border-r-transparent border-t-transparent" />
        {/* Small accent dot top-right area */}
        <div className="absolute top-28 right-1/3 w-[120px] h-[120px] rounded-full bg-[#307c4c]/[0.025]" />
        {/* Large faint ring center */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full border-[35px] border-[#307c4c]/[0.018]" />
      </div>

      {/* ── Header ── */}
      <header className="h-16 bg-white border-b border-gray-200 px-6 lg:px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Image
            src="/nesr-logo-circle.png"
            alt="NESR"
            width={36}
            height={36}
            className="rounded-full"
          />
          <span className="font-semibold text-slate-900 text-sm tracking-tight">
            NESR Digital Supply Chain
          </span>
        </div>

        <HeaderUser />
      </header>

      {/* ── Main ── */}
      <main className="flex-1 px-8 py-12 relative z-10">
        <div className="max-w-[1400px] mx-auto">
          <ToolLauncher scaiPanel={<ScaiPanel />} />
        </div>
      </main>
    </div>
  );
}
