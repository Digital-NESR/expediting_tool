import { STATUS_CLASS, STATUS_LABEL, type DisplayStatus } from '@/lib/safesign/model';

export default function StatusPill({ status, className = '' }: { status: DisplayStatus; className?: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_CLASS[status]} ${className}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
