import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'NESR | Expedite Queue - PO Expediting' };

export default function QueueLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
