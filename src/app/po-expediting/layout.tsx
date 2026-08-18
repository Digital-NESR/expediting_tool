import type { Metadata } from 'next';
// Side-effect import: logs presence of critical env vars once per cold start (production only).
import '@/lib/startup-check';

export const metadata: Metadata = { title: 'NESR | PO Expediting' };

export default function PoExpeditingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
