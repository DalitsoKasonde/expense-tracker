import Link from "next/link";
import { Money } from "@/components/ui";
import { describeDuration } from "@/lib/investing-habit";
import type { BondHighlights, InsightBond } from "@/lib/portfolio-insights";
import { Highlight, HighlightsCard, shortDate } from "./highlights";

function BondName({ bond }: { bond: InsightBond }) {
  return (
    <Link href={`/investments/${bond.assetId}`} className="font-semibold text-on-surface hover:text-primary">
      {bond.name}
    </Link>
  );
}

function rate(bps: number) {
  return `${(bps / 100).toFixed(2)}%`;
}

/** The bonds worth knowing about: what matures next, and what pays most. */
export function BondHighlightsCard({ highlights, currency }: { highlights: BondHighlights; currency: string }) {
  const { nextMaturity, biggest, highestRate, topEarner } = highlights;
  if (!nextMaturity && !biggest && !topEarner) return null;

  return (
    <HighlightsCard id={`bond-highlights-${currency}`} note="Coupons count once they are paid, after withholding tax.">
      {nextMaturity ? (
        <Highlight
          label="Matures next"
          detail={<>{shortDate(nextMaturity.bond.maturityDate as string)} · <Money amountMinor={nextMaturity.bond.principalMinor} currency={nextMaturity.bond.currency} /> back</>}
        >
          <BondName bond={nextMaturity.bond} /> in {describeDuration(nextMaturity.days)}
        </Highlight>
      ) : null}
      {topEarner ? (
        <Highlight label="Paid the most" detail={`${topEarner.percentOfPrincipal.toFixed(1)}% of its principal so far`}>
          <BondName bond={topEarner.bond} /> <Money amountMinor={topEarner.incomeMinor} currency={topEarner.bond.currency} />
        </Highlight>
      ) : null}
      {highestRate?.couponRateBps ? (
        <Highlight label="Highest coupon rate">
          <BondName bond={highestRate} /> {rate(highestRate.couponRateBps)} a year
        </Highlight>
      ) : null}
      {biggest ? (
        <Highlight label="Largest bond" detail={`${biggest.sharePercent.toFixed(0)}% of your bonds`}>
          <BondName bond={biggest.bond} /> <Money amountMinor={biggest.bond.principalMinor} currency={biggest.bond.currency} />
        </Highlight>
      ) : null}
    </HighlightsCard>
  );
}
