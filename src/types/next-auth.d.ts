import 'next-auth';

type ToolAccessEntry = {
  status: 'new' | 'pending' | 'approved' | 'denied' | 'revoked' | 'rejected';
  approvedCountries: string[];
  // ProcureGuard: the kind of access the user has, derived from procure_guard_permissions.
  accessType?: 'requester' | 'approver' | 'viewer' | 'admin';
  // S&S Registry: the approved role string, or 'admin' for env-listed platform admins.
  snsRole?: string;
};

declare module 'next-auth' {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      jobTitle?: string;
      department?: string;
      country?: string;
      isAdmin?: boolean;
      titeViewOnly?: boolean;
      toolAccess?: {
        po_expediting?: ToolAccessEntry;
        tite?: ToolAccessEntry;
        procure_guard?: ToolAccessEntry;
        sourceguide?: ToolAccessEntry;
        sns_registry?: ToolAccessEntry;
        learning_hub?: ToolAccessEntry;
      };
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    /* Whether this user has an avatar in `user_photos`. The image itself is
       deliberately NOT in the token — it used to be a base64 data: URI and
       was the bulk of the encrypted session cookie. See /api/me/photo. */
    hasPhoto?: boolean;
    jobTitle?: string;
    department?: string;
    country?: string;
    isAdmin?: boolean;
    titeViewOnly?: boolean;
    toolAccess?: {
      po_expediting?: ToolAccessEntry;
      tite?: ToolAccessEntry;
      procure_guard?: ToolAccessEntry;
      sourceguide?: ToolAccessEntry;
      sns_registry?: ToolAccessEntry;
      learning_hub?: ToolAccessEntry;
    };
  }
}
