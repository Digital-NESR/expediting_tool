'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

/**
 * Slim top bar shared by the AI Learning landing page and module pages.
 * Mirrors the app header on /home (logo + platform name).
 */
export default function AiLearningHeader() {
  return (
    <header className="h-16 bg-white border-b border-gray-200 px-6 lg:px-8 flex items-center justify-between shrink-0">
      <Link href="/home" className="flex items-center gap-3 group">
        <Image src="/nesr-logo-circle.png" alt="NESR" width={36} height={36} className="rounded-full" />
        <span className="font-semibold text-slate-900 text-sm tracking-tight group-hover:text-slate-600 transition-colors">
          NESR Digital Supply Chain
        </span>
      </Link>

      <div className="flex items-center gap-2 text-slate-500">
        <Sparkles className="w-4 h-4 text-[#307c4c]" />
        <span className="text-sm font-medium">AI Learning Series</span>
      </div>
    </header>
  );
}
