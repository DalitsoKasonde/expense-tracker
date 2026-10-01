import { Money } from "@/components/ui";
import { describeDuration } from "@/lib/investing-habit";
import type { PocketHighlights } from "@/lib/portfolio-insights";
import { Highlight, HighlightsCard, shortDate } from "./highlights";

function rate(bps: number) {
  return `${(bps / 100).toFixed(2)}% a year`;
}

/** The savings pockets worth knowing about. */
export function PocketHighlightsCard({ highlights, currency }: { highlights: PocketHighlights; currency: string }) {
  const { bestRate, topEarner, biggest, quietest } = highlights;
  if (!bestRate && !topEarner && !biggest && !quietest) return null;

  return (
    <HighlightsCard id={`pocket-highlights-${currency}`}>
      {bestRate?.annualInterestRateBps ? (
        <Highlight label="Best rate">
          <span className="font-semibold">{bestRate.name}</span> {rate(bestRate.annualInterestRateBps)}
        </Highlight>
      ) : null}
      {topEarner ? (
        <Highlight label="Earned the most" detail={topEarner.percent === null ? undefined : `${topEarner.percent.toFixed(2)}% of what you put in`}>
          <span className="font-semibold">{topEarner.pocket.name}</span> <Money amountMinor={topEarner.pocket.interestEarnedMinor} currency={currency} />
        </Highlight>
      ) : null}
      {biggest ? (
        <Highlight label="Largest pocket" detail={`${biggest.sharePercent.toFixed(0)}% of your pockets`}>
          <span className="font-semibold">{biggest.pocket.name}</span> <Money amountMinor={biggest.pocket.currentBalanceMinor} currency={currency} />
        </Highlight>
      ) : null}
      {quietest ? (
        <Highlight label="Not added to in" detail={`last deposit ${shortDate(quietest.lastDate)}`}>
          <span className="font-semibold">{quietest.pocket.name}</span> {describeDuration(quietest.days)}
        </Highlight>
      ) : null}
    </HighlightsCard>
  );
}
