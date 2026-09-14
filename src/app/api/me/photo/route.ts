import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { normalizeEmail } from '@/lib/require-access';
import { getUserPhoto } from '@/lib/user-photo';

/* Serves the signed-in user's Microsoft Graph avatar.

   This is the other half of keeping the avatar out of the session JWT:
   session.user.image now points here instead of carrying a base64 data
   URI, so the encrypted session cookie — sent on every request and
   decrypted by middleware — no longer hauls several kilobytes of JPEG.

   Authenticated and strictly self-scoped: the email comes from the
   session, never from the request, so there is no way to ask for
   somebody else's photo. Cached `private` so it stays in the user's
   own browser cache and never in a shared/CDN one. */

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = normalizeEmail(session?.user?.email);
  if (!email) {
    return new Response('Unauthorized', { status: 401 });
  }

  const found = await getUserPhoto(email);
  if (!found) {
    // No avatar on file — the sidebars fall back to initials on a failed load.
    return new Response('Not Found', { status: 404 });
  }

  return new Response(new Uint8Array(found.photo), {
    status: 200,
    headers: {
      'Content-Type': found.contentType,
      'Content-Length': String(found.photo.length),
      'Cache-Control': 'private, max-age=86400, must-revalidate',
    },
  });
}
