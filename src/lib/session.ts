import { cache } from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/* Dedupe getServerSession() within a single request render. The admin
   layout and the [app] page both need the session; wrapping the call in
   React's cache() means they share one evaluation (one jwt/session pass)
   per request instead of two. */
export const getCachedSession = cache(() => getServerSession(authOptions));
