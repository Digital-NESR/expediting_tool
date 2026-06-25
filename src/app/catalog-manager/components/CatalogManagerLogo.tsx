// Brand mark for the Catalog Manager tool: a stack of catalog/rate cards,
// each with a price marker — the segmented price catalog the tool maintains.

export function CatalogLogoMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="13" y="14" width="38" height="11" rx="3" />
        <rect x="13" y="27" width="38" height="11" rx="3" />
        <rect x="13" y="40" width="38" height="11" rx="3" />
      </g>
      <g fill="currentColor">
        <circle cx="20" cy="19.5" r="2" />
        <circle cx="20" cy="32.5" r="2" />
        <circle cx="20" cy="45.5" r="2" />
      </g>
    </svg>
  );
}

export default function CatalogManagerLogo({
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
    <div className={`${sizes[size]} flex shrink-0 items-center justify-center overflow-hidden border border-[#307c4c]/15 bg-white p-1.5 text-[#307c4c] shadow-sm ${className}`}>
      <CatalogLogoMark className="h-full w-full" />
    </div>
  );
}
