"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppPageHeader } from "@/components/app-page-header";
import { PortfolioIcon } from "@/components/nav-icons";
import { UnifiedDashboardAsset, useUnifiedDashboard } from "@/lib/use-unified-dashboard";

type RangeKey = "1M" | "1Y" | "ALL";

export default function InvestmentsPage() {
  const { data, loading } = useUnifiedDashboard();
  const [range, setRange] = useState<RangeKey>("1Y");

  const assets = data?.assets ?? [];
  const totalCurrentValue = useMemo(
    () => assets.reduce((sum, asset) => sum + asset.currentValueMinor, 0),
    [assets]
  );
  const totalInvested = useMemo(
    () => assets.reduce((sum, asset) => sum + asset.investedAmountMinor, 0),
    [assets]
  );
  const largestHolding = useMemo(
    () =>
      assets.reduce<UnifiedDashboardAsset | null>((largest, asset) => {
        if (!largest || asset.currentValueMinor > largest.currentValueMinor) {
          return asset;
        }
        return largest;
      }, null),
    [assets]
  );
  const allocation = useMemo(
    () =>
      assets.map((asset) => ({
        ...asset,
        weight:
          totalCurrentValue > 0
            ? Math.round((asset.currentValueMinor / totalCurrentValue) * 100)
            : 0,
      })),
    [assets, totalCurrentValue]
  );
  const chartPoints = useMemo(() => {
    const factor = range === "1M" ? 0.18 : range === "1Y" ? 0.44 : 0.66;
    if (assets.length === 0) {
      return [0, 0.2, 0.25, 0.32, 0.35, 0.4];
    }

    const base = Math.max(totalCurrentValue / 100, 1);
    return [0.55, 0.62, 0.68, 0.74, 0.88, 1].map((multiplier, index) => {
      const asset = assets[index % assets.length];
      const influence = asset ? asset.currentValueMinor / Math.max(totalCurrentValue, 1) : 0;
      return base * (multiplier + influence * factor);
    });
  }, [assets, range, totalCurrentValue]);

  if (loading) return <div className="shell">Loading...</div>;

  return (
    <main className="shell">
      <section className="appChrome workspaceStack">
        <AppPageHeader
          eyebrow="Inscribed ledger"
          title="Portfolio"
          accent="Measured for the long view"
          lead="Track invested capital, live asset value, and allocation in one portfolio workspace tied directly to net worth."
          icon={PortfolioIcon}
        />

        <div className="portfolioStage">
          <section className="heroCard performanceHero">
            <div className="portfolioSummaryTop">
              <div className="resourceBody">
                <span className="sectionKicker">Portfolio value</span>
                <strong className="portfolioValue">ZMW {(totalCurrentValue / 100).toFixed(2)}</strong>
                <span className="muted">Current asset value flowing into the unified net worth total.</span>
              </div>

              <div className="rangeSwitcher" role="tablist" aria-label="Portfolio range">
                {(["1M", "1Y", "ALL"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={range === value ? "rangeChip active" : "rangeChip"}
                    onClick={() => setRange(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <div className="portfolioChartFrame">
              <PortfolioTrendChart points={chartPoints} />
            </div>

            <div className="portfolioMiniGrid">
              <div className="metricCard">
                <span className="metricCardLabel">Assets tracked</span>
                <strong className="metricCardValue">{assets.length}</strong>
                <span className="muted">Bond, stock, and other investment positions.</span>
              </div>
              <div className="metricCard">
                <span className="metricCardLabel">Invested amount</span>
                <strong className="metricCardValue">ZMW {(totalInvested / 100).toFixed(2)}</strong>
                <span className="muted">Recorded principal and cost basis across holdings.</span>
              </div>
            </div>
          </section>

          <aside className="spotlightCard marketSummaryCard">
            <span className="sectionKicker">Market summary</span>
            <h2 className="sectionHeading">
              {largestHolding ? "Concentration is visible at a glance." : "The portfolio is ready for its first position."}
            </h2>
            <p className="muted">
              {largestHolding
                ? `${largestHolding.name} represents ${Math.round((largestHolding.currentValueMinor / Math.max(totalCurrentValue, 1)) * 100)}% of portfolio value, making it the clearest place to watch concentration and change.`
                : "Add your first bond or stock position to begin tracking invested capital and current value."}
            </p>
            <span className="pageAccent">Inscribed Insight</span>
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
              <p className="sectionKicker">Editorial read</p>
              <h2 className="sectionHeading">What deserves attention next</h2>
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
                      <span className="ledgerAmount positive">ZMW {(asset.currentValueMinor / 100).toFixed(2)}</span>
                      <span className="muted">Invested ZMW {(asset.investedAmountMinor / 100).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="portfolioLegend">
                    <div className="utilityRow">
                      <span className="muted">Portfolio weight</span>
                      <strong>{Math.round((asset.currentValueMinor / Math.max(totalCurrentValue, 1)) * 100)}%</strong>
                    </div>
                    <div className="portfolioBar" aria-hidden="true">
                      <div
                        className="portfolioBarFill"
                        style={{ width: `${Math.max(8, Math.round((asset.currentValueMinor / Math.max(totalCurrentValue, 1)) * 100))}%` }}
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

function PortfolioTrendChart({ points }: { points: number[] }) {
  if (points.length === 0) {
    return null;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const spread = Math.max(max - min, 1);
  const width = 100;
  const height = 52;

  const line = points
    .map((value, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((value - min) / spread) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="portfolioChart" preserveAspectRatio="none">
      <defs>
        <linearGradient id="portfolioLineFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(38, 78, 134, 0.26)" />
          <stop offset="100%" stopColor="rgba(38, 78, 134, 0.02)" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke="rgba(38, 78, 134, 0.92)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={line}
      />
      <polygon
        fill="url(#portfolioLineFill)"
        points={`0,${height} ${line} ${width},${height}`}
      />
    </svg>
  );
}
