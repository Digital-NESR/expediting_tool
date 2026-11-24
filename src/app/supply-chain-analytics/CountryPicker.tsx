'use client';

/* The Health Board's country picker: one country at a time, Global pinned on top, type to filter.
   Each choice is a real link (prefetched by Next), so the page itself stays server-rendered and
   the numbers are computed on the server for exactly the country in the URL. */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface CountryLink {
  country: string;
  href: string;
}

export default function CountryPicker({
  current,
  links,
}: {
  current: string;
  links: CountryLink[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [pinned, rest] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = links.filter((l) => !q || l.country.toLowerCase().includes(q));
    return [
      match.filter((l) => l.country === 'Global'),
      match.filter((l) => l.country !== 'Global'),
    ];
  }, [links, query]);
  const options = [...pinned, ...rest];

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && options[active]) {
      e.preventDefault();
      setOpen(false);
      router.push(options[active].href);
    }
  }

  const item = (l: CountryLink, i: number) => (
    <li key={l.country}>
      <Link
        href={l.href}
        onClick={() => setOpen(false)}
        onMouseEnter={() => setActive(i)}
        aria-current={l.country === current ? 'page' : undefined}
        className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm ${
          i === active ? 'bg-[#307c4c]/10 text-slate-900' : 'text-slate-700'
        } ${l.country === current ? 'font-semibold' : ''}`}
      >
        {l.country}
        {l.country === current && <Check className="h-4 w-4 text-[#307c4c]" />}
      </Link>
    </li>
  );

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setQuery('');
          setActive(0);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex min-w-[200px] items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm hover:border-[#307c4c]/40"
      >
        <span>
          <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Country
          </span>
          <span className="font-semibold text-slate-900">{current}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <label className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 focus-within:border-[#307c4c]">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              ref={input}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKey}
              placeholder="Search countries"
              aria-label="Search countries"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </label>
          <ul className="max-h-72 overflow-y-auto" role="listbox">
            {pinned.map((l, i) => item(l, i))}
            {pinned.length > 0 && rest.length > 0 && (
              <li className="my-1 border-t border-slate-100" />
            )}
            {rest.map((l, i) => item(l, i + pinned.length))}
            {options.length === 0 && (
              <li className="px-2.5 py-2 text-sm text-slate-400">No country matches.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
