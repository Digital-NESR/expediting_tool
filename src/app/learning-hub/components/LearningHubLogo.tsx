import { GraduationCap } from 'lucide-react';

export default function LearningHubLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'hero' }) {
  const box = { sm: 'h-7 w-7', md: 'h-8 w-8', lg: 'h-10 w-10', hero: 'h-16 w-16' };
  const icon = { sm: 'h-4 w-4', md: 'h-[18px] w-[18px]', lg: 'h-5 w-5', hero: 'h-9 w-9' };
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl text-white shadow-sm ${box[size]}`}
      style={{ background: 'linear-gradient(135deg, #3a9560 0%, #307c4c 55%, #245b3c 100%)' }}
    >
      {/* subtle sheen for a bit of depth */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/25 to-transparent" />
      <GraduationCap className={`relative ${icon[size]}`} strokeWidth={2} />
    </div>
  );
}
