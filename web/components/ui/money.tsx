import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/cn";

export type MoneyTone = "auto" | "positive" | "negative" | "neutral";

type MoneyProps = {
  amountMinor: number;
  currency: string;
  /**
   * Prefix a "+" on non-negative values. Negative values already carry a minus
   * from the formatter, so this only adds the half the formatter cannot.
   */
  signed?: boolean;
  /**
   * Overrides the arithmetic sign for rows where direction is semantic rather
   * than numeric — a repayment is money in whatever sign the record carries.
   * When set, the magnitude is rendered unsigned and this is shown instead.
   */
  sign?: "+" | "−";
  /** "auto" colours by sign; the rest are explicit. */
  tone?: MoneyTone;
  options?: Intl.NumberFormatOptions;
  className?: string;
};

/**
 * One amount, rendered once.
 *
 * Every figure in the app needs the same three things — the formatter, tabular
 * figures, and a sign/colour pair that agree with each other — and they were
 * being reassembled by hand at each call site, which is how some amounts ended
 * up signed and coloured differently from others. `tabular-nums` matters here:
 * see the NUMERALS block in globals.css for why the class is not decorative.
 */
export function Money({
  amountMinor,
  currency,
  signed = false,
  sign,
  tone = "neutral",
  options,
  className,
}: MoneyProps) {
  const prefix = sign ?? (signed && amountMinor >= 0 ? "+" : "");
  const magnitude = sign ? Math.abs(amountMinor) : amountMinor;
  const resolved = tone === "auto" ? (amountMinor >= 0 ? "positive" : "negative") : tone;
  const toneClass =
    resolved === "positive" ? "text-positive" : resolved === "negative" ? "text-negative" : undefined;

  return (
    <span className={cn("tabular-nums", toneClass, className)}>
      {prefix}
      {formatMoney(magnitude, currency, options)}
    </span>
  );
}
