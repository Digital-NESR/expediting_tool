import NextAuth, { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import pool from "@/lib/db";

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID || "",
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET || "",
      tenantId: process.env.AZURE_AD_TENANT_ID || "",
      authorization: {
        params: {
          scope: "openid profile email User.Read",
        },
      },
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

        return null;
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.provider === "azure-ad" && account.access_token) {
        // Fetch additional profile fields from Microsoft Graph
        try {
          const res = await fetch(
            "https://graph.microsoft.com/v1.0/me?$select=displayName,jobTitle,mail,userPrincipalName,department,country",
            { headers: { Authorization: `Bearer ${account.access_token}` } }
          );
          if (res.ok) {
            const gp = await res.json();
            if (gp.displayName) token.name = gp.displayName;
            token.email = gp.mail ?? gp.userPrincipalName ?? token.email;
            token.jobTitle = gp.jobTitle ?? undefined;
            token.department = gp.department ?? undefined;
            token.country = gp.country ?? undefined;
          }
        } catch {
          // fall through gracefully
        }

        // Fetch profile photo from Microsoft Graph
        try {
          const photoRes = await fetch(
            "https://graph.microsoft.com/v1.0/me/photos/48x48/$value",
            { headers: { Authorization: `Bearer ${account.access_token}` } }
          );
          if (photoRes.ok) {
            const buf = await photoRes.arrayBuffer();
            token.picture = `data:image/jpeg;base64,${Buffer.from(buf).toString("base64")}`;
          } else {
            token.picture = null;
          }
        } catch {
          token.picture = null;
        }
      }

      if (account?.provider === "credentials") {
        token.jobTitle = "Developer";
        token.department = undefined;
        token.country = undefined;
        token.picture = null;
      }

      // Always refresh access status from DB on every token evaluation
      if (token.email) {
        try {
          const result = await pool.query(
            `SELECT status, approved_countries FROM access_requests WHERE user_email = $1`,
            [token.email]
          );

          const adminEmails = (process.env.ADMIN_EMAILS || '')
            .split(',')
            .map(e => e.trim().toLowerCase())
            .filter(Boolean);

          if (adminEmails.includes((token.email as string).toLowerCase())) {
            token.accessStatus = 'admin';
            token.approvedCountries = [];
          } else if (result.rows.length > 0) {
            const row = result.rows[0];
            const s = row.status.toLowerCase() as string;
            // Normalize 'rejected'/'revoked' → 'denied' so middleware redirects correctly
            token.accessStatus = s === 'pending' ? 'pending' : s === 'approved' ? 'approved' : 'denied';
            token.approvedCountries = s === 'approved' ? (row.approved_countries || []) : [];
          } else {
            token.accessStatus = 'new';
            token.approvedCountries = [];
          }
        } catch (err) {
          console.error('JWT access check failed:', err);
          if (!token.accessStatus) {
            token.accessStatus = 'new';
            token.approvedCountries = [];
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = (token.name as string) ?? session.user.name;
        session.user.email = (token.email as string) ?? session.user.email;
        session.user.image = (token.picture as string | null) ?? null;
        session.user.jobTitle = token.jobTitle as string | undefined;
        session.user.department = token.department as string | undefined;
        session.user.country = token.country as string | undefined;
        session.user.accessStatus = token.accessStatus;
        session.user.approvedCountries = token.approvedCountries;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
