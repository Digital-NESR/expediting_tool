import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'NESR | Confirm & Dispatch - PO Expediting' };

export default function ConfirmLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
