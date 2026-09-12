import { describe, expect, it } from "vitest";
import { describeInvitation, formatDay, type Invitation } from "./admin-data";

const base: Invitation = {
  id: "inv-1",
  email: "someone@example.com",
  premiumMonths: 12,
  expiresAt: "2026-09-26T00:00:00Z",
  createdAt: "2026-09-12T00:00:00Z",
};

const now = new Date("2026-09-12T12:00:00Z");

describe("describeInvitation", () => {
  it("keeps the link expiry out of the premium column, where it read as the premium running out", () => {
    const { status, timing, premium } = describeInvitation(base, now);

    // The old copy was one phrase — "12 months premium · expires 26 Sep 2026" —
    // which put the 14-day link expiry directly after a twelve-month figure.
    expect(status).toBe("Open");
    expect(timing).toBe(`Link expires ${formatDay("2026-09-26T00:00:00Z")}`);
    expect(premium).toBe("12 months once accepted");
    expect(premium).not.toContain("2026");
  });

  it("shows when the premium actually ends once the invitation is accepted", () => {
    const { status, timing, premium } = describeInvitation({ ...base, acceptedAt: "2026-09-14T09:00:00Z" }, now);

    expect(status).toBe("Accepted");
    expect(timing).toBe(`Accepted ${formatDay("2026-09-14T09:00:00Z")}`);
    // Twelve months from acceptance, not from the invitation being sent.
    expect(premium).toBe(`12 months · until ${formatDay("2027-09-14T09:00:00Z")}`);
  });

  it("dates the premium the same way the server does, overflow included", () => {
    // plans.TrialExpiry is from.AddDate(0, months, 0); Go rolls 31 January plus
    // one month to 3 March, and setMonth does the same.
    const { premium } = describeInvitation(
      { ...base, premiumMonths: 1, acceptedAt: "2027-01-31T00:00:00Z" },
      new Date("2027-02-01T00:00:00Z")
    );
    expect(premium).toBe(`1 month · until ${formatDay("2027-03-03T00:00:00Z")}`);
  });

  it("offers a revoke only while the link can still be used", () => {
    expect(describeInvitation(base, now).canRevoke).toBe(true);
    expect(describeInvitation({ ...base, acceptedAt: "2026-09-13T00:00:00Z" }, now).canRevoke).toBe(false);
    expect(describeInvitation({ ...base, revokedAt: "2026-09-13T00:00:00Z" }, now).canRevoke).toBe(false);
    expect(describeInvitation(base, new Date("2026-10-01T00:00:00Z")).canRevoke).toBe(false);
  });

  it("prefers accepted over revoked, since a used link cannot be taken back", () => {
    const { status } = describeInvitation(
      { ...base, acceptedAt: "2026-09-13T09:00:00Z", revokedAt: "2026-09-14T09:00:00Z" },
      now
    );
    expect(status).toBe("Accepted");
  });

  it("says a lapsed or withdrawn invitation granted nothing", () => {
    expect(describeInvitation(base, new Date("2026-10-01T00:00:00Z"))).toMatchObject({
      status: "Expired",
      timing: `Lapsed ${formatDay("2026-09-26T00:00:00Z")}`,
      premium: "Not granted",
    });
    expect(describeInvitation({ ...base, revokedAt: "2026-09-13T00:00:00Z" }, now)).toMatchObject({
      status: "Revoked",
      timing: `Revoked ${formatDay("2026-09-13T00:00:00Z")}`,
      premium: "Not granted",
    });
  });

  it("does not promise premium when the invitation grants none", () => {
    expect(describeInvitation({ ...base, premiumMonths: 0 }, now).premium).toBe("None");
    expect(describeInvitation({ ...base, premiumMonths: 0, acceptedAt: "2026-09-13T00:00:00Z" }, now).premium).toBe("None");
  });

  it("says one month, not one months", () => {
    expect(describeInvitation({ ...base, premiumMonths: 1 }, now).premium).toBe("1 month once accepted");
  });
});
