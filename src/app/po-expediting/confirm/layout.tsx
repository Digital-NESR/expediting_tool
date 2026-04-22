import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Confirm & Dispatch — PO Expediting | SC Agents' };

export default function ConfirmLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
