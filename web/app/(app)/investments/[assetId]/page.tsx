"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppPageHeader } from "@/components/app-page-header";
import { PortfolioIcon } from "@/components/nav-icons";
import { useApiCall } from "@/lib/client-api";
import { UnifiedDashboardAsset, useUnifiedDashboard } from "@/lib/use-unified-dashboard";

interface BondProjection {
  totalProjectedPayoutMinor: number;
  totalCouponMinor: number;
  totalCashBalanceMinor: number;
  totalReinvestedMinor: number;
  cashflows: Array<{
    id: string;
    eventType: string;
    disposition: string;
    scheduledDate: string;
    netAmountMinor: number;
    status: string;
  }>;
}

interface Account {
  id: string;
  name: string;
  accountClass: string;
}

interface AssetHolding {
  quantity: number;
  totalCost: number;
  avgCostBasis: number;
  unrealizedPnl: number;
  currentValueMinor: number;
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function toMinor(value: string) {
  return Math.round((parseFloat(value || "0") || 0) * 100);
}

export default function AssetDetailPage() {
  const params = useParams<{ assetId: string }>();
  const assetId = params?.assetId ?? "";
  const apiCall = useApiCall();
  const { data, loading } = useUnifiedDashboard();
  const [projection, setProjection] = useState<BondProjection | null>(null);
  const [holding, setHolding] = useState<AssetHolding | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [actionStatus, setActionStatus] = useState("");
  const [savingAction, setSavingAction] = useState(false);
  const [sellForm, setSellForm] = useState({
    cashAccountId: "",
    quantity: "",
    unitPrice: "",
    fees: "0",
    executionDate: today(),
    note: "",
  });
  const [dividendForm, setDividendForm] = useState({
    cashAccountId: "",
    amount: "",
    reinvestmentPrice: "",
    executionDate: today(),
    disposition: "cash",
    note: "",
  });
  const [valuationForm, setValuationForm] = useState({
    currentValue: "",
    valuationDate: today(),
  });
  const asset = data?.assets.find((item) => item.assetId === assetId) ?? null;

  useEffect(() => {
    if (!assetId) {
      return;
    }

    let ignore = false;
    const fetchDetails = async () => {
      try {
        const [accountsResult, holdingResult] = await Promise.all([
          apiCall<Account[]>("/v1/accounts").catch(() => []),
          apiCall<AssetHolding>(`/v1/assets/${assetId}/holding`).catch(() => null),
        ]);
        if (!ignore) {
          setAccounts(accountsResult ?? []);
          setHolding(holdingResult);
          const firstCash = accountsResult?.find((account) => account.accountClass !== "liability")?.id ?? "";
          setSellForm((current) => ({ ...current, cashAccountId: current.cashAccountId || firstCash }));
          setDividendForm((current) => ({ ...current, cashAccountId: current.cashAccountId || firstCash }));
        }
      } catch (err) {
        console.error("Failed to fetch asset details", err);
      }
    };

    void fetchDetails();
    return () => {
      ignore = true;
    };
  }, [apiCall, assetId]);

  useEffect(() => {
    if (!assetId || asset?.assetClass !== "bond") {
      setProjection(null);
      return;
    }

    let ignore = false;
    const fetchProjection = async () => {
      try {
        const result = await apiCall<BondProjection>(`/v1/bonds/${assetId}/projection`);
        if (!ignore) setProjection(result ?? null);
      } catch (err) {
        console.error("Failed to fetch bond projection", err);
      }
    };

    void fetchProjection();
    return () => {
      ignore = true;
    };
  }, [apiCall, asset?.assetClass, assetId]);

  async function refreshHolding() {
    const result = await apiCall<AssetHolding>(`/v1/assets/${assetId}/holding`);
    setHolding(result);
  }

  async function submitSell(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAction(true);
    setActionStatus("");
    try {
      await apiCall(`/v1/assets/${assetId}/sell`, {
        method: "POST",
        body: {
          cashAccountId: sellForm.cashAccountId,
          quantity: parseFloat(sellForm.quantity),
          unitPriceMinor: toMinor(sellForm.unitPrice),
          feesMinor: toMinor(sellForm.fees),
          currency: "ZMW",
          executionDate: sellForm.executionDate,
          note: sellForm.note || undefined,
        },
      });
      setSellForm((current) => ({ ...current, quantity: "", unitPrice: "", fees: "0", note: "" }));
      await refreshHolding();
      setActionStatus("Sale recorded using FIFO lots.");
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Failed to record sale");
    } finally {
      setSavingAction(false);
    }
  }

  async function submitDividend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAction(true);
    setActionStatus("");
    try {
      await apiCall(`/v1/assets/${assetId}/dividends`, {
        method: "POST",
        body: {
          cashAccountId: dividendForm.cashAccountId,
          amountMinor: toMinor(dividendForm.amount),
          reinvestmentPriceMinor: dividendForm.disposition === "drip" ? toMinor(dividendForm.reinvestmentPrice) : undefined,
          dividendDisposition: dividendForm.disposition,
          currency: "ZMW",
          executionDate: dividendForm.executionDate,
          note: dividendForm.note || undefined,
        },
      });
      setDividendForm((current) => ({ ...current, amount: "", reinvestmentPrice: "", note: "" }));
      await refreshHolding();
      setActionStatus(dividendForm.disposition === "drip" ? "DRIP dividend recorded as a new lot." : "Cash dividend recorded.");
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Failed to record dividend");
    } finally {
      setSavingAction(false);
    }
  }

  async function submitValuation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAction(true);
    setActionStatus("");
    try {
      await apiCall(`/v1/assets/${assetId}/valuations`, {
        method: "POST",
        body: {
          valuationDate: valuationForm.valuationDate,
          currentValueMinor: toMinor(valuationForm.currentValue),
          currency: "ZMW",
          source: "manual",
        },
      });
      await refreshHolding();
      setActionStatus("Valuation updated.");
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Failed to update valuation");
    } finally {
      setSavingAction(false);
    }
  }

  if (loading) return <div className="shell">Loading...</div>;
  if (!asset) {
    return (
      <main className="shell">
        <section className="appChrome">
          <p className="muted">Asset not found.</p>
          <Link href="/investments" className="ghostButton">
            Back
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="appChrome workspaceStack">
        <AppPageHeader
          eyebrow="Inscribed portfolio"
          title={asset.name}
          accent={asset.assetClass.replaceAll("_", " ")}
          lead="Review invested capital, current value, and upcoming bond cash-flow detail inside the same portfolio workspace."
          icon={PortfolioIcon}
        />

        <div className="portfolioStage">
          <section className="heroCard resourceBody">
            <p className="sectionKicker">Current position</p>
            <h2 className="text-2xl font-bold my-2">ZMW {(asset.currentValueMinor / 100).toFixed(2)}</h2>
            <p className="muted">Current value contributing to net worth.</p>
            <div className="portfolioMiniGrid mt-4">
              <div className="metricCard">
                <span className="metricCardLabel">Invested</span>
                <strong className="metricCardValue">ZMW {(asset.investedAmountMinor / 100).toFixed(2)}</strong>
              </div>
              {holding ? (
                <div className="metricCard">
                  <span className="metricCardLabel">Shares / Units</span>
                  <strong className="metricCardValue">{holding.quantity.toFixed(4)}</strong>
                </div>
              ) : null}
              <div className="metricCard">
                <span className="metricCardLabel">Change</span>
                <strong className="metricCardValue">
                  ZMW {((asset.currentValueMinor - asset.investedAmountMinor) / 100).toFixed(2)}
                </strong>
              </div>
            </div>
          </section>

          <aside className="spotlightCard marketSummaryCard">
            <span className="sectionKicker">Asset summary</span>
            <h2 className="sectionHeading">
              {asset.symbol ? `${asset.name} is tracked under ${asset.symbol}.` : `${asset.name} is now part of the unified portfolio.`}
            </h2>
            <p className="muted">
              {asset.assetClass === "bond"
                ? "Bond coupons can now project forward and automatically move into cash once the reinvestment cutoff is reached."
                : "This asset flows directly into portfolio value and unified net worth through the shared valuation model."}
            </p>
            <span className="pageAccent">Inscribed Detail</span>
          </aside>
        </div>

        {asset.assetClass !== "bond" ? (
          <section className="card settingsListPanel">
            <div className="sectionHeaderCopy">
              <p className="sectionKicker">Equity actions</p>
              <h2 className="sectionHeading">Lots, dividends, and valuation</h2>
            </div>

            {holding ? (
              <div className="statsGrid">
                <div className="statCard">
                  <p className="muted">Average cost</p>
                  <strong>ZMW {(holding.avgCostBasis / 100).toFixed(2)}</strong>
                </div>
                <div className="statCard">
                  <p className="muted">Unrealized P&L</p>
                  <strong>ZMW {(holding.unrealizedPnl / 100).toFixed(2)}</strong>
                </div>
              </div>
            ) : null}

            <div className="settingsDetailGrid">
              <form className="settingsFormPanel" onSubmit={submitSell}>
                <div className="resourceBody">
                  <strong>Sell FIFO</strong>
                  <span className="muted">Consumes oldest lots first and calculates realized gain.</span>
                </div>
                <ActionAccountSelect accounts={accounts} value={sellForm.cashAccountId} onChange={(value) => setSellForm((current) => ({ ...current, cashAccountId: value }))} />
                <div className="splitFields">
                  <div className="field">
                    <label>Quantity</label>
                    <input type="number" step="0.000001" value={sellForm.quantity} onChange={(event) => setSellForm((current) => ({ ...current, quantity: event.target.value }))} required />
                  </div>
                  <div className="field">
                    <label>Unit price</label>
                    <input type="number" step="0.01" value={sellForm.unitPrice} onChange={(event) => setSellForm((current) => ({ ...current, unitPrice: event.target.value }))} required />
                  </div>
                </div>
                <div className="splitFields">
                  <div className="field">
                    <label>Fees</label>
                    <input type="number" step="0.01" value={sellForm.fees} onChange={(event) => setSellForm((current) => ({ ...current, fees: event.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Date</label>
                    <input type="date" value={sellForm.executionDate} onChange={(event) => setSellForm((current) => ({ ...current, executionDate: event.target.value }))} required />
                  </div>
                </div>
                <button className="primaryButton" type="submit" disabled={savingAction}>Record sale</button>
              </form>

              <form className="settingsFormPanel" onSubmit={submitDividend}>
                <div className="resourceBody">
                  <strong>Dividend</strong>
                  <span className="muted">Cash dividends increase cash; DRIP creates a partial-share lot.</span>
                </div>
                <ActionAccountSelect accounts={accounts} value={dividendForm.cashAccountId} onChange={(value) => setDividendForm((current) => ({ ...current, cashAccountId: value }))} />
                <div className="splitFields">
                  <div className="field">
                    <label>Disposition</label>
                    <select value={dividendForm.disposition} onChange={(event) => setDividendForm((current) => ({ ...current, disposition: event.target.value }))}>
                      <option value="cash">Cash</option>
                      <option value="drip">DRIP</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Amount</label>
                    <input type="number" step="0.01" value={dividendForm.amount} onChange={(event) => setDividendForm((current) => ({ ...current, amount: event.target.value }))} required />
                  </div>
                </div>
                {dividendForm.disposition === "drip" ? (
                  <div className="field">
                    <label>Reinvestment price</label>
                    <input type="number" step="0.01" value={dividendForm.reinvestmentPrice} onChange={(event) => setDividendForm((current) => ({ ...current, reinvestmentPrice: event.target.value }))} required />
                  </div>
                ) : null}
                <div className="field">
                  <label>Date</label>
                  <input type="date" value={dividendForm.executionDate} onChange={(event) => setDividendForm((current) => ({ ...current, executionDate: event.target.value }))} required />
                </div>
                <button className="primaryButton" type="submit" disabled={savingAction}>Record dividend</button>
              </form>
            </div>

            <form className="settingsFormPanel" onSubmit={submitValuation}>
              <div className="resourceBody">
                <strong>Manual valuation</strong>
                <span className="muted">Update current value for unrealized P&L and net worth reporting.</span>
              </div>
              <div className="splitFields">
                <div className="field">
                  <label>Current value</label>
                  <input type="number" step="0.01" value={valuationForm.currentValue} onChange={(event) => setValuationForm((current) => ({ ...current, currentValue: event.target.value }))} required />
                </div>
                <div className="field">
                  <label>Valuation date</label>
                  <input type="date" value={valuationForm.valuationDate} onChange={(event) => setValuationForm((current) => ({ ...current, valuationDate: event.target.value }))} required />
                </div>
              </div>
              <button className="primaryButton" type="submit" disabled={savingAction}>Update valuation</button>
            </form>

            {actionStatus ? <p className="statusText">{actionStatus}</p> : null}
          </section>
        ) : null}

        {asset.assetClass === "bond" && projection ? (
          <section className="card settingsListPanel">
            <div className="sectionHeaderCopy">
              <p className="sectionKicker">Bond ladder</p>
              <h2 className="sectionHeading">Projected cash-flow schedule</h2>
            </div>

            <div className="statsGrid">
              <div className="statCard">
                <p className="muted">Projected payout</p>
                <strong>ZMW {(projection.totalProjectedPayoutMinor / 100).toFixed(2)}</strong>
              </div>
              <div className="statCard">
                <p className="muted">Coupons</p>
                <strong>ZMW {(projection.totalCouponMinor / 100).toFixed(2)}</strong>
              </div>
              <div className="statCard">
                <p className="muted">To cash balance</p>
                <strong>ZMW {(projection.totalCashBalanceMinor / 100).toFixed(2)}</strong>
              </div>
              <div className="statCard">
                <p className="muted">Reinvested before cutoff</p>
                <strong>ZMW {(projection.totalReinvestedMinor / 100).toFixed(2)}</strong>
              </div>
            </div>

            <div className="ledgerList mt-6">
              {projection.cashflows.map((cashflow) => (
                <div key={cashflow.id} className="ledgerRow historyRow">
                  <div className="ledgerPrimary">
                    <p className="ledgerTitle">{cashflow.eventType.replaceAll("_", " ")}</p>
                    <div className="ledgerMeta">
                      <span className="metaBadge">{cashflow.disposition.replaceAll("_", " ")}</span>
                      <span className="muted">{new Date(cashflow.scheduledDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="ledgerAmountBlock">
                    <span className="ledgerAmount positive">ZMW {(cashflow.netAmountMinor / 100).toFixed(2)}</span>
                    <span className="muted">{cashflow.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="card resourceBody">
            <strong>{asset.assetClass === "bond" ? "Projection loading or unavailable" : "Valuation-based asset"}</strong>
            <span className="muted">
              {asset.assetClass === "bond"
                ? "Bond schedule details will appear here once projection data is available."
                : "This asset is currently tracked through invested amount and current value rather than a coupon schedule."}
            </span>
          </section>
        )}

        <div className="mt-8">
          <Link href="/investments" className="ghostButton">
            Back
          </Link>
        </div>
      </section>
    </main>
  );
}

function ActionAccountSelect({
  accounts,
  value,
  onChange,
}: {
  accounts: Account[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label>Cash account</label>
      <select value={value} onChange={(event) => onChange(event.target.value)} required>
        <option value="">Select account</option>
        {accounts
          .filter((account) => account.accountClass !== "liability")
          .map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
      </select>
    </div>
  );
}
