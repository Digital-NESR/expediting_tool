import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'NESR | PO Expediting' };

export default function PoExpeditingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
