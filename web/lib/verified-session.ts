import type { Session } from "next-auth";
import { apiFetch } from "./api";

type VerifySession = (path: string, token?: string) => Promise<unknown>;

export async function hasVerifiedSession(
  session: Session | null,
  verifySession: VerifySession = apiFetch,
): Promise<boolean> {
  if (!session?.user || !session.accessToken) {
    return false;
  }

  try {
    await verifySession("/v1/auth/me", session.accessToken);
    return true;
  } catch {
    return false;
  }
}
