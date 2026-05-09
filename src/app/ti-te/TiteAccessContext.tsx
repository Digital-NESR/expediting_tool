'use client';

import { createContext, useContext } from 'react';

/* ─── Types ──────────────────────────────────────────────────── */

interface TiteAccessContextType {
  isAdmin: boolean;
  approvedCountries: string[];
  hasFullAccess: boolean;
}

/* ─── Context ────────────────────────────────────────────────── */

const TiteAccessContext = createContext<TiteAccessContextType>({
  isAdmin: false,
  approvedCountries: [],
  hasFullAccess: false,
});

/* ─── Provider ───────────────────────────────────────────────── */

export function TiteAccessProvider({
  children,
  isAdmin,
  approvedCountries,
}: {
  children: React.ReactNode;
  isAdmin: boolean;
  approvedCountries: string[];
}) {
  return (
    <TiteAccessContext.Provider
      value={{ isAdmin, approvedCountries, hasFullAccess: isAdmin }}
    >
      {children}
    </TiteAccessContext.Provider>
  );
}

/* ─── Hook ───────────────────────────────────────────────────── */

export function useTiteAccess() {
  return useContext(TiteAccessContext);
}
