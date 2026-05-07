import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Dashboard — TI-TE | SC Agents' };

export default function TiteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
