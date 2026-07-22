import { formatMoney } from "@/lib/format-money";

export function AccountCard({ name, type, accountClass = "asset", balanceMinor, currency, primary = false }: {
  name: string; type: string; accountClass?: "asset" | "liability"; balanceMinor: number; currency: string; primary?: boolean;
}) {
  const liability = accountClass === "liability";
  const cardClass = primary
    ? liability
      ? "border-expense bg-gradient-to-br from-expense to-negative text-white"
      : "border-primary bg-gradient-to-br from-primary to-accent text-white"
    : "border-outline bg-surface text-on-surface";

  return (
    <article className={`grid min-h-40 content-between gap-6 rounded-lg border p-5 shadow-sm ${cardClass}`}>
      <div>
        <p className={`text-xs font-semibold uppercase tracking-wider ${primary ? "text-white/70" : "text-on-surface-soft"}`}>
          {liability ? "Money you owe" : type.replaceAll("_", " ")}
        </p>
        <h3 className="mt-2 text-lg font-semibold">{name}</h3>
      </div>
      <p className="font-display text-2xl font-semibold tabular-nums">{formatMoney(balanceMinor, currency)}</p>
    </article>
  );
}
