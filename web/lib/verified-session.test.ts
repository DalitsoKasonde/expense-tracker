import { describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { hasVerifiedSession } from "./verified-session";

const validSession: Session = {
  accessToken: "api-token",
  expires: "2099-01-01T00:00:00.000Z",
  user: {
    id: "user-1",
    email: "person@example.com",
    name: "Person",
    role: "member",
  },
};

describe("hasVerifiedSession", () => {
  it("rejects a missing session without calling the API", async () => {
    const verifySession = vi.fn();

    await expect(hasVerifiedSession(null, verifySession)).resolves.toBe(false);
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("rejects a session without an API token", async () => {
    const verifySession = vi.fn();
    const session = { ...validSession, accessToken: "" };

    await expect(hasVerifiedSession(session, verifySession)).resolves.toBe(false);
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("accepts a session that the API recognizes", async () => {
    const verifySession = vi.fn().mockResolvedValue({ id: "user-1" });

    await expect(hasVerifiedSession(validSession, verifySession)).resolves.toBe(true);
    expect(verifySession).toHaveBeenCalledWith("/v1/auth/me", "api-token");
  });

  it("rejects a session that the API does not recognize", async () => {
    const verifySession = vi.fn().mockRejectedValue(new Error("unauthorized"));

    await expect(hasVerifiedSession(validSession, verifySession)).resolves.toBe(false);
  });
});
