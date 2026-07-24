import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export { authOptions };

export interface ProcureGuardSessionUser {
  email: string;
  name: string;
  department?: string | null;
  jobTitle?: string | null;
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
