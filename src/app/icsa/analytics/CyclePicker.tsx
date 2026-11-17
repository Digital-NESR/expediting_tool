'use client';

import { usePathname, useRouter } from 'next/navigation';
import { INPUT, LABEL } from '../components/ui';

export default function CyclePicker({
  cycles,
  value,
}: {
  cycles: { id: number; label: string }[];
  value: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div className="w-full sm:w-64">
      <label className={LABEL} htmlFor="a-cycle">
        Cycle
      </label>
      <select
        id="a-cycle"
        className={INPUT}
        value={value}
        onChange={(e) => router.push(`${pathname}?cycle=${e.target.value}`)}
      >
        {cycles.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  );
}
