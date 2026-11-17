import type { ReviewRating, Severity } from '@/lib/icsa/ai';

const RATING = {
  strong: ['Strong', 'bg-[#2a7e4f]/10 text-[#2a7e4f]'],
  adequate: ['Adequate', 'bg-amber-50 text-amber-700'],
  weak: ['Weak', 'bg-red-50 text-red-700'],
} as const;

export function RatingChip({ rating }: { rating: ReviewRating }) {
  const [label, tone] = RATING[rating] ?? RATING.adequate;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>{label}</span>;
}

const SEVERITY = {
  high: 'bg-red-50 text-red-700',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
} as const;

export function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide ${SEVERITY[severity] ?? SEVERITY.medium}`}
    >
      {severity}
    </span>
  );
}
