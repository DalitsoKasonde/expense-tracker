import type { ReactNode } from "react";

export type AdminStatusTone = "success" | "warning" | "danger" | "neutral" | "info";

export function AdminStatusPill({ children, tone = "neutral", compact = false }: {
  children: ReactNode;
  tone?: AdminStatusTone;
  compact?: boolean;
}) {
  return <span className={`adminStatusPill adminStatusPill-${tone}${compact ? " adminStatusPill-compact" : ""}`}>{children}</span>;
}

export function statusTone(value: string): AdminStatusTone {
  switch (value.trim().toLowerCase()) {
    case "active":
    case "accepted":
    case "completed":
    case "succeeded":
    case "success":
      return "success";
    case "open":
    case "pending":
    case "reviewed":
    case "running":
    case "requested":
      return "warning";
    case "suspended":
    case "failed":
      return "danger";
    case "new":
    case "premium":
      return "info";
    default:
      return "neutral";
  }
}
