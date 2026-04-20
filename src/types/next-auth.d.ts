import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      jobTitle?: string;
      department?: string;
      country?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    jobTitle?: string;
    department?: string;
    country?: string;
  }
}
