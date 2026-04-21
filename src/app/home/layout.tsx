import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'SC Agents — NESR Digital Supply Chain' };

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
