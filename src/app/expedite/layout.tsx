import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Expedite Queue — SC Agents' };

export default function ExpediteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
