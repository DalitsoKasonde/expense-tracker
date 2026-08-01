"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Breadcrumbs,
  EmptyState,
  PageHeader,
  PageShell,
} from "@/components/ui";
import { useUnifiedDashboard } from "@/lib/use-unified-dashboard";
import { formatMoney } from "@/lib/format-money";

export default function InvestmentsPage() {
  const { data, loading } = useUnifiedDashboard();

  const {
    assets,
    currencyTotals,
    missingPositionCount,
    positionedAssetCount,
    primaryCurrency,
    totalCurrentValue,
    totalInvested,
  } = useMemo(() => {
    const nextAssets = data?.assets ?? [];
    const positionedAssets = nextAssets.filter((asset) => asset.hasPosition);
    const nextPrimaryCurrency = data?.currency ?? nextAssets[0]?.currency ?? "ZMW";
    const totals = new Map<string, { current: number; invested: number }>();
    let nextTotalCurrentValue = 0;
    let nextTotalInvested = 0;

    for (const asset of positionedAssets) {
      const total = totals.get(asset.currency) ?? { current: 0, invested: 0 };
      total.current += asset.currentValueMinor;
      total.invested += asset.investedAmountMinor;
      totals.set(asset.currency, total);

      if (asset.currency === nextPrimaryCurrency) {
        nextTotalCurrentValue += asset.currentValueMinor;
        nextTotalInvested += asset.investedAmountMinor;
      }
    }

    return {
      assets: nextAssets,
      currencyTotals: [...totals.entries()],
      missingPositionCount: nextAssets.length - positionedAssets.length,
      positionedAssetCount: positionedAssets.length,
      primaryCurrency: nextPrimaryCurrency,
      totalCurrentValue: nextTotalCurrentValue,
      totalInvested: nextTotalInvested,
    };
  }, [data?.assets, data?.currency]);
  const performanceDifference = totalCurrentValue - totalInvested;

  if (loading) return <div className="page-shell">Loading...</div>;

  return (
    <PageShell>
      <section className="workspaceStack">
        <Breadcrumbs items={[{ label: "Home", href: "/today" }, { label: "Portfolio" }]} />
        <PageHeader
          eyebrow="Portfolio"
          title="Portfolio"
          subtitle="See what you own, what you invested, and what it is worth now."
          actions={
            <Link href="/investments/add" className="btn btn-primary">
              Add investment
            </Link>
          }
        />

        {assets.length === 0 ? (
          <EmptyState
            title="No investments yet"
            description="Add a stock, bond, or other holding and Expenses will track cost, current value, allocation, and concentration for you."
            action={
              <Link href="/investments/add" className="btn btn-primary">
                Add investment
              </Link>
            }
          />
        ) : (
          <>
        {missingPositionCount > 0 && (
          <section className="card" role="status">
            <strong>
              {missingPositionCount === 1
                ? "1 tracked asset has no position recorded"
                : `${missingPositionCount} tracked assets have no positions recorded`}
            </strong>
            <p className="muted">
              These assets stay visible below, but they are excluded from portfolio totals until a purchase or opening position is recorded.
            </p>
          </section>
        )}
        <section className="heroCard performanceHero">
          <div className="resourceBody">
            <span className="sectionKicker">Portfolio value</span>
            <strong className="portfolioValue">{formatMoney(totalCurrentValue, primaryCurrency)}</strong>
            {currencyTotals.length > 1 ? (
              <div className="pillList">
                {currencyTotals.map(([currency, totals]) => (
                  <span className="pill" key={currency}>{formatMoney(totals.current, currency)}</span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="portfolioSummaryGrid">
            <div className="metricCard">
              <span className="metricCardLabel">Invested</span>
              <strong className="portfolioCompactValue">{formatMoney(totalInvested, primaryCurrency)}</strong>
            </div>
            <div className="metricCard">
              <span className="metricCardLabel">Gain or loss</span>
              <strong className={`portfolioCompactValue ${performanceDifference >= 0 ? "positive" : "negative"}`}>
                {performanceDifference >= 0 ? "+" : ""}{formatMoney(performanceDifference, primaryCurrency)}
              </strong>
            </div>
            <div className="metricCard">
              <span className="metricCardLabel">Holdings</span>
              <strong className="portfolioCompactValue">{positionedAssetCount}</strong>
            </div>
          </div>
        </section>

        <section className="pageSection">
          <div className="sectionHeaderCopy">
            <p className="sectionKicker">Holdings</p>
            <h2 className="sectionHeading">Your investments</h2>
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
                    {asset.hasPosition ? (
                      <>
                        <span className="ledgerAmount positive">{formatMoney(asset.currentValueMinor, asset.currency)}</span>
                        <span className="muted">Cost {formatMoney(asset.investedAmountMinor, asset.currency)}</span>
                      </>
                    ) : (
                      <>
                        <span className="metaBadge">No position recorded</span>
                        <span className="muted">Excluded from portfolio totals</span>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
        </>
        )}
      </section>
    </PageShell>
  );
}
