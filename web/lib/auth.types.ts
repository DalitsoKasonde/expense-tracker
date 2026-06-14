import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    accessToken: string;
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      role: string;
    };
  }

  interface User {
    role?: string;
    apiToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: string;
    apiToken?: string;
  }
}

