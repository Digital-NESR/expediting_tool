'use client';

import Image from 'next/image';

export default function ProcureGuardLogo({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg' | 'hero';
  className?: string;
}) {
  const sizes = {
    sm: 'h-7 w-7 rounded-lg',
    md: 'h-8 w-8 rounded-lg',
    lg: 'h-10 w-10 rounded-xl',
    hero: 'h-16 w-16 rounded-2xl',
  };

  return (
    <div className={`${sizes[size]} shrink-0 overflow-hidden border border-[#307c4c]/15 bg-white shadow-sm ${className}`}>
      <Image
        src="/procureguard-logo.jpg"
        alt="ProcureGuard"
        width={96}
        height={96}
        sizes="64px"
        className="h-full w-full object-cover"
      />
    </div>
  );
}
