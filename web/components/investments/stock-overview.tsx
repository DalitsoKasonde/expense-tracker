"use client";

import Link from "next/link";
import { Money, SummaryMetric } from "@/components/ui";
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

export interface StockHolding {
  quantity: number;
  avgCostBasis: number;
}

function signedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/**
 * The two header actions for a stock. Pricing the holding and buying more are
 * the things done on most visits, so they sit where the stocks dashboard puts
 * its own, rather than in a column of buttons beside the figures.
 */
export function StockHeaderActions({
  assetId,
  canPrice,
  pricing,
  onGetMarketPrice,
}: {
  assetId: string;
  canPrice: boolean;
  pricing: boolean;
  onGetMarketPrice: () => void;
}) {
  return (
    <>
      <button type="button" className="btn btn-primary" disabled={pricing || !canPrice} onClick={onGetMarketPrice}>
        {pricing ? "Getting price…" : "Get market price"}
      </button>
      <Link href={`/investments/add?type=stock&mode=existing&stock=${assetId}`} className="btn btn-ghost">
        Add to this stock
      </Link>
    </>
  );
}

/**
 * The summary row for a stock, in the same shape as the stocks dashboard so
 * the two pages read as one system: four figures, each with its context in a
 * line underneath, and nothing nested inside anything else.
 *
 * Dividends are the fourth figure rather than part of the third: they were
 * paid to a cash account, so the holding's value never shows them, and the
 * return is only honest once they are added back in view.
 */
export function StockSummary({
  currency,
  investedMinor,
  currentValueMinor,
  holding,
  dividendTotalMinor,
  dividendCount,
  quote,
  priceError,
}: {
  currency: string;
  investedMinor: number;
  currentValueMinor: number;
  holding: StockHolding | null;
  dividendTotalMinor: number;
  dividendCount: number;
  quote: StockQuote | null;
  priceError: string;
}) {
  const quantity = holding?.quantity ?? 0;
  const figures = stockReturn({ investedMinor, currentValueMinor, dividendTotalMinor, quantity });

  const valueDetail = quote ? (
    <>
      {formatMoney(quote.priceMinor, currency)} per share · LuSE close {formatPurchaseDate(quote.marketDate)}
      {Number.isFinite(quote.changePercent) ? `, ${signedPercent(quote.changePercent)} on the day` : ""}
    </>
  ) : figures.pricePerShareMinor === null ? (
    "Nothing bought yet"
  ) : (
    `${formatMoney(figures.pricePerShareMinor, currency)} per share on your books`
  );

  const investedDetail = holding
    ? `${formatShares(quantity)} shares · average cost ${formatMoney(holding.avgCostBasis, currency)}`
    : undefined;

  const returnDetail = (
    <>
      {figures.totalReturnPercent === null ? "" : `${signedPercent(figures.totalReturnPercent)} · `}
      Price {figures.priceReturnMinor >= 0 ? "+" : ""}
      {formatMoney(figures.priceReturnMinor, currency)} · Dividends +{formatMoney(dividendTotalMinor, currency)}
    </>
  );

  const dividendDetail = dividendCount
    ? `${dividendCount} ${dividendCount === 1 ? "payment" : "payments"}${
        figures.costRecoveredPercent === null ? "" : ` · ${figures.costRecoveredPercent.toFixed(1)}% of cost repaid`
      }${
        figures.breakEvenPriceMinor === null
          ? ""
          : figures.breakEvenPriceMinor === 0
            ? " · cost fully repaid"
            : ` · break-even ${formatMoney(figures.breakEvenPriceMinor, currency)} a share`
      }`
    : "No dividends recorded yet";

  return (
    <section className="card" aria-label="Holding summary">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryMetric label="Market value" value={<Money amountMinor={currentValueMinor} currency={currency} />} detail={valueDetail} />
        <SummaryMetric label="Invested" value={<Money amountMinor={investedMinor} currency={currency} />} detail={investedDetail} />
        <SummaryMetric
          label={figures.totalReturnMinor >= 0 ? "Total return" : "Total loss"}
          value={<Money amountMinor={figures.totalReturnMinor} currency={currency} signed tone="auto" />}
          detail={returnDetail}
        />
        <SummaryMetric
          label="Dividends received"
          value={<Money amountMinor={dividendTotalMinor} currency={currency} signed tone={dividendTotalMinor > 0 ? "positive" : "neutral"} />}
          detail={dividendDetail}
        />
      </div>
      {priceError ? <p className="field-error mt-4" role="alert">{priceError}</p> : null}
    </section>
  );
}

/**
 * The less frequent actions, in one quiet strip instead of a card of stacked
 * buttons that stood as tall as the figures it sat beside. Delete keeps its
 * confirmation dialog; putting it in the same row is not the same as making
 * it easy.
 */
export function StockManageBar({
  onRecordDividend,
  onRecordSale,
  onUpdateValue,
  onEdit,
  onDelete,
  deleting,
}: {
  onRecordDividend: () => void;
  onRecordSale: () => void;
  onUpdateValue: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <section className="card" aria-label="Manage this stock">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-2 text-xs font-bold uppercase tracking-wider text-on-surface-soft">Manage</p>
        <button type="button" className="btn btn-ghost" onClick={onRecordDividend}>Record a dividend</button>
        <button type="button" className="btn btn-ghost" onClick={onRecordSale}>Record a sale</button>
        <button type="button" className="btn btn-ghost" onClick={onUpdateValue}>Update current value</button>
        <button type="button" className="btn btn-ghost" onClick={onEdit}>Edit investment</button>
        <span className="flex-1" aria-hidden="true" />
        <button type="button" className="btn btn-ghost" disabled={deleting} onClick={onDelete}>
          Delete investment
        </button>
      </div>
    </section>
  );
}
