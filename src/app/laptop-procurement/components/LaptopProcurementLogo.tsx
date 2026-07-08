// Brand mark for the Laptop Procurement tool: a green shopping cart carrying a
// laptop whose screen shows a recycling symbol (device procurement / refresh).

export function LaptopLogoMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Laptop screen */}
      <rect x="18" y="4" width="28" height="18" rx="2.5" fill="#307c4c" />
      <rect x="21" y="7" width="22" height="12" rx="1.5" fill="#ffffff" />
      {/* Recycle symbol (three chasing arrows) */}
      <g transform="translate(26.7 7.7) scale(0.44)" fill="none" stroke="#1f1f1d" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5" />
        <path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12" />
        <path d="m14 16-3 3 3 3" />
        <path d="M8.293 13.596 7.196 9.5 3.1 10.598" />
        <path d="m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843" />
        <path d="m13.378 9.633 4.096 1.098 1.097-4.096" />
      </g>
      {/* Laptop base */}
      <polygon points="16,22 48,22 52,27 12,27" fill="#307c4c" />
      {/* Cart handle */}
      <rect x="3" y="9" width="8" height="3" rx="1.5" fill="#307c4c" />
      <path d="M9 11 L16 31" stroke="#307c4c" strokeWidth="3" strokeLinecap="round" />
      {/* Cart basket */}
      <polygon points="14,31 53,31 48,45 19,45" fill="#307c4c" />
      <g stroke="#ffffff" strokeWidth="2">
        <line x1="23" y1="32" x2="22" y2="44" />
        <line x1="31" y1="32" x2="30.5" y2="44" />
        <line x1="39" y1="32" x2="39" y2="44" />
        <line x1="46" y1="32" x2="47" y2="44" />
      </g>
      {/* Wheels */}
      <circle cx="25" cy="51" r="3.4" fill="#307c4c" />
      <circle cx="25" cy="51" r="1.3" fill="#ffffff" />
      <circle cx="44" cy="51" r="3.4" fill="#307c4c" />
      <circle cx="44" cy="51" r="1.3" fill="#ffffff" />
    </svg>
  );
}

export default function LaptopProcurementLogo({
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
    <div className={`${sizes[size]} flex shrink-0 items-center justify-center overflow-hidden border border-white/70 bg-white/85 p-1 shadow-[0_6px_16px_rgba(36,96,63,0.22)] backdrop-blur ${className}`}>
      <LaptopLogoMark className="h-full w-full" />
    </div>
  );
}
