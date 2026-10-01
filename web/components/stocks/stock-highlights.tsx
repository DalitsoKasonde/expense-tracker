import Link from "next/link";
import { Money } from "@/components/ui";
import { Highlight, HighlightsCard, shortDate, signedPercent } from "@/components/investments/highlights";
import { formatMoney } from "@/lib/format-money";
import { describeDuration } from "@/lib/investing-habit";
import type { StockHighlights, StockResult } from "@/lib/stock-insights";

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

/**
 * The stocks worth knowing about.
 *
 * Share counts are paired with value: shares are only comparable within one
 * stock, and 1,000 shares at K0.50 is a smaller holding than 10 at K90.
 */
export function StockHighlightsCard({ highlights }: { highlights: StockHighlights }) {
  const { best, worst, mostShares, fewestShares, biggest, topDividend, breakEven, quietest } = highlights;
  if (!best && !topDividend) return null;

  return (
    <HighlightsCard id="stock-highlights-heading" note="Returns include dividends.">
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
        <Highlight label="Not added to in" detail={`last bought ${shortDate(quietest.stock.lastPurchaseDate as string)}`}>
          <StockName stock={quietest.stock} /> {describeDuration(quietest.days)}
        </Highlight>
      ) : null}
    </HighlightsCard>
  );
}
