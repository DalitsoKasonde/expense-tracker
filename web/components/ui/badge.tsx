import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "income" | "expense" | "warning" | "info";

const tones: Record<BadgeTone, string | false> = {
  neutral: false,
  income: "badge-income",
  expense: "badge-expense",
  warning: "badge-warning",
  info: "badge-info",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return <span className={cn("badge", tones[tone], className)}>{children}</span>;
}
