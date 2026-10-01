import Link from "next/link";
import { Money } from "@/components/ui";
import type { PortfolioHighlights } from "@/lib/portfolio-insights";
import { Highlight, HighlightsCard, shortDate, signedPercent } from "./highlights";

/**
 * The portfolio as a whole: where the money sits, which part is doing best,
 * and what is paying out next.
 */
export function PortfolioHighlightsCard({ highlights, currency }: { highlights: PortfolioHighlights; currency: string }) {
  const { allocation, bestCategory, biggest, nextCoupon } = highlights;
  if (!allocation.length && !biggest && !nextCoupon) return null;

  return (
    <HighlightsCard id={`portfolio-highlights-${currency}`} note="Each kind's return is what it earns: price and dividends, coupons, interest, or share-outs.">
      {allocation.length ? (
        <Highlight label="Where it sits">
          {allocation.map(({ category, sharePercent }, index) => (
            <span key={category.kind}>
              {index ? " · " : ""}
              {category.label} <span className="tabular-nums font-semibold">{sharePercent.toFixed(0)}%</span>
            </span>
          ))}
        </Highlight>
      ) : null}
      {bestCategory && bestCategory.returnPercent !== null ? (
        <Highlight label="Doing best" detail={<Money amountMinor={bestCategory.returnMinor} currency={currency} signed tone="auto" />}>
          <span className="font-semibold">{bestCategory.label}</span> {signedPercent(bestCategory.returnPercent)}
        </Highlight>
      ) : null}
      {biggest ? (
        <Highlight label="Largest holding" detail={`${biggest.sharePercent.toFixed(0)}% of your portfolio`}>
          <Link href={biggest.holding.href} className="font-semibold text-on-surface hover:text-primary">
            {biggest.holding.name}
          </Link>{" "}
          <Money amountMinor={biggest.holding.currentValueMinor} currency={currency} />
        </Highlight>
      ) : null}
      {nextCoupon ? (
        <Highlight label="Next coupon" detail={shortDate(nextCoupon.date)}>
          <Link href="/investments/bonds" className="font-semibold text-on-surface hover:text-primary">
            <Money amountMinor={nextCoupon.amountMinor} currency={currency} />
          </Link>{" "}
          after tax
        </Highlight>
      ) : null}
    </HighlightsCard>
  );
}
