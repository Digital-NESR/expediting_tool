'use client';

import LaptopShell from '../components/LaptopShell';
import LaptopHelpContent from '../components/LaptopHelpContent';
import type { LaptopAccessView } from '@/types/laptopProcurement';

export default function LaptopHelpClient({ accessView }: { accessView: LaptopAccessView }) {
  return (
    <LaptopShell
      title="Help & Training"
      subtitle="Choose your role, then read the guide for it."
      accessView={accessView}
    >
      <LaptopHelpContent />
    </LaptopShell>
  );
}
