import { formatMoney } from "@/lib/format-money";
import { cardClass } from "./card";

export function AccountCard({ name, type, accountClass = "asset", balanceMinor, currency, primary = false }: {
  name: string; type: string; accountClass?: "asset" | "liability"; balanceMinor: number; currency: string; primary?: boolean;
}) {
  const liability = accountClass === "liability";
  // Filled cards use the action/expense tokens with their matching contrast
  // colour: the fills invert in dark mode, so a hard-coded white label would
  // become unreadable.
  const fill = primary
    ? liability
      ? "border-transparent bg-gradient-to-br from-expense to-negative text-action-contrast"
      : "border-transparent bg-gradient-to-br from-action to-action-hover text-action-contrast"
    : "";

  return (
    <article className={cardClass({ className: `grid min-h-40 content-between gap-6 ${fill}` })}>
      <div>
        <p className={`text-xs font-semibold uppercase tracking-wider ${primary ? "opacity-80" : "text-on-surface-soft"}`}>
          {liability ? "Money you owe" : type.replaceAll("_", " ")}
        </p>
        <h3 className="mt-2 text-lg font-semibold">{name}</h3>
      </div>
      <p className="font-display text-2xl font-semibold tabular-nums">{formatMoney(balanceMinor, currency)}</p>
    </article>
  );
}
