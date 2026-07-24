import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  '/login',
  '/request-access',
  '/pending-approval',
  '/access-denied',
  '/supplier-update',
  '/help',
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

  // /home → always accessible to authenticated users (no redirect)

  // /ti-te/* → accessible to all authenticated users (no tool-level check)
  // (login is already enforced above; no additional gate needed)

  // /po-expediting/* → check tool-level access for 'po_expediting'
  if (pathname.startsWith('/po-expediting')) {
    const isAdmin = token.isAdmin as boolean | undefined;
    const toolAccess = token.toolAccess as { po_expediting?: { status: string } } | undefined;
    const poStatus = toolAccess?.po_expediting?.status;

    if (!isAdmin && poStatus !== 'approved') {
      return NextResponse.redirect(new URL('/home', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|nesr-logo.jpg|nesr-logo-circle.png).*)",
  ],
};
