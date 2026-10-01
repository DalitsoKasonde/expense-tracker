import Link from "next/link";
import type { ReactNode } from "react";
import { Card, Money } from "@/components/ui";
import { formatMoney } from "@/lib/format-money";
import { describeDuration, type StockHighlights, type StockResult } from "@/lib/stock-insights";

function signedPercent(percent: number) {
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

function shareCount(quantity: number) {
  return `${quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${quantity === 1 ? "share" : "shares"}`;
}

function StockName({ stock }: { stock: StockResult }) {
  return (
    <Link href={`/investments/${stock.assetId}`} className="font-semibold text-on-surface hover:text-primary">
      {stock.symbol?.trim() || stock.name}
    </Link>
  );
}

function Highlight({ label, children, detail }: { label: string; children: ReactNode; detail?: ReactNode }) {
  return (
    <li className="grid gap-1 border-b border-outline py-3 last:border-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <span className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">{label}</span>
      <span className="min-w-0 text-sm text-on-surface">
        {children}
        {detail ? <span className="block text-on-surface-soft sm:inline sm:before:content-['_·_']">{detail}</span> : null}
      </span>
    </li>
  );
}

/**
 * The holdings worth knowing about, one line each.
 *
 * Share counts are paired with value: shares are only comparable within one
 * stock, and 1,000 shares at K0.50 is a smaller holding than 10 at K90.
 */
export function StockHighlightsCard({ highlights }: { highlights: StockHighlights }) {
  const { best, worst, mostShares, fewestShares, biggest, topDividend, breakEven, quietest } = highlights;
  if (!best && !topDividend) return null;

  return (
    <Card aria-labelledby="stock-highlights-heading">
      <h2 id="stock-highlights-heading" className="text-lg font-semibold text-on-surface">Highlights</h2>
      <p className="mt-1 text-sm text-on-surface-soft">Returns include dividends.</p>
      <ul className="mt-2">
        {best ? (
          <Highlight label="Best performer" detail={<Money amountMinor={best.returnMinor} currency={best.currency} signed tone="auto" />}>
            <StockName stock={best} /> {signedPercent(best.returnPercent)}
          </Highlight>
        ) : null}
        {worst && worst.assetId !== best?.assetId ? (
          <Highlight label="Weakest" detail={<Money amountMinor={worst.returnMinor} currency={worst.currency} signed tone="auto" />}>
            <StockName stock={worst} /> {signedPercent(worst.returnPercent)}
          </Highlight>
        ) : null}
        {breakEven ? (
          <Highlight
            label="Back to cost at"
            detail={`now ${formatMoney(breakEven.pricePerShareMinor, breakEven.stock.currency)} a share`}
          >
            {formatMoney(breakEven.costPerShareMinor, breakEven.stock.currency)} a share for <StockName stock={breakEven.stock} />
          </Highlight>
        ) : null}
        {biggest ? (
          <Highlight label="Largest holding" detail={`${biggest.sharePercent.toFixed(0)}% of your stocks`}>
            <StockName stock={biggest.stock} /> <Money amountMinor={biggest.stock.valueMinor} currency={biggest.stock.currency} />
          </Highlight>
        ) : null}
        {mostShares && fewestShares && mostShares.assetId !== fewestShares.assetId ? (
          <>
            <Highlight label="Most shares" detail={<>worth <Money amountMinor={mostShares.valueMinor} currency={mostShares.currency} /></>}>
              <StockName stock={mostShares} /> {shareCount(mostShares.quantity)}
            </Highlight>
            <Highlight label="Fewest shares" detail={<>worth <Money amountMinor={fewestShares.valueMinor} currency={fewestShares.currency} /></>}>
              <StockName stock={fewestShares} /> {shareCount(fewestShares.quantity)}
            </Highlight>
          </>
        ) : null}
        {topDividend ? (
          <Highlight label="Top dividend payer" detail={`${topDividend.yieldPercent.toFixed(1)}% of what you paid`}>
            <StockName stock={topDividend.stock} /> <Money amountMinor={topDividend.stock.dividendsMinor} currency={topDividend.stock.currency} />
          </Highlight>
        ) : null}
        {quietest ? (
          <Highlight label="Not added to in" detail={`last bought ${new Date(`${quietest.stock.lastPurchaseDate}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`}>
            <StockName stock={quietest.stock} /> {describeDuration(quietest.days)}
          </Highlight>
        ) : null}
      </ul>
    </Card>
  );
}
