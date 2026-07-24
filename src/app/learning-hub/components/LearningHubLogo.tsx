export default function LearningHubLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'hero' }) {
  const sizes = { sm: 'h-7 w-7 text-[11px]', md: 'h-8 w-8 text-xs', lg: 'h-10 w-10 text-sm', hero: 'h-16 w-16 text-xl' };
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-xl bg-white font-extrabold tracking-tight text-[#307c4c] shadow-sm ${sizes[size]}`}>
      LH
    </div>
  );
}
