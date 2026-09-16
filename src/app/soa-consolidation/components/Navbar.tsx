import Image from 'next/image';
import type { Role, ScreenProps } from '../types';

export default function Navbar({ vm }: ScreenProps) {
  return (
    <nav className="bg-sns-green h-[54px] flex items-center px-[18px] gap-3 shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.2)] z-10">
      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 overflow-hidden">
        <Image src="/nesr-logo-circle.png" alt="NESR" width={26} height={26} />
      </div>
      <div className="border-l border-l-[rgba(255,255,255,0.3)] pl-3">
        <div className="text-[rgba(255,255,255,0.65)] text-[10px] tracking-[0.3px]">
          SOA Consolidation Portal
        </div>
      </div>
      <div className="bg-[rgba(0,0,0,0.18)] rounded-[20px] px-2.5 py-[3px] text-[11px] text-[rgba(255,255,255,0.9)] font-bold tracking-[0.5px]">
        Q3 2026
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        <span className="text-[rgba(255,255,255,0.65)] text-[11px]">Viewing as:</span>
        <select
          value={vm.role}
          onChange={(e) => vm.onRoleChange(e.target.value as Role)}
          className="bg-[rgba(0,0,0,0.2)] border border-[rgba(255,255,255,0.2)] text-white px-2 py-[5px] rounded-md text-[12px] cursor-pointer outline-none"
        >
          <option value="champion" className="text-sns-ink bg-white">
            SC SOA Champion
          </option>
          <option value="manager" className="text-sns-ink bg-white">
            Supply Chain Manager
          </option>
          <option value="director" className="text-sns-ink bg-white">
            Supply Chain Director
          </option>
        </select>
      </div>
      <div className="bg-[rgba(255,255,255,0.18)] rounded-full w-8 h-8 flex items-center justify-center text-white font-bold text-[13px] shrink-0">
        A
      </div>
    </nav>
  );
}
