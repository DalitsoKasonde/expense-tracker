"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Breadcrumbs, EmptyState, LoadingSkeleton, PageHeader, PageShell } from "@/components/ui";
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
                  <div className="grid gap-4 sm:grid-cols-3">
                    <SummaryMetric label="Market value" value={formatMoney(total.value, total.currency)} />
                    <SummaryMetric label="Invested" value={formatMoney(total.cost, total.currency)} />
                    <SummaryMetric
                      label={difference >= 0 ? "Portfolio growth" : "Portfolio fall"}
                      value={`${difference >= 0 ? "+" : ""}${formatMoney(difference, total.currency)}`}
                      detail={percent === null ? undefined : `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`}
                      tone={difference >= 0 ? "positive" : "negative"}
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
                    <Link href={`/investments/${stock.assetId}`} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-surface-soft">
                      <div>
                        <p className="font-semibold text-on-surface">{stock.name}</p>
                        <p className="mt-1 text-xs text-on-surface-soft">
                          {stock.symbol || "Ticker missing"} · {stock.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares
                          {stock.marketPriceMinor !== undefined ? ` · ${formatMoney(stock.marketPriceMinor, stock.currency)} per share` : ""}
                        </p>
                      </div>
                      {stock.hasPosition ? (
                        <div className="text-right">
                          <p className="font-semibold tabular-nums text-on-surface">{formatMoney(stock.displayValueMinor, stock.currency)}</p>
                          <p className={`mt-1 text-xs font-semibold tabular-nums ${difference >= 0 ? "text-positive" : "text-negative"}`}>
                            {difference >= 0 ? "+" : ""}{formatMoney(difference, stock.currency)}
                            {percent === null ? "" : ` (${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%)`}
                          </p>
                        </div>
                      ) : <span className="text-sm text-on-surface-soft">Nothing bought yet</span>}
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

function SummaryMetric({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: "positive" | "negative" }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">{label}</p>
      <p className={`mt-2 font-display text-2xl font-semibold tabular-nums ${tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-on-surface"}`}>{value}</p>
      {detail ? <p className={`mt-1 text-sm font-semibold ${tone === "negative" ? "text-negative" : "text-positive"}`}>{detail}</p> : null}
    </div>
  );
}
