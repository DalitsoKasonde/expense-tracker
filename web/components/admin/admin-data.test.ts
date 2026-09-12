import { describe, expect, it } from "vitest";
import { describeInvitation, type Invitation } from "./admin-data";

const base: Invitation = {
  id: "inv-1",
  email: "kasondedalitso@example.com",
  premiumMonths: 12,
  expiresAt: "2026-09-26T00:00:00Z",
  createdAt: "2026-09-12T00:00:00Z",
};

const now = new Date("2026-09-12T12:00:00Z");

describe("describeInvitation", () => {
  it("does not read as though the premium expires with the link", () => {
    const { status, detail } = describeInvitation(base, now);

    expect(status).toBe("Open");
    // The old copy was "12 months premium · expires 26 Sep 2026", which put the
    // 14-day link expiry immediately after the months and made 12 months of
    // premium look like a fortnight of it.
    expect(detail).toContain("Link expires");
    expect(detail).toContain("counted from the day they accept");
    expect(detail).not.toMatch(/months of premium.*expires/);
  });

  it("stops mentioning the link once the invitation has been accepted", () => {
    const { status, detail } = describeInvitation({ ...base, acceptedAt: "2026-09-14T09:00:00Z" }, now);

    expect(status).toBe("Accepted");
    expect(detail).toContain("started 12 months of premium");
    expect(detail).not.toContain("Link expires");
  });

  it("treats a revoked invitation as settled even before the link would lapse", () => {
    const { status } = describeInvitation({ ...base, revokedAt: "2026-09-13T09:00:00Z" }, now);
    expect(status).toBe("Revoked");
  });

  it("prefers accepted over revoked, since a used link cannot be taken back", () => {
    const { status } = describeInvitation(
      { ...base, acceptedAt: "2026-09-13T09:00:00Z", revokedAt: "2026-09-14T09:00:00Z" },
      now
    );
    expect(status).toBe("Accepted");
  });

  it("says a lapsed link was never used rather than leaving it looking open", () => {
    const { status, detail } = describeInvitation(base, new Date("2026-10-01T00:00:00Z"));

    expect(status).toBe("Expired");
    expect(detail).toContain("Never accepted");
  });

  it("does not promise premium when the invitation grants none", () => {
    const { detail } = describeInvitation({ ...base, premiumMonths: 0 }, now);
    expect(detail).toContain("no premium included");
  });

  it("says one month, not one months", () => {
    const { detail } = describeInvitation({ ...base, premiumMonths: 1 }, now);
    expect(detail).toContain("1 month of premium");
  });
});
