'use client';

import { createContext, useContext } from 'react';

interface SourceGuideAccessContextType {
  isAdmin: boolean;
  /** country codes the user may edit ('All Countries - View Only' grants none) */
  approvedCountries: string[];
  viewOnly: boolean;
  userName: string;
  /** true when the user can amend mappings for a given country code */
  canEdit: (countryCode: string) => boolean;
}

const SourceGuideAccessContext = createContext<SourceGuideAccessContextType>({
  isAdmin: false,
  approvedCountries: [],
  viewOnly: false,
  userName: '',
  canEdit: () => false,
});

export function SourceGuideAccessProvider({
  children,
  isAdmin,
  approvedCountries,
  viewOnly,
  userName,
}: {
  children: React.ReactNode;
  isAdmin: boolean;
  approvedCountries: string[];
  viewOnly: boolean;
  userName: string;
}) {
  const canEdit = (countryCode: string) => {
    if (isAdmin) return true;
    if (viewOnly) return false;
    return approvedCountries.includes(countryCode);
  };
  return (
    <SourceGuideAccessContext.Provider value={{ isAdmin, approvedCountries, viewOnly, userName, canEdit }}>
      {children}
    </SourceGuideAccessContext.Provider>
  );
}

export function useSourceGuideAccess() {
  return useContext(SourceGuideAccessContext);
}
