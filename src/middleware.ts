import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  '/login',
  '/request-access',
  '/pending-approval',
  '/access-denied',
  '/supplier-update',
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths through without any auth check
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Read JWT token (edge-compatible)
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // API routes pass through once authenticated
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Redirect page routes based on access status
  const status = token.accessStatus as string | undefined;
  if (status === 'new')     return NextResponse.redirect(new URL('/request-access', req.url));
  if (status === 'pending') return NextResponse.redirect(new URL('/pending-approval', req.url));
  if (status === 'denied')  return NextResponse.redirect(new URL('/access-denied', req.url));

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|nesr-logo.jpg|nesr-logo-circle.png).*)",
  ],
};
