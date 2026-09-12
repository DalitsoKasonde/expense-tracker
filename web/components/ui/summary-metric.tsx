import type { ReactNode } from "react";

export type SummaryTone = "positive" | "negative" | "neutral";

const valueTones: Record<SummaryTone, string> = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-on-surface",
};

/**
 * One figure in a summary row: a small uppercase label, the number at display
 * size, and a line of context under it. Pass a <Money> as the value to keep the
 * sign and tabular figures; the tone colours a plain-string value instead.
 */
export function SummaryMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: SummaryTone;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">{label}</p>
      <p className={`mt-2 font-display text-2xl font-semibold tabular-nums ${valueTones[tone]}`}>{value}</p>
      {detail ? <p className="mt-1 text-sm text-on-surface-soft">{detail}</p> : null}
    </div>
  );
}
