import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

type LoginResponse = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: string;
    displayName: string;
  };
};

async function loginWithApi(email: string, password: string) {
  const apiBaseUrl = process.env.API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error("API_BASE_URL is not configured.");
  }

  const response = await fetch(`${apiBaseUrl}/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as LoginResponse;
}

// Decodes a JWT's `exp` claim (seconds since epoch -> ms) without verifying the
// signature. Returns 0 if it cannot be read.
function getTokenExpiryMs(token: string): number {
  try {
    const payload = token.split(".")[1];
    if (!payload) return 0;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(normalized, "base64").toString("utf8");
    const exp = JSON.parse(json)?.exp;
    return typeof exp === "number" ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

// Calls the API refresh endpoint with the current (still-valid) token to get a
// fresh access token. Returns null on failure.
async function refreshApiToken(currentToken: string): Promise<string | null> {
  const apiBaseUrl = process.env.API_BASE_URL;
  if (!apiBaseUrl) return null;

  try {
    const response = await fetch(`${apiBaseUrl}/v1/auth/refresh`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${currentToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { accessToken?: string };
    return data.accessToken ?? null;
  } catch {
    return null;
  }
}

// Refresh the API token once it is within this window of expiring (ms).
const REFRESH_BUFFER_MS = 60 * 60 * 1000; // 1 hour

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");

        if (!email || !password) {
          return null;
        }

        const result = await loginWithApi(email, password);

        if (!result) {
          return null;
        }

        return {
          id: result.user.id,
          email: result.user.email,
          name: result.user.displayName,
          role: result.user.role,
          apiToken: result.accessToken,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Initial sign-in: persist the API token and its expiry.
      if (user) {
        const apiToken = (user as { apiToken?: string }).apiToken ?? "";
        token.userId = user.id;
        token.role = (user as { role?: string }).role;
        token.apiToken = apiToken;
        token.apiTokenExpires = getTokenExpiryMs(apiToken);
        delete token.error;
        return token;
      }

      // Subsequent requests: refresh the API token before it expires so the
      // NextAuth session never outlives a usable API token.
      const expires = token.apiTokenExpires ?? 0;
      const shouldRefresh = !expires || Date.now() > expires - REFRESH_BUFFER_MS;

      if (shouldRefresh && token.apiToken) {
        const refreshed = await refreshApiToken(token.apiToken);
        if (refreshed) {
          token.apiToken = refreshed;
          token.apiTokenExpires = getTokenExpiryMs(refreshed);
          delete token.error;
        } else {
          // Refresh failed (token already expired or API unreachable). Mark the
          // session so the client can force re-authentication.
          token.error = "RefreshAccessTokenError";
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.userId ?? "");
        session.user.role = String(token.role ?? "");
      }

      session.accessToken = token.error ? "" : String(token.apiToken ?? "");
      session.error = token.error;
      return session;
    },
  },
};

export function getAuthSession() {
  return getServerSession(authOptions);
}

