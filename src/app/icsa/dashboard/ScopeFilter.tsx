'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { INPUT, LABEL } from '../components/ui';

/** The active scope: cycle, and for administrators a country or champion to look through. */
export default function ScopeFilter({
  cycles,
  countries,
  champions,
  value,
}: {
  cycles: { id: number; label: string }[];
  countries: string[];
  champions: { email: string; name: string | null }[];
  value: { cycle: string; country: string; champion: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = (key: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(key, v);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <label className={LABEL} htmlFor="s-cycle">
          Cycle
        </label>
        <select
          id="s-cycle"
          className={INPUT}
          value={value.cycle}
          onChange={(e) => set('cycle', e.target.value)}
        >
          <option value="all">All cycles</option>
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      {countries.length > 1 && (
        <div>
          <label className={LABEL} htmlFor="s-country">
            Country
          </label>
          <select
            id="s-country"
            className={INPUT}
            value={value.country}
            onChange={(e) => set('country', e.target.value)}
          >
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}
      {champions.length > 1 && (
        <div>
          <label className={LABEL} htmlFor="s-champ">
            Champion
          </label>
          <select
            id="s-champ"
            className={INPUT}
            value={value.champion}
            onChange={(e) => set('champion', e.target.value)}
          >
            <option value="">All champions</option>
            {champions.map((c) => (
              <option key={c.email} value={c.email}>
                {c.name || c.email}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
