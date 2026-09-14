'use client';

import { createContext, useContext } from 'react';
import type { LearningHubNavTrack } from '@/types/learning-hub';

/**
 * The sidebar's track list, loaded once by the Learning Hub layout (a server component)
 * and read by the sidebar wherever it is mounted. Every page under /learning-hub therefore
 * shares one source of truth instead of each client re-fetching or hard-coding links.
 */
const NavTracksContext = createContext<LearningHubNavTrack[]>([]);

export function LearningHubNavProvider({
  tracks,
  children,
}: {
  tracks: LearningHubNavTrack[];
  children: React.ReactNode;
}) {
  return <NavTracksContext.Provider value={tracks}>{children}</NavTracksContext.Provider>;
}

export function useLearningHubNavTracks(): LearningHubNavTrack[] {
  return useContext(NavTracksContext);
}
