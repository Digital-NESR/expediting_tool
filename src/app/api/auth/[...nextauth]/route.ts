import NextAuth, { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import pool from "@/lib/db";
import titePool from "@/lib/db-tite";

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

      // Always refresh per-tool access status from DB on every token evaluation
      if (token.email) {
        try {
          const adminEmails = (process.env.ADMIN_EMAILS || '')
            .split(',')
            .map(e => e.trim().toLowerCase())
            .filter(Boolean);

          token.isAdmin = adminEmails.includes((token.email as string).toLowerCase());

          // Query both tools in parallel
          const [poResult, titeResult] = await Promise.all([
            pool.query(
              `SELECT status, approved_countries FROM access_requests WHERE user_email = $1`,
              [token.email]
            ),
            titePool.query(
              `SELECT status, approved_countries FROM access_requests WHERE user_email = $1`,
              [token.email]
            ),
          ]);

          // PO Expediting access
          let poStatus: string;
          let poCountries: string[];
          if (poResult.rows.length > 0) {
            const row = poResult.rows[0];
            const s = row.status.toLowerCase();
            poStatus =
              s === 'pending'  ? 'pending'  :
              s === 'approved' ? 'approved' :
              s === 'revoked'  ? 'revoked'  :
              s === 'rejected' ? 'rejected' : 'denied';
            poCountries = poStatus === 'approved' ? (row.approved_countries || []) : [];
          } else {
            poStatus = 'new';
            poCountries = [];
          }

          // TI-TE access
          let titeStatus: string;
          let titeCountries: string[];
          if (titeResult.rows.length > 0) {
            const tr = titeResult.rows[0];
            const ts = tr.status.toLowerCase();
            titeStatus =
              ts === 'pending'  ? 'pending'  :
              ts === 'approved' ? 'approved' :
              ts === 'revoked'  ? 'revoked'  :
              ts === 'rejected' ? 'rejected' : 'denied';
            titeCountries = titeStatus === 'approved' ? (tr.approved_countries || []) : [];
          } else {
            titeStatus = 'new';
            titeCountries = [];
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (token as any).toolAccess = {
            po_expediting: { status: poStatus,   approvedCountries: poCountries   },
            tite:          { status: titeStatus, approvedCountries: titeCountries },
          };
        } catch (err) {
          console.error('JWT access check failed:', err);
          if (!token.toolAccess) {
            token.toolAccess = {
              po_expediting: { status: 'new', approvedCountries: [] },
              tite:          { status: 'new', approvedCountries: [] },
            };
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name       = (token.name    as string) ?? session.user.name;
        session.user.email      = (token.email   as string) ?? session.user.email;
        session.user.image      = (token.picture as string | null) ?? null;
        session.user.jobTitle   = token.jobTitle   as string | undefined;
        session.user.department = token.department as string | undefined;
        session.user.country    = token.country    as string | undefined;
        session.user.isAdmin    = token.isAdmin    as boolean | undefined;
        session.user.toolAccess = token.toolAccess as {
          po_expediting?: { status: 'new' | 'pending' | 'approved' | 'denied' | 'revoked' | 'rejected'; approvedCountries: string[] };
          tite?:          { status: 'new' | 'pending' | 'approved' | 'denied' | 'revoked' | 'rejected'; approvedCountries: string[] };
        } | undefined;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
