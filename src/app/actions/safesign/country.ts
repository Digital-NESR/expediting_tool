'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { AccessError } from '@/lib/require-access';
import { COUNTRY_COOKIE, canUseCountry, requireSafeSignUser } from '@/lib/safesign/access';

/** Switch the country SafeSign shows. Only to a country this person already has. */
export async function setSafeSignCountry(countryId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireSafeSignUser();
    if (!canUseCountry(actor, countryId)) return { success: false, error: 'That country is not yours.' };
    (await cookies()).set(COUNTRY_COOKIE, countryId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
    revalidatePath('/safesign', 'layout');
    return { success: true };
  } catch (err) {
    if (err instanceof AccessError) return { success: false, error: err.message };
    throw err;
  }
}
