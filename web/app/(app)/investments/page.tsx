"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { UnifiedDashboardAsset, useUnifiedDashboard } from "@/lib/use-unified-dashboard";
import { formatMoney } from "@/lib/format-money";

export default function InvestmentsPage() {
  const { data, loading } = useUnifiedDashboard();

  const {
    assets,
    allocation,
    allocationById,
    currencyTotals,
    largestHolding,
    primaryCurrency,
    totalCurrentValue,
    totalInvested,
  } = useMemo(() => {
    const nextAssets = data?.assets ?? [];
    const nextPrimaryCurrency = data?.currency ?? nextAssets[0]?.currency ?? "ZMW";
    const totals = new Map<string, { current: number; invested: number }>();
    let nextLargestHolding: UnifiedDashboardAsset | null = null;
    let nextTotalCurrentValue = 0;
    let nextTotalInvested = 0;

    for (const asset of nextAssets) {
      const total = totals.get(asset.currency) ?? { current: 0, invested: 0 };
      total.current += asset.currentValueMinor;
      total.invested += asset.investedAmountMinor;
      totals.set(asset.currency, total);

      if (asset.currency === nextPrimaryCurrency) {
        nextTotalCurrentValue += asset.currentValueMinor;
        nextTotalInvested += asset.investedAmountMinor;
        if (!nextLargestHolding || asset.currentValueMinor > nextLargestHolding.currentValueMinor) {
          nextLargestHolding = asset;
        }
      }
    }

    const nextAllocation = nextAssets.map((asset) => {
      const currencyTotal = totals.get(asset.currency)?.current ?? 0;
      return {
        ...asset,
        weight: currencyTotal > 0 ? Math.round((asset.currentValueMinor / currencyTotal) * 100) : 0,
      };
    });
    const nextAllocationById = new Map(nextAllocation.map((asset) => [asset.assetId, asset.weight]));

    return {
      assets: nextAssets,
      allocation: nextAllocation,
      allocationById: nextAllocationById,
      currencyTotals: [...totals.entries()],
      largestHolding: nextLargestHolding,
      primaryCurrency: nextPrimaryCurrency,
      totalCurrentValue: nextTotalCurrentValue,
      totalInvested: nextTotalInvested,
    };
  }, [data?.assets, data?.currency]);
  const performanceDifference = totalCurrentValue - totalInvested;

  if (loading) return <div className="shell">Loading...</div>;

  return (
    <main className="shell">
      <section className="appChrome workspaceStack">
        <PageHeader
          eyebrow="Portfolio"
          title="Portfolio"
          subtitle={largestHolding ? `Largest holding: ${largestHolding.name}. See what you invested, what each holding is worth now, and how your money is allocated.` : "Add your first investment to track cost, current value, and allocation."}
        />

        <div className="portfolioStage">
          <section className="heroCard performanceHero">
            <div className="portfolioSummaryTop">
              <div className="resourceBody">
                <span className="sectionKicker">Portfolio value</span>
                <strong className="portfolioValue">{formatMoney(totalCurrentValue, primaryCurrency)}</strong>
                <span className="muted">Current value in your reporting currency. Other currencies stay separate below.</span>
                <div className="pillList">{currencyTotals.map(([currency, totals]) => <span className="pill" key={currency}>{formatMoney(totals.current, currency)}</span>)}</div>
              </div>

              <span className={performanceDifference >= 0 ? "metaBadge positive" : "metaBadge negative"}>
                {performanceDifference >= 0 ? "+" : ""}{formatMoney(performanceDifference, primaryCurrency)} vs invested
              </span>
            </div>

            <div className="rounded-lg border border-outline bg-surface-soft p-4" aria-label="Current value compared with invested amount">
              <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                <span className="text-on-surface-soft">Recorded cost</span>
                <strong>{formatMoney(totalInvested, primaryCurrency)}</strong>
              </div>
              <div className="h-3 overflow-hidden rounded-pill bg-primary-soft">
                <div
                  className="h-full rounded-pill bg-investment"
                  style={{ width: `${totalCurrentValue > 0 ? Math.min(100, Math.max(4, (totalInvested / Math.max(totalCurrentValue, totalInvested)) * 100)) : 0}%` }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span className="text-on-surface-soft">Current recorded value</span>
                <strong>{formatMoney(totalCurrentValue, primaryCurrency)}</strong>
              </div>
            </div>

            <div className="portfolioMiniGrid">
              <div className="metricCard">
                <span className="metricCardLabel">Assets tracked</span>
                <strong className="metricCardValue">{assets.length}</strong>
                <span className="muted">Bond, stock, and other investment positions.</span>
              </div>
              <div className="metricCard">
                <span className="metricCardLabel">Invested amount</span>
                <strong className="metricCardValue">{formatMoney(totalInvested, primaryCurrency)}</strong>
                <span className="muted">Recorded principal in the reporting currency.</span>
              </div>
            </div>
          </section>

          <aside className="spotlightCard marketSummaryCard">
            <span className="sectionKicker">Review next</span>
            <h2 className="sectionHeading">
              {largestHolding ? `Check ${largestHolding.name}` : "Add a stock or government bond"}
            </h2>
            <p className="muted">
              {largestHolding
                ? `${largestHolding.name} represents ${Math.round((largestHolding.currentValueMinor / Math.max(totalCurrentValue, 1)) * 100)}% of ${primaryCurrency} portfolio value. Review its latest value and concentration.`
                : "Record what you paid and the app will track cost, current value, allocation, dividends, and bond payments."}
            </p>
            <Link href={largestHolding ? `/investments/${largestHolding.assetId}` : "/investments/add"} className="ghostButton">
              {largestHolding ? "Review holding" : "Add investment"}
            </Link>
          </aside>
        </div>

        <div className="portfolioEditorialGrid">
          <section className="card allocationPanel">
            <div className="sectionHeaderCopy">
              <p className="sectionKicker">Asset allocation</p>
              <h2 className="sectionHeading">Portfolio weight</h2>
            </div>
            <div className="portfolioAllocationList">
              {allocation.length === 0 ? (
                <div className="resourceBody">
                  <strong>No allocation yet</strong>
                  <span className="muted">Add an investment to begin seeing portfolio weight and balance.</span>
                </div>
              ) : (
                allocation.map((asset) => (
                  <div key={asset.assetId} className="portfolioAllocationRow">
                    <div className="utilityRow">
                      <span>{asset.name}</span>
                      <strong>{asset.weight}%</strong>
                    </div>
                    <div className="portfolioBar" aria-hidden="true">
                      <div className="portfolioBarFill" style={{ width: `${Math.max(8, asset.weight)}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="card portfolioInsightPanel">
            <div className="sectionHeaderCopy">
              <p className="sectionKicker">Concentration</p>
              <h2 className="sectionHeading">Your largest holding</h2>
            </div>
            <div className="utilityList">
              <div className="utilityRow">
                <strong>Largest holding</strong>
                <span className="metaBadge">{largestHolding?.name ?? "None yet"}</span>
              </div>
              <span className="muted">
                Review the position carrying the most value first, then compare invested amount against current value to see where performance or concentration deserves attention.
              </span>
            </div>
            <Link href="/transactions" className="ghostButton">
              Open history
            </Link>
          </section>
        </div>

        {assets.length === 0 ? (
          <div className="card resourceBody">
            <strong>No holdings yet</strong>
            <span className="muted">Add your first investment to start seeing allocation, valuation, and portfolio structure.</span>
          </div>
        ) : (
          <section className="pageSection">
            <div className="sectionHeaderCopy">
              <p className="sectionKicker">Holdings</p>
              <h2 className="sectionHeading">Portfolio structure</h2>
            </div>
            <div className="portfolioHoldingList">
              {assets.map((asset) => (
                <Link
                  key={asset.assetId}
                  href={`/investments/${asset.assetId}`}
                  className="portfolioHoldingRow"
                >
                  <div className="portfolioHoldingTop">
                    <div className="resourceBody">
                      <strong>{asset.name}</strong>
                      <span className="muted">
                        {asset.assetClass.replaceAll("_", " ")}
                        {asset.symbol ? ` • ${asset.symbol}` : ""}
                      </span>
                    </div>
                    <div className="ledgerAmountBlock">
                      <span className="ledgerAmount positive">{formatMoney(asset.currentValueMinor, asset.currency)}</span>
                      <span className="muted">Invested {formatMoney(asset.investedAmountMinor, asset.currency)}</span>
                    </div>
                  </div>
                  <div className="portfolioLegend">
                    <div className="utilityRow">
                      <span className="muted">Portfolio weight</span>
                      <strong>{allocationById.get(asset.assetId) ?? 0}%</strong>
                    </div>
                    <div className="portfolioBar" aria-hidden="true">
                      <div
                        className="portfolioBarFill"
                        style={{ width: `${Math.max(8, allocationById.get(asset.assetId) ?? 0)}%` }}
                      />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="formActions">
          <Link href="/investments/add" className="primaryButton">
            Add investment
          </Link>
        </div>
      </section>
    </main>
  );
}
