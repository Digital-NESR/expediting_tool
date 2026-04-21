import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sign In — NESR SC Agents' };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
