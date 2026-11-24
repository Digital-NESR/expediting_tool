'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { AccessError } from '@/lib/require-access';
import { requireRealSafeSignAdmin, VIEW_AS_COOKIE, VIEW_AS_ROLES } from '@/lib/safesign/access';

/**
 * Switch an admin's View as role, or pass null to go back to admin.
 * Only someone whose real (SSO) role is admin may call it; for anybody else the cookie would be
 * ignored anyway, but refusing here keeps the intent obvious.
 */
export async function setSafeSignViewAs(role: string | null): Promise<{ success: boolean; error?: string }> {
  try {
    await requireRealSafeSignAdmin();
    const jar = await cookies();
    if (role && (VIEW_AS_ROLES as readonly string[]).includes(role)) {
      jar.set(VIEW_AS_COOKIE, role, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 8,
      });
    } else {
      jar.delete(VIEW_AS_COOKIE);
    }
    revalidatePath('/safesign', 'layout');
    return { success: true };
  } catch (err) {
    if (err instanceof AccessError) return { success: false, error: err.message };
    throw err;
  }
}
