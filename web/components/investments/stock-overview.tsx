"use client";

import { Money } from "@/components/ui";
import { formatPurchaseDate, formatShares, stockReturn } from "@/lib/asset-detail";
import { formatMoney } from "@/lib/format-money";

export interface StockQuote {
  ticker: string;
  priceMinor: number;
  changePercent: number;
  marketDate: string;
  sourceName: string;
  sourceUrl: string;
}

export interface StockOverviewProps {
  currency: string;
  investedMinor: number;
  currentValueMinor: number;
  holding: { quantity: number; avgCostBasis: number } | null;
  dividendTotalMinor: number;
  /** The last LuSE close fetched this visit, once the valuation has been saved from it. */
  quote: StockQuote | null;
  pricing: boolean;
  priceError: string;
  onGetMarketPrice: () => void;
}

function signedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/**
 * The value card for a stock: what it is worth, what a share is carried at,
 * and what the holding has returned once dividends are counted.
 *
 * Extracted from the asset page so the figures come from one tested function
 * and the market-price action sits beside the number it changes, rather than
 * inside a dialog two clicks away.
 */
export function StockOverview({
  currency,
  investedMinor,
  currentValueMinor,
  holding,
  dividendTotalMinor,
  quote,
  pricing,
  priceError,
  onGetMarketPrice,
}: StockOverviewProps) {
  const quantity = holding?.quantity ?? 0;
  const figures = stockReturn({ investedMinor, currentValueMinor, dividendTotalMinor, quantity });
  const canPrice = quantity > 0;

  return (
    <section className="heroCard investmentValueCard">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="sectionKicker">Current value</p>
          <h2 className="my-2 text-2xl font-bold text-on-surface">
            <Money amountMinor={currentValueMinor} currency={currency} />
          </h2>
          {figures.pricePerShareMinor === null ? (
            <p className="muted">What this investment is worth today.</p>
          ) : quote ? (
            <p className="muted">
              {formatMoney(quote.priceMinor, currency)} per share · LuSE close {formatPurchaseDate(quote.marketDate)}
              {Number.isFinite(quote.changePercent) ? ` (${signedPercent(quote.changePercent)} on the day)` : ""} ·{" "}
              <a href={quote.sourceUrl} target="_blank" rel="noreferrer">{quote.sourceName}</a>
            </p>
          ) : (
            <p className="muted">
              {formatMoney(figures.pricePerShareMinor, currency)} per share across {formatShares(quantity)} shares, from your last valuation.
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-ghost shrink-0"
          disabled={pricing || !canPrice}
          onClick={onGetMarketPrice}
        >
          {pricing ? "Getting price…" : "Get market price"}
        </button>
      </div>
      {priceError ? <p className="field-error mt-2" role="alert">{priceError}</p> : null}

      <div className="portfolioMiniGrid mt-4">
        <div className="metricCard">
          <span className="metricCardLabel">Money invested</span>
          <strong className="metricCardValue"><Money amountMinor={investedMinor} currency={currency} /></strong>
        </div>
        {holding ? (
          <div className="metricCard">
            <span className="metricCardLabel">Shares owned</span>
            <strong className="metricCardValue">{formatShares(quantity)}</strong>
          </div>
        ) : null}
        {/* The percentage sits with the breakdown, not the figure: at display
            size the money alone already fills a card, and a wrapped value is
            harder to scan than a second line of detail. */}
        <div className="metricCard">
          <span className="metricCardLabel">Total return</span>
          <strong className="metricCardValue">
            <Money amountMinor={figures.totalReturnMinor} currency={currency} signed tone="auto" />
          </strong>
          <span className="muted">
            {figures.totalReturnPercent === null ? "" : `${signedPercent(figures.totalReturnPercent)} · `}
            Price {figures.priceReturnMinor >= 0 ? "+" : ""}
            {formatMoney(figures.priceReturnMinor, currency)} · Dividends {formatMoney(dividendTotalMinor, currency)}
          </span>
        </div>
        <div className="metricCard">
          <span className="metricCardLabel">Cost recovered</span>
          <strong className="metricCardValue">
            {figures.costRecoveredPercent === null ? "—" : `${figures.costRecoveredPercent.toFixed(1)}%`}
          </strong>
          <span className="muted">
            {formatMoney(dividendTotalMinor, currency)} of {formatMoney(investedMinor, currency)} paid back in dividends.
          </span>
        </div>
        {holding ? (
          <div className="metricCard">
            <span className="metricCardLabel">Average cost per share</span>
            <strong className="metricCardValue"><Money amountMinor={holding.avgCostBasis} currency={currency} /></strong>
            <span className="muted">Includes allocated brokerage fees.</span>
          </div>
        ) : null}
        {figures.breakEvenPriceMinor === null ? null : (
          <div className="metricCard">
            <span className="metricCardLabel">Break-even price</span>
            <strong className="metricCardValue"><Money amountMinor={figures.breakEvenPriceMinor} currency={currency} /></strong>
            <span className="muted">
              {figures.breakEvenPriceMinor === 0
                ? "Dividends alone have already returned what you paid."
                : "What a share must be worth for the dividends to have made you whole."}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
