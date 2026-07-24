import { getServerSession as nextAuthGetServerSession } from 'next-auth';
import type { NextAuthOptions, Session } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export { authOptions };

export interface ProcureGuardSessionUser {
  email: string;
  name: string;
  department?: string | null;
  jobTitle?: string | null;
}

/**
 * Local no-SSO mode. Enabled unless LOCAL_DEV_AUTH is explicitly set to 'false'.
 * When on, the whole app is reachable without a Microsoft/Azure AD login: the
 * session helpers below return a full-access admin session.
 */
export function isLocalDevAuthEnabled(): boolean {
  return process.env.LOCAL_DEV_AUTH !== 'false';
}

function localDevUser(): ProcureGuardSessionUser {
  return {
    email: process.env.LOCAL_DEV_EMAIL ?? 'local.user@example.com',
    name: process.env.LOCAL_DEV_NAME ?? 'Local User',
    department: process.env.LOCAL_DEV_DEPARTMENT ?? 'Local Testing',
    jobTitle: process.env.LOCAL_DEV_JOB_TITLE ?? 'Local Tester',
  };
}

export function getLocalDevSession(): Session {
  const u = localDevUser();
  const approved = { status: 'approved' as const, approvedCountries: [] as string[] };

  return {
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(),
    user: {
      email: u.email,
      name: u.name,
      image: null,
      department: u.department ?? undefined,
      jobTitle: u.jobTitle ?? undefined,
      isAdmin: true,
      titeViewOnly: false,
      toolAccess: {
        po_expediting: { ...approved },
        tite: { ...approved },
        procure_guard: { ...approved, accessType: 'admin' },
        sourceguide: { ...approved },
      },
    },
  };
}

/**
 * Drop-in replacement for next-auth's getServerSession, imported throughout the
 * app in place of the real one. In local no-SSO mode it returns a full-access
 * admin session so every tool is reachable without signing in; otherwise it
 * delegates to next-auth unchanged.
 */
export async function getServerSession(options: NextAuthOptions): Promise<Session | null> {
  if (isLocalDevAuthEnabled()) {
    return getLocalDevSession();
  }
  return nextAuthGetServerSession(options);
}

export async function getProcureGuardUser(): Promise<ProcureGuardSessionUser | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) return null;

  return {
    email,
    name: session.user.name ?? email,
    department: session.user.department ?? null,
    jobTitle: session.user.jobTitle ?? null,
  };
}
