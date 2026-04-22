import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Expedite Queue — PO Expediting | SC Agents' };

export default function QueueLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
