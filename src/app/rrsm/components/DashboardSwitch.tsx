/**
 * For a country that runs both modules: one dashboard each, and this switch between them at the
 * top of both. `/rrsm` is equipment rentals; `/rrsm?board=recurrent` is recurrent services.
 */
import Link from 'next/link';
import { Repeat, Truck } from 'lucide-react';
import { rrsmHref } from '@/lib/rrsm/nav';

export type DashboardBoard = 'rentals' | 'recurrent';

export default function DashboardSwitch({
  current,
  countryCode,
}: {
  current: DashboardBoard;
  countryCode: string;
}) {
  const base = rrsmHref('/rrsm', countryCode);
  const tabs: [DashboardBoard, string, typeof Repeat, string][] = [
    ['rentals', 'Equipment rentals', Truck, base],
    [
      'recurrent',
      'Recurrent services',
      Repeat,
      `${base}${base.includes('?') ? '&' : '?'}board=recurrent`,
    ],
  ];
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {tabs.map(([key, label, Icon, href]) => (
        <Link
          key={key}
          href={href}
          aria-current={current === key ? 'page' : undefined}
          className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
            current === key ? 'bg-[#307c4c] text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Icon className="h-4 w-4" /> {label}
        </Link>
      ))}
    </div>
  );
}
