import { formatMoney } from "@/lib/format-money";
import { cardClass } from "./card";

export function AccountCard({ name, type, accountClass = "asset", balanceMinor, currency, primary = false }: {
  name: string; type: string; accountClass?: "asset" | "liability"; balanceMinor: number; currency: string; primary?: boolean;
}) {
  const liability = accountClass === "liability";
  // A negative balance on a cash account is a different fact from a positive
  // one and must not read as the same number with a minus sign. Liabilities are
  // expected to be negative, so they keep the neutral treatment.
  const overdrawn = !liability && balanceMinor < 0;
  // Keep the leading card visually distinct without relying on an inverted
  // gradient. If a gradient token fails to render, contrast text can otherwise
  // become invisible against the card's white background.
  const emphasis = primary
    ? liability
      ? "border-negative/30 bg-negative-soft"
      : "border-primary/30 bg-primary-softer"
    : "";

  return (
    <article className={cardClass({ className: `grid min-h-40 content-between gap-6 ${emphasis}` })}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-soft">
          {liability ? "Money you owe" : type.replaceAll("_", " ")}
        </p>
        <h3 className="mt-2 text-lg font-semibold text-on-surface">{name}</h3>
      </div>
      <div>
        <p
          className={`font-display text-2xl font-semibold tabular-nums ${
            overdrawn ? "text-negative" : "text-on-surface"
          }`}
        >
          {formatMoney(balanceMinor, currency)}
        </p>
        {overdrawn ? (
          <p className="mt-1 text-xs font-semibold text-negative">
            <span aria-hidden="true">⚠ </span>Overdrawn
          </p>
        ) : null}
      </div>
    </article>
  );
}
