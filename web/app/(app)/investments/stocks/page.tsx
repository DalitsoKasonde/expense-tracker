"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Breadcrumbs, EmptyState, LoadingSkeleton, Money, PageHeader, PageShell } from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { formatMoney } from "@/lib/format-money";
import type { MarketStock, MarketStockDirectory } from "@/lib/market-data";
import { gainPercent } from "@/lib/portfolio-holdings";
import { useUnifiedDashboard, type UnifiedDashboardAsset } from "@/lib/use-unified-dashboard";

type Holding = {
  assetId: string;
  quantity: number;
  totalCost: number;
  currentValue: number;
};

/**
 * Dividend income per currency, from /v1/investments/dividends/summary.
 *
 * Received counts cash and reinvested dividends together; the cash/reinvested
 * fields are a breakdown of that total, not an addition to it.
 */
type DividendCurrencySummary = {
  currency: string;
  dividendsReceivedMinor: number;
  dividendsCount: number;
  reinvestedMinor: number;
  paidToCashMinor: number;
  payingStockCount: number;
};

/** Dividends to date as a share of what was invested. */
function dividendYield(receivedMinor: number, investedMinor: number) {
  if (investedMinor <= 0) return null;
  return (receivedMinor / investedMinor) * 100;
}

type StockRow = UnifiedDashboardAsset & {
  quantity: number;
  marketPriceMinor?: number;
  displayValueMinor: number;
};

function marketDate(updatedAt: string) {
  const date = updatedAt?.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
}

export default function StocksDashboardPage() {
  const apiCall = useApiCall();
  const { data, loading, reload } = useUnifiedDashboard();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] = useState<Record<string, MarketStock>>({});
  const [dividends, setDividends] = useState<DividendCurrencySummary[] | null>(null);
  // Distinguished from "no dividends yet": showing a confident zero when the
  // request failed would misreport income.
  const [dividendsFailed, setDividendsFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    void apiCall<Holding[]>("/v1/investments/holdings")
      .then((result) => {
        if (!ignore) setHoldings(result ?? []);
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [apiCall]);

  useEffect(() => {
    let ignore = false;
    void apiCall<DividendCurrencySummary[]>("/v1/investments/dividends/summary")
      .then((result) => {
        if (ignore) return;
        setDividends(result ?? []);
        setDividendsFailed(false);
      })
      .catch(() => {
        if (ignore) return;
        setDividends(null);
        setDividendsFailed(true);
      });
    return () => {
      ignore = true;
    };
  }, [apiCall]);

  const dividendsByCurrency = useMemo(
    () => new Map((dividends ?? []).map((summary) => [summary.currency, summary])),
    [dividends],
  );

  const stocks = useMemo<StockRow[]>(() => {
    const holdingsByAsset = new Map(holdings.map((holding) => [holding.assetId, holding]));
    return (data?.assets ?? [])
      .filter((asset) => asset.assetClass === "stock")
      .map((asset) => {
        const holding = holdingsByAsset.get(asset.assetId);
        const quote = asset.symbol ? prices[asset.symbol.trim().toUpperCase()] : undefined;
        return {
          ...asset,
          quantity: holding?.quantity ?? 0,
          marketPriceMinor: quote?.priceMinor,
          displayValueMinor: quote
            ? Math.round(quote.priceMinor * (holding?.quantity ?? 0))
            : asset.currentValueMinor,
        };
      })
      .sort((first, second) => second.displayValueMinor - first.displayValueMinor);
  }, [data?.assets, holdings, prices]);

  const totals = useMemo(() => {
    const byCurrency = new Map<string, { currency: string; value: number; cost: number }>();
    for (const stock of stocks) {
      if (!stock.hasPosition) continue;
      const total = byCurrency.get(stock.currency) ?? { currency: stock.currency, value: 0, cost: 0 };
      total.value += stock.displayValueMinor;
      total.cost += stock.investedAmountMinor;
      byCurrency.set(stock.currency, total);
    }
    return [...byCurrency.values()].sort((a, b) => b.value - a.value);
  }, [stocks]);

  async function refreshMarketPrices() {
    const pricedStocks = stocks.filter((stock) => stock.hasPosition && stock.quantity > 0 && stock.symbol?.trim());
    if (!pricedStocks.length) {
      setError("Add a LuSE ticker to an active stock holding before getting market prices.");
      return;
    }

    setRefreshing(true);
    setStatus("");
    setError("");
    try {
      const directory = await apiCall<MarketStockDirectory>("/v1/market-data/luse");
      const directoryByTicker = new Map(
        (directory.stocks ?? []).map((stock) => [stock.ticker.trim().toUpperCase(), stock]),
      );
      const nextPrices: Record<string, MarketStock> = {};
      const updates: Promise<unknown>[] = [];
      let unmatched = 0;

      for (const stock of pricedStocks) {
        const ticker = stock.symbol!.trim().toUpperCase();
        const quote = directoryByTicker.get(ticker);
        if (!quote) {
          unmatched += 1;
          continue;
        }
        nextPrices[ticker] = quote;
        updates.push(apiCall(`/v1/assets/${stock.assetId}/valuations`, {
          method: "POST",
          body: {
            valuationDate: marketDate(directory.updatedAt),
            currentValueMinor: Math.round(quote.priceMinor * stock.quantity),
            currency: stock.currency,
            source: "mansa_market",
          },
        }));
      }

      const results = await Promise.allSettled(updates);
      const failed = results.filter((result) => result.status === "rejected").length;
      setPrices(nextPrices);
      reload();
      const updated = updates.length - failed;
      setStatus(
        `${updated} ${updated === 1 ? "holding" : "holdings"} updated${unmatched ? ` · ${unmatched} ticker${unmatched === 1 ? "" : "s"} not found` : ""}${failed ? ` · ${failed} failed` : ""}.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Market prices are unavailable right now.");
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return <PageShell><LoadingSkeleton className="h-10" /><LoadingSkeleton className="h-40" /><LoadingSkeleton className="h-64" /></PageShell>;
  }

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Portfolio", href: "/investments" }, { label: "Stocks" }]} />
      <PageHeader
        eyebrow="Stock dashboard"
        title="Stocks"
        subtitle="Refresh every LuSE holding together, then see whether the portfolio has grown or fallen against cost."
        actions={
          <>
            <button className="btn btn-primary" type="button" disabled={refreshing} onClick={() => void refreshMarketPrices()}>
              {refreshing ? "Getting prices…" : "Get market price"}
            </button>
            <Link href="/investments/add" className="btn btn-ghost">Add stock</Link>
          </>
        }
      />

      {error ? <p className="statusText text-negative" role="alert">{error}</p> : null}
      {status ? <p className="statusText text-positive" role="status">{status}</p> : null}

      {stocks.length === 0 ? (
        <EmptyState title="No stocks yet" description="Add your first stock holding to track its cost and market growth." action={<Link href="/investments/add" className="btn btn-primary">Add stock</Link>} />
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-3" aria-label="Stock portfolio summary">
            {totals.map((total) => {
              const difference = total.value - total.cost;
              const percent = gainPercent(total.value, total.cost);
              return (
                <article key={total.currency} className="card md:col-span-3">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <SummaryMetric label="Market value" value={formatMoney(total.value, total.currency)} />
                    <SummaryMetric label="Invested" value={formatMoney(total.cost, total.currency)} />
                    <SummaryMetric
                      label={difference >= 0 ? "Portfolio growth" : "Portfolio fall"}
                      value={`${difference >= 0 ? "+" : ""}${formatMoney(difference, total.currency)}`}
                      detail={percent === null ? undefined : `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`}
                      tone={difference >= 0 ? "positive" : "negative"}
                    />
                    {/* Dividends are return the growth figure cannot see: they were
                        paid to a cash account, so they lower nothing in "value less
                        cost". Shown beside it rather than folded in, so each figure
                        keeps meaning something on its own. */}
                    <DividendMetric
                      summary={dividendsByCurrency.get(total.currency)}
                      currency={total.currency}
                      investedMinor={total.cost}
                      loading={dividends === null && !dividendsFailed}
                      failed={dividendsFailed}
                    />
                  </div>
                </article>
              );
            })}
          </section>

          <section className="card card-flush overflow-hidden">
            <div className="border-b border-outline p-5"><h2 className="font-semibold text-on-surface">Holdings</h2></div>
            <ul>
              {stocks.map((stock) => {
                const difference = stock.displayValueMinor - stock.investedAmountMinor;
                const percent = gainPercent(stock.displayValueMinor, stock.investedAmountMinor);
                return (
                  <li key={stock.assetId} className="border-b border-outline last:border-0">
                    {/* No wrapping: a long company name used to push the value onto
                        its own line, where a right-aligned amount reads as if it
                        belongs to no column at all. The name column shrinks instead. */}
                    <Link href={`/investments/${stock.assetId}`} className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-surface-soft">
                      <div className="min-w-0">
                        <p className="font-semibold text-on-surface">{stock.name}</p>
                        <p className="mt-1 text-xs text-on-surface-soft">
                          {stock.symbol || "Ticker missing"} · {stock.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares
                          {stock.marketPriceMinor !== undefined ? ` · ${formatMoney(stock.marketPriceMinor, stock.currency)} per share` : ""}
                        </p>
                      </div>
                      {stock.hasPosition ? (
                        <div className="shrink-0 text-right">
                          <p className="font-semibold tabular-nums text-on-surface">{formatMoney(stock.displayValueMinor, stock.currency)}</p>
                          <p className="mt-1 text-xs font-semibold">
                            <Money amountMinor={difference} currency={stock.currency} signed tone="auto" />
                            {percent === null ? "" : ` (${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%)`}
                          </p>
                        </div>
                      ) : <span className="shrink-0 text-sm text-on-surface-soft">Nothing bought yet</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </PageShell>
  );
}

function DividendMetric({
  summary,
  currency,
  investedMinor,
  loading,
  failed,
}: {
  summary?: DividendCurrencySummary;
  currency: string;
  investedMinor: number;
  loading: boolean;
  failed: boolean;
}) {
  const received = summary?.dividendsReceivedMinor ?? 0;
  const count = summary?.dividendsCount ?? 0;
  const payers = summary?.payingStockCount ?? 0;
  const yieldToDate = dividendYield(received, investedMinor);
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Dividends received</p>
      {failed ? (
        <p className="mt-2 text-sm text-on-surface-soft">We couldn&apos;t load dividend income. Reload to try again.</p>
      ) : loading ? (
        <LoadingSkeleton className="mt-2 h-8" />
      ) : (
        <>
          <p className="mt-2 font-display text-2xl font-semibold">
            <Money amountMinor={received} currency={currency} signed tone={received > 0 ? "positive" : "neutral"} />
          </p>
          <p className="mt-1 text-sm text-on-surface-soft">
            {count
              ? `${count} ${count === 1 ? "payment" : "payments"} from ${payers} ${payers === 1 ? "stock" : "stocks"}${
                  yieldToDate === null ? "" : ` · ${yieldToDate.toFixed(1)}% of invested`
                }`
              : "No dividends paid yet"}
          </p>
          {summary?.reinvestedMinor ? (
            <p className="mt-1 text-xs text-on-surface-soft">
              {formatMoney(summary.reinvestedMinor, currency)} reinvested · {formatMoney(summary.paidToCashMinor, currency)} paid to cash
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function SummaryMetric({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: "positive" | "negative" }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">{label}</p>
      <p className={`mt-2 font-display text-2xl font-semibold tabular-nums ${tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-on-surface"}`}>{value}</p>
      {detail ? <p className={`mt-1 text-sm font-semibold ${tone === "negative" ? "text-negative" : "text-positive"}`}>{detail}</p> : null}
    </div>
  );
}
