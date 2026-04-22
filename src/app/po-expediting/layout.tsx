import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Dashboard — PO Expediting | SC Agents' };

export default function PoExpeditingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
