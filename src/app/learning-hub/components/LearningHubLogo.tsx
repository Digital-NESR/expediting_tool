import { GraduationCap } from 'lucide-react';

export default function LearningHubLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'hero' }) {
  const box = { sm: 'h-7 w-7', md: 'h-8 w-8', lg: 'h-10 w-10', hero: 'h-16 w-16' };
  const icon = { sm: 'h-4 w-4', md: 'h-[18px] w-[18px]', lg: 'h-5 w-5', hero: 'h-9 w-9' };
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80 ${box[size]}`}
    >
      <GraduationCap className={`${icon[size]} text-[#307c4c]`} strokeWidth={2} />
    </div>
  );
}
