import NextAuth, { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID || "",
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET || "",
      tenantId: process.env.AZURE_AD_TENANT_ID || "",
    }),
    CredentialsProvider({
      name: "Password",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.password) return null;
        
        const fallbackPassword = process.env.FALLBACK_PASSWORD;
        if (fallbackPassword && credentials.password === fallbackPassword) {
            return {
                id: "1",
                name: "Admin User",
                email: "admin@nesr.com",
            };
        }
        
        return null; // Return null if password doesn't match
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
      strategy: "jwt",
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
