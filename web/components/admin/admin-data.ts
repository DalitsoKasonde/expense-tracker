/** Shapes and formatting shared by the administration workspaces. Each workspace
 *  is its own route now, so the types live here rather than in whichever page
 *  happened to declare them first. */

export type AdminUser = {
  id: string;
  maskedEmail: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
  plan: string;
  planExpiresAt?: string | null;
  planSource: string;
};

export type BackupJob = {
  id: string;
  status: string;
  fileName?: string | null;
  sizeBytes?: number | null;
  checksumSha256?: string | null;
  errorMessage?: string | null;
  requestedAt: string;
  completedAt?: string | null;
};

export type AuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  createdAt: string;
};

export type FeedbackStatus = "new" | "reviewed" | "resolved";

export type FeedbackItem = {
  id: string;
  maskedEmail: string;
  message: string;
  pagePath?: string;
  status: FeedbackStatus;
  createdAt: string;
};

export const feedbackStatuses: FeedbackStatus[] = ["new", "reviewed", "resolved"];

export function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

export function formatDay(value?: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
}

export function formatBytes(value?: number | null) {
  if (!value) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** What the person is entitled to right now. The stored column still reads
 *  "premium" after a trial lapses, so the expiry has to be applied here too. */
export function describePlan(user: AdminUser) {
  if (user.plan !== "premium") return "Free";
  if (!user.planExpiresAt) return "Premium · never expires";
  if (new Date(user.planExpiresAt).getTime() < Date.now()) return "Free · trial ended";
  return `Premium · until ${formatDay(user.planExpiresAt)}`;
}

/** Whether the account is actually on premium today, which is what decides
 *  which plan actions are worth offering. */
export function isOnPremium(user: AdminUser) {
  if (user.plan !== "premium") return false;
  if (!user.planExpiresAt) return true;
  return new Date(user.planExpiresAt).getTime() >= Date.now();
}

/** Why the account is on the plan it is on, in words rather than a column value. */
export function describePlanSource(user: AdminUser) {
  switch (user.planSource) {
    case "invite":
      return "Invited to the beta";
    case "comp":
      return "Granted by an administrator";
    case "paid":
      return "Paid subscription";
    default:
      return "Signed up";
  }
}

export type Invitation = {
  id: string;
  email: string;
  premiumMonths: number;
  note?: string | null;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
};

export type InvitationStatus = "Open" | "Accepted" | "Revoked" | "Expired";

function describeMonths(months: number) {
  return `${months} ${months === 1 ? "month" : "months"}`;
}

/** Matches plans.TrialExpiry on the server, which is from.AddDate(0, months, 0).
 *  Go and JavaScript normalise a month-end overflow the same way — 31 January
 *  plus one month lands on 3 March in both — so the date shown here is the date
 *  the account will actually carry. */
function addMonths(from: string, months: number) {
  const expiry = new Date(from);
  expiry.setMonth(expiry.getMonth() + months);
  return expiry.toISOString();
}

/** An invitation carries two unrelated dates: the link dies after a fortnight,
 *  and the premium runs for its own months from the day the person accepts.
 *  Printing them in one clause read as though the premium expired with the
 *  link, so each is now its own column and says which date it means. */
export function describeInvitation(invitation: Invitation, now: Date = new Date()): {
  status: InvitationStatus;
  timing: string;
  premium: string;
  canRevoke: boolean;
} {
  const months = invitation.premiumMonths;

  // Accepted and revoked both outrank expiry: a link that was used or
  // withdrawn is settled, whatever its expiry date says.
  if (invitation.acceptedAt) {
    return {
      status: "Accepted",
      timing: `Accepted ${formatDay(invitation.acceptedAt)}`,
      premium: months > 0 ? `${describeMonths(months)} · until ${formatDay(addMonths(invitation.acceptedAt, months))}` : "None",
      canRevoke: false,
    };
  }
  if (invitation.revokedAt) {
    return {
      status: "Revoked",
      timing: `Revoked ${formatDay(invitation.revokedAt)}`,
      premium: "Not granted",
      canRevoke: false,
    };
  }
  if (new Date(invitation.expiresAt).getTime() < now.getTime()) {
    return {
      status: "Expired",
      timing: `Lapsed ${formatDay(invitation.expiresAt)}`,
      premium: "Not granted",
      canRevoke: false,
    };
  }
  return {
    status: "Open",
    timing: `Link expires ${formatDay(invitation.expiresAt)}`,
    premium: months > 0 ? `${describeMonths(months)} once accepted` : "None",
    canRevoke: true,
  };
}
