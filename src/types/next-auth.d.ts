import "next-auth";

type ToolAccessEntry = {
  status: 'new' | 'pending' | 'approved' | 'denied' | 'revoked' | 'rejected';
  approvedCountries: string[];
  // ProcureGuard: the kind of access the user has, derived from procure_guard_permissions.
  accessType?: 'requester' | 'approver' | 'viewer' | 'admin';
};

declare module "next-auth" {
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
      };
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
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
    };
  }
}
