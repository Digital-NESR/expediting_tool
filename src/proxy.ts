/**
 * Request gate for the whole app: signed out goes to /login, and /po-expediting checks its own
 * tool-level grant.
 *
 * This was `src/middleware.ts` until Next 16 deprecated that file convention and renamed it to
 * `proxy`. Same matcher, same logic, same order of checks; only the filename and the exported
 * function name changed. The deprecation warned on every dev server boot, and AGENTS.md says to
 * heed the deprecation notices in the bundled Next docs.
 *
 * Note for anyone extending this: a proxy runs in front of the app and may be deployed to the
 * CDN, so it must not reach for shared modules, globals or a database. Everything it needs has
 * to come from the request itself. That is why the tool-access check below reads the JWT cookie
 * rather than asking the database, and why a stale cookie is a known limitation of this gate
 * rather than something to fix here.
 */
import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/request-access',
  '/pending-approval',
  '/access-denied',
  '/supplier-update',
  '/help',
];

// Machine-to-machine API endpoints. Their callers (Vercel Cron, n8n) never carry a
// NextAuth cookie, so the blanket 401 below would make them permanently unreachable.
// Each handler enforces its own shared secret instead — that is the gate here, not
// the session cookie. Matched exactly (trailing slash allowed) so nothing else slips
// past the cookie check; the laptop path has a dynamic <id> segment.
const MACHINE_PATHS = [
  /^\/api\/procure-guard\/reminders\/?$/,
  /^\/api\/laptop-procurement\/requests\/[^/]+\/status\/?$/,
  /^\/api\/catalog-manager\/revalidate\/?$/,
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths through without any auth check
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Machine endpoints authenticate themselves in the handler (shared secret)
  if (MACHINE_PATHS.some((p) => p.test(pathname))) {
    return NextResponse.next();
  }

  // Reads the session straight from the JWT cookie, so this stays one cheap verification
  // with no database round trip. Next 16 runs a proxy on the Node.js runtime rather than
  // the edge, so the old 'edge-compatible' note no longer applies; getToken works on both.
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // API routes pass through once authenticated
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // /home → always accessible to authenticated users (no redirect)

  // /ti-te/* → accessible to all authenticated users (no tool-level check)
  // (login is already enforced above; no additional gate needed)

  /* /po-expediting/* is gated by its own layout, not here. This used to read
     toolAccess.po_expediting out of the JWT cookie, which only the browser can be handed a new
     copy of — so an approval did not take effect until the user signed out and back in, and a
     freshly approved person was bounced to /home with nothing explaining why. A server-side
     check can read the access row instead; see src/app/po-expediting/layout.tsx. */

  // /learning-hub/* → open to every authenticated user (no tool-level check).
  // Login is already enforced above; no access request needed.

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|nesr-logo.jpg|nesr-logo-circle.png).*)',
  ],
};
