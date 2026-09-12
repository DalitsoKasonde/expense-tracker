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
