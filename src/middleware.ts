import { withAuth } from "next-auth/middleware";

// Provide default protection with withAuth
// It automatically redirects unauthenticated users to the configured signIn page (/login)
export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  // Protect the dashboard and any API routes (except the auth API itself)
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (NextAuth API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - nesr-logo.jpg (public images)
     * - login (the login page itself to prevent redirect loops)
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|nesr-logo.jpg|login).*)",
  ],
};
