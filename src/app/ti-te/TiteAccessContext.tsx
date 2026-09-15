'use client';

import { createContext } from 'react';

/* ─── Types ──────────────────────────────────────────────────── */

interface TiteAccessContextType {
  isAdmin: boolean;
  approvedCountries: string[];
}

/* ─── Context ────────────────────────────────────────────────── */

const TiteAccessContext = createContext<TiteAccessContextType>({
  isAdmin: false,
  approvedCountries: [],
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
      value={{ isAdmin, approvedCountries }}
    >
      {children}
    </TiteAccessContext.Provider>
  );
}

/* `useTiteAccess()` and the `hasFullAccess` mirror of `isAdmin` were deleted: no
   component in src/ ever read this context (grep -rn "useTiteAccess"), so both
   were dead. Every TI-TE page takes its scope from `getToolScope` on the server
   instead. The provider itself stays because ti-te/layout.tsx still renders it. */
