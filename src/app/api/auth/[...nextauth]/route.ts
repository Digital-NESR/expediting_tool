import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth/options';

/* The route is just the handler now. The configuration it runs on lives in
   '@/lib/auth/options', so the twenty-eight modules that need `authOptions` import a library
   module rather than reaching into a route file for it. */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
