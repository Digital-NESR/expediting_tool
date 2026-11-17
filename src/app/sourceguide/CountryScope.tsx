'use client';

/**
 * The country the reader is working in, remembered across screens.
 *
 * WHY THIS EXISTS. Country is what makes SourceGuide legible: a sub-category holds 41 suppliers
 * across every country and 5 in any one of them. Yet every screen owned its own country state
 * and most hops threw it away — the supplier profile dropped it on the way to a commodity, the
 * taxonomy never had it, and the commodity page never wrote it to the URL, so a reload lost it.
 * Meanwhile `view/country` is the most-used event in the tool: 384 views by 46 of the 47 people
 * who have ever opened it. People already navigate by country. The tool just kept forgetting.
 *
 * A VIEW PREFERENCE, NOT A PERMISSION. Every approved SourceGuide user reads every country, by
 * design — see the note in `tool-scope.ts`. Nothing here narrows what may be read, and "All
 * countries" is always one click away. A champion's own country is only the opening default,
 * because it is the one they are most likely to want, never a boundary.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { getCountries } from '@/app/actions/sourceguide/reference';
import { SG_BRAND, SG_BRAND_SOFT } from './constants';
import { useSourceGuideAccess } from './SourceGuideAccessContext';
import type { SgCountry } from '@/types/sourceguide';

/** localStorage key, beside `SG_PIN_KEY`. */
export const SG_COUNTRY_KEY = 'sg-country';

interface ScopeValue {
  /** The chosen country code, or null for every country. */
  country: string | null;
  setCountry: (code: string | null) => void;
  countries: SgCountry[];
  /** The chosen country's record, when one is chosen and known. */
  current: SgCountry | null;
  /** Appends `?country=` to a href, so the scope survives the hop. */
  withCountry: (href: string) => string;
}

const Ctx = createContext<ScopeValue>({
  country: null,
  setCountry: () => {},
  countries: [],
  current: null,
  withCountry: (h) => h,
});

export function useCountryScope(): ScopeValue {
  return useContext(Ctx);
}

export function CountryScopeProvider({
  children,
  initialCountry,
}: {
  children: React.ReactNode;
  /**
   * Opens in this country instead of working one out. Only the dev-preview route passes it:
   * the real screens are behind SSO, and a preview that cannot exercise the filter the whole
   * design rests on is not worth looking at. Unset everywhere else.
   */
  initialCountry?: string;
}) {
  const { approvedCountries } = useSourceGuideAccess();
  const params = useSearchParams();
  const urlCountry = params.get('country');

  const [countries, setCountries] = useState<SgCountry[]>([]);
  const [country, setCountryState] = useState<string | null>(initialCountry ?? null);

  /* The opening choice is settled in this callback rather than in an effect of its own, because
     it cannot be made until the country list arrives: a stored or shared code has to be checked
     against what exists, and one that no longer does is discarded rather than left showing a
     country nobody can see anything in. Resolving it where the external data lands also keeps
     the whole thing to one render.

     Only the opening choice. `approvedCountries` and the URL are deliberately read once, at
     mount — the only moment they decide anything. After that the reader owns the picker, and
     re-running this because the URL gained a country would overwrite the choice they just made
     with the one their last link happened to carry. Hence the empty dependency list. */
  useEffect(() => {
    let alive = true;
    getCountries()
      .then((rows) => {
        if (!alive) return;
        setCountries(rows);
        if (initialCountry) return;

        const known = new Set(rows.map((c) => c.code));
        const fromLink = urlCountry;
        const mine = approvedCountries;

        /* A country in the link the reader followed beats what they last chose: a shared link
           that silently reframes itself to the recipient's own country is a link that showed
           them something other than what the sender was looking at. */
        if (fromLink && known.has(fromLink)) {
          setCountryState(fromLink);
          return;
        }

        let raw: string | null = null;
        try {
          raw = window.localStorage.getItem(SG_COUNTRY_KEY);
        } catch {
          /* Private window, blocked storage — the default below still applies. */
        }
        if (raw === 'ALL') return; // chosen "all countries", which is already the initial state
        if (raw && known.has(raw)) {
          setCountryState(raw);
          return;
        }

        /* No stored preference. A champion holding exactly one country opens in it; with more
           than one there is no single right answer, so the honest default is all of them. */
        if (mine.length === 1 && known.has(mine[0])) setCountryState(mine[0]);
      })
      .catch(() => {
        /* The picker degrades to "All countries" rather than breaking the page it sits in. */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; see the note above
  }, []);

  const setCountry = useCallback((code: string | null) => {
    setCountryState(code);
    try {
      window.localStorage.setItem(SG_COUNTRY_KEY, code ?? 'ALL');
    } catch {
      /* The choice still applies for this session. */
    }
  }, []);

  const withCountry = useCallback(
    (href: string) => {
      if (!country) return href;
      const [path, hash] = href.split('#');
      const joiner = path.includes('?') ? '&' : '?';
      return `${path}${joiner}country=${encodeURIComponent(country)}${hash ? `#${hash}` : ''}`;
    },
    [country],
  );

  const value = useMemo<ScopeValue>(
    () => ({
      country,
      setCountry,
      countries,
      current: countries.find((c) => c.code === country) ?? null,
      withCountry,
    }),
    [country, setCountry, countries, withCountry],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ─── the picker ─────────────────────────────────────────────── */

export function CountryScopePicker({ compact }: { compact?: boolean }) {
  const { country, setCountry, countries, current } = useCountryScope();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  if (!countries.length) return null;

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="The country these results are scoped to"
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 transition-colors hover:border-[#6AAF8E]"
      >
        {current ? (
          <span
            className="h-3 w-4 shrink-0 rounded-sm"
            style={{ background: current.tone ?? '#999' }}
          />
        ) : (
          <Globe className="h-4 w-4 text-slate-400" />
        )}
        <span className={compact ? 'hidden sm:inline' : ''}>
          {current ? current.name : 'All countries'}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 max-h-[70vh] w-60 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
          <Option
            label="All countries"
            selected={country === null}
            onPick={() => {
              setCountry(null);
              setOpen(false);
            }}
          />
          <div className="my-1 border-t border-slate-100" />
          {countries.map((c) => (
            <Option
              key={c.code}
              label={c.name}
              tone={c.tone}
              selected={country === c.code}
              onPick={() => {
                setCountry(c.code);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Option({
  label,
  tone,
  selected,
  onPick,
}: {
  label: string;
  tone?: string | null;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-slate-50"
      style={selected ? { background: SG_BRAND_SOFT } : undefined}
    >
      {tone !== undefined ? (
        <span className="h-3 w-4 shrink-0 rounded-sm" style={{ background: tone ?? '#999' }} />
      ) : (
        <Globe className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      )}
      <span className="flex-1 truncate text-slate-700">{label}</span>
      {selected && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: SG_BRAND }} />}
    </button>
  );
}
