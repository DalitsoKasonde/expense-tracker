"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FormDialog, PageHeader } from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { useUnifiedDashboard } from "@/lib/use-unified-dashboard";
import { formatMoney } from "@/lib/format-money";

type BondCashflowProjection = {
  id: string;
  eventType: string;
  disposition: string;
  scheduledDate: string;
  paymentDate?: string | null;
  grossAmountMinor: number;
  taxAmountMinor: number;
  netAmountMinor: number;
  status: string;
  destinationAssetId?: string | null;
};

interface BondProjection {
  bond: {
    cashAccountId: string;
    principalMinor: number;
    purchaseFeeMinor: number;
    issueDate: string;
    maturityDate: string;
  };
  totalProjectedPayoutMinor: number;
  totalGrossCouponMinor: number;
  totalCouponTaxMinor: number;
  totalCouponMinor: number;
  totalCashBalanceMinor: number;
  totalReinvestedMinor: number;
  cashflows: BondCashflowProjection[];
}

interface Account {
  id: string;
  name: string;
  accountType: string;
  accountClass: string;
  currency: string;
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
  const apiCallRef = useRef(apiCall);
  apiCallRef.current = apiCall;
  const { data, loading, reload } = useUnifiedDashboard();
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
  const [confirmingCashflowId, setConfirmingCashflowId] = useState("");
  const [couponError, setCouponError] = useState("");
  const [couponForm, setCouponForm] = useState({
    grossAmount: "",
    taxAmount: "0",
    paymentDate: today(),
    cashAccountId: "",
    destination: "cash",
    destinationAssetId: "",
    unitPrice: "",
    purchaseFee: "0",
  });
  const asset = data?.assets.find((item) => item.assetId === assetId) ?? null;
  const cashAccounts = accounts.filter(
    (account) =>
      account.accountClass !== "liability" &&
      account.accountType !== "receivable" &&
      account.currency === asset?.currency,
  );
  const destinationStocks = (data?.assets ?? []).filter(
    (item) => item.assetClass === "stock" && item.currency === asset?.currency,
  );
  const couponNetMinor = toMinor(couponForm.grossAmount) - toMinor(couponForm.taxAmount);
  const couponPurchaseFeeMinor = toMinor(couponForm.purchaseFee);
  const couponUnitPriceMinor = toMinor(couponForm.unitPrice);
  const couponQuantity =
    couponForm.destination === "stock" && couponUnitPriceMinor > 0
      ? Math.max(0, couponNetMinor - couponPurchaseFeeMinor) / couponUnitPriceMinor
      : 0;

  useEffect(() => {
    if (!assetId) {
      return;
    }

    let ignore = false;
    const fetchDetails = async () => {
      try {
        const [accountsResult, holdingResult] = await Promise.all([
          apiCallRef.current<Account[]>("/v1/accounts").catch(() => []),
          apiCallRef.current<AssetHolding>(`/v1/assets/${assetId}/holding`).catch(() => null),
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
  }, [assetId]);

  useEffect(() => {
    if (!assetId || asset?.assetClass !== "bond") {
      setProjection(null);
      return;
    }

    let ignore = false;
    const fetchProjection = async () => {
      try {
        const result = await apiCallRef.current<BondProjection>(`/v1/bonds/${assetId}/projection`);
        if (!ignore) setProjection(result ?? null);
      } catch (err) {
        console.error("Failed to fetch bond projection", err);
      }
    };

    void fetchProjection();
    return () => {
      ignore = true;
    };
  }, [asset?.assetClass, assetId]);

  async function refreshHolding() {
    const result = await apiCallRef.current<AssetHolding>(`/v1/assets/${assetId}/holding`);
    setHolding(result);
  }

  function openCouponConfirmation(cashflow: BondCashflowProjection) {
    const defaultCashAccountId =
      cashAccounts.find((account) => account.id === projection?.bond.cashAccountId)?.id ??
      cashAccounts[0]?.id ??
      "";
    setCouponError("");
    setConfirmingCashflowId(cashflow.id);
    setCouponForm({
      grossAmount: (cashflow.grossAmountMinor / 100).toFixed(2),
      taxAmount: (cashflow.taxAmountMinor / 100).toFixed(2),
      paymentDate: cashflow.paymentDate ?? cashflow.scheduledDate,
      cashAccountId: defaultCashAccountId,
      destination: "cash",
      destinationAssetId: destinationStocks[0]?.assetId ?? "",
      unitPrice: "",
      purchaseFee: "0",
    });
  }

  async function submitCouponConfirmation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmingCashflowId) return;

    const grossAmountMinor = toMinor(couponForm.grossAmount);
    const taxAmountMinor = toMinor(couponForm.taxAmount);
    const unitPriceMinor = toMinor(couponForm.unitPrice);
    const purchaseFeeMinor = toMinor(couponForm.purchaseFee);
    if (grossAmountMinor <= 0 || taxAmountMinor < 0 || taxAmountMinor > grossAmountMinor) {
      setCouponError("Enter a positive gross coupon and tax between zero and the gross amount.");
      return;
    }
    if (!couponForm.cashAccountId) {
      setCouponError("Select the account that receives the coupon.");
      return;
    }
    if (
      couponForm.destination === "stock" &&
      (!couponForm.destinationAssetId || unitPriceMinor <= 0 || purchaseFeeMinor < 0 || purchaseFeeMinor >= grossAmountMinor - taxAmountMinor)
    ) {
      setCouponError("Select a stock, enter its price, and keep the purchase fee below the net coupon.");
      return;
    }

    setSavingAction(true);
    setCouponError("");
    try {
      await apiCallRef.current(
        `/v1/bonds/${assetId}/cashflows/${confirmingCashflowId}/confirm`,
        {
          method: "POST",
          body: {
            cashAccountId: couponForm.cashAccountId,
            grossAmountMinor,
            taxAmountMinor,
            paymentDate: couponForm.paymentDate,
            destination: couponForm.destination,
            destinationAssetId:
              couponForm.destination === "stock" ? couponForm.destinationAssetId : undefined,
            unitPriceMinor: couponForm.destination === "stock" ? unitPriceMinor : undefined,
            purchaseFeeMinor:
              couponForm.destination === "stock" ? purchaseFeeMinor : undefined,
          },
        },
      );
      const nextProjection = await apiCallRef.current<BondProjection>(
        `/v1/bonds/${assetId}/projection`,
      );
      setProjection(nextProjection);
      setConfirmingCashflowId("");
      setActionStatus("Coupon confirmed and recorded.");
      reload();
    } catch (error) {
      setCouponError(error instanceof Error ? error.message : "Failed to confirm coupon");
    } finally {
      setSavingAction(false);
    }
  }

  async function submitSell(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAction(true);
    setActionStatus("");
    try {
      await apiCallRef.current(`/v1/assets/${assetId}/sell`, {
        method: "POST",
        body: {
          cashAccountId: sellForm.cashAccountId,
          quantity: parseFloat(sellForm.quantity),
          unitPriceMinor: toMinor(sellForm.unitPrice),
          feesMinor: toMinor(sellForm.fees),
          currency: asset?.currency ?? "ZMW",
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
      await apiCallRef.current(`/v1/assets/${assetId}/dividends`, {
        method: "POST",
        body: {
          cashAccountId: dividendForm.cashAccountId,
          amountMinor: toMinor(dividendForm.amount),
          reinvestmentPriceMinor: dividendForm.disposition === "drip" ? toMinor(dividendForm.reinvestmentPrice) : undefined,
          dividendDisposition: dividendForm.disposition,
          currency: asset?.currency ?? "ZMW",
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
      await apiCallRef.current(`/v1/assets/${assetId}/valuations`, {
        method: "POST",
        body: {
          valuationDate: valuationForm.valuationDate,
          currentValueMinor: toMinor(valuationForm.currentValue),
          currency: asset?.currency ?? "ZMW",
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
        <PageHeader
          eyebrow="Portfolio"
          title={asset.name}
          subtitle={`${asset.assetClass.replaceAll("_", " ")}. Review invested cost, current value, and upcoming payments.`}
        />

        <div className="portfolioStage">
          <section className="heroCard resourceBody">
            <p className="sectionKicker">Current position</p>
            <h2 className="text-2xl font-bold my-2">{formatMoney(asset.currentValueMinor, asset.currency)}</h2>
            <p className="muted">Current value contributing to net worth.</p>
            <div className="portfolioMiniGrid mt-4">
              <div className="metricCard">
                <span className="metricCardLabel">Invested</span>
                <strong className="metricCardValue">{formatMoney(asset.investedAmountMinor, asset.currency)}</strong>
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
                  {formatMoney(asset.currentValueMinor - asset.investedAmountMinor, asset.currency)}
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
                ? "Bond coupons remain projected until you confirm the actual amount, tax, date, and destination."
                : "This asset flows directly into portfolio value and unified net worth through the shared valuation model."}
            </p>
            <span className="pageAccent">Asset detail</span>
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
                  <strong>{formatMoney(holding.avgCostBasis, asset.currency)}</strong>
                </div>
                <div className="statCard">
                  <p className="muted">Unrealized P&L</p>
                  <strong>{formatMoney(holding.unrealizedPnl, asset.currency)}</strong>
                </div>
              </div>
            ) : null}

            <div className="settingsDetailGrid">
              <form className="settingsFormPanel" onSubmit={submitSell}>
                <div className="resourceBody">
                  <strong>Sell FIFO</strong>
                  <span className="muted">Consumes oldest lots first and calculates realized gain.</span>
                </div>
                <ActionAccountSelect inputId="sell-cash-account" accounts={accounts} value={sellForm.cashAccountId} onChange={(value) => setSellForm((current) => ({ ...current, cashAccountId: value }))} />
                <div className="splitFields">
                  <div className="field">
                    <label htmlFor="sell-quantity">Quantity</label>
                    <input id="sell-quantity" type="number" step="0.000001" value={sellForm.quantity} onChange={(event) => setSellForm((current) => ({ ...current, quantity: event.target.value }))} required />
                  </div>
                  <div className="field">
                    <label htmlFor="sell-unit-price">Unit price</label>
                    <input id="sell-unit-price" type="number" step="0.01" value={sellForm.unitPrice} onChange={(event) => setSellForm((current) => ({ ...current, unitPrice: event.target.value }))} required />
                  </div>
                </div>
                <div className="splitFields">
                  <div className="field">
                    <label htmlFor="sell-fees">Fees</label>
                    <input id="sell-fees" type="number" step="0.01" value={sellForm.fees} onChange={(event) => setSellForm((current) => ({ ...current, fees: event.target.value }))} />
                  </div>
                  <div className="field">
                    <label htmlFor="sell-execution-date">Date</label>
                    <input id="sell-execution-date" type="date" value={sellForm.executionDate} onChange={(event) => setSellForm((current) => ({ ...current, executionDate: event.target.value }))} required />
                  </div>
                </div>
                <button className="primaryButton" type="submit" disabled={savingAction}>Record sale</button>
              </form>

              <form className="settingsFormPanel" onSubmit={submitDividend}>
                <div className="resourceBody">
                  <strong>Dividend</strong>
                  <span className="muted">Cash dividends increase cash; DRIP creates a partial-share lot.</span>
                </div>
                <ActionAccountSelect inputId="dividend-cash-account" accounts={accounts} value={dividendForm.cashAccountId} onChange={(value) => setDividendForm((current) => ({ ...current, cashAccountId: value }))} />
                <div className="splitFields">
                  <div className="field">
                    <label htmlFor="dividend-disposition">Disposition</label>
                    <select id="dividend-disposition" value={dividendForm.disposition} onChange={(event) => setDividendForm((current) => ({ ...current, disposition: event.target.value }))}>
                      <option value="cash">Cash</option>
                      <option value="drip">DRIP</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="dividend-amount">Amount</label>
                    <input id="dividend-amount" type="number" step="0.01" value={dividendForm.amount} onChange={(event) => setDividendForm((current) => ({ ...current, amount: event.target.value }))} required />
                  </div>
                </div>
                {dividendForm.disposition === "drip" ? (
                  <div className="field">
                    <label htmlFor="dividend-reinvestment-price">Reinvestment price</label>
                    <input id="dividend-reinvestment-price" type="number" step="0.01" value={dividendForm.reinvestmentPrice} onChange={(event) => setDividendForm((current) => ({ ...current, reinvestmentPrice: event.target.value }))} required />
                  </div>
                ) : null}
                <div className="field">
                  <label htmlFor="dividend-execution-date">Date</label>
                  <input id="dividend-execution-date" type="date" value={dividendForm.executionDate} onChange={(event) => setDividendForm((current) => ({ ...current, executionDate: event.target.value }))} required />
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
                    <label htmlFor="valuation-current-value">Current value</label>
                    <input id="valuation-current-value" type="number" step="0.01" value={valuationForm.currentValue} onChange={(event) => setValuationForm((current) => ({ ...current, currentValue: event.target.value }))} required />
                  </div>
                  <div className="field">
                    <label htmlFor="valuation-date">Valuation date</label>
                    <input id="valuation-date" type="date" value={valuationForm.valuationDate} onChange={(event) => setValuationForm((current) => ({ ...current, valuationDate: event.target.value }))} required />
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
                <p className="muted">Purchase charge / fee</p>
                <strong>{formatMoney(projection.bond.purchaseFeeMinor, asset.currency)}</strong>
              </div>
              <div className="statCard">
                <p className="muted">Projected payout</p>
                <strong>{formatMoney(projection.totalProjectedPayoutMinor, asset.currency)}</strong>
              </div>
              <div className="statCard">
                <p className="muted">Gross coupons</p>
                <strong>{formatMoney(projection.totalGrossCouponMinor, asset.currency)}</strong>
              </div>
              <div className="statCard">
                <p className="muted">Withholding tax</p>
                <strong>{formatMoney(projection.totalCouponTaxMinor, asset.currency)}</strong>
              </div>
              <div className="statCard">
                <p className="muted">Net coupons</p>
                <strong>{formatMoney(projection.totalCouponMinor, asset.currency)}</strong>
              </div>
              <div className="statCard">
                <p className="muted">To cash balance</p>
                <strong>{formatMoney(projection.totalCashBalanceMinor, asset.currency)}</strong>
              </div>
              <div className="statCard">
                <p className="muted">Reinvested before cutoff</p>
                <strong>{formatMoney(projection.totalReinvestedMinor, asset.currency)}</strong>
              </div>
            </div>

            <div className="ledgerList mt-6">
              {projection.cashflows.map((cashflow) => {
                const destinationStock = destinationStocks.find(
                  (item) => item.assetId === cashflow.destinationAssetId,
                );
                return (
                  <div key={cashflow.id} className="ledgerRow historyRow">
                    <div className="ledgerPrimary">
                      <p className="ledgerTitle">{cashflow.eventType.replaceAll("_", " ")}</p>
                      <div className="ledgerMeta">
                        <span className="metaBadge">{cashflow.disposition.replaceAll("_", " ")}</span>
                        <span className="muted">
                          Scheduled {new Date(`${cashflow.scheduledDate}T00:00:00`).toLocaleDateString()}
                        </span>
                        {cashflow.paymentDate ? (
                          <span className="muted">
                            Paid {new Date(`${cashflow.paymentDate}T00:00:00`).toLocaleDateString()}
                          </span>
                        ) : null}
                        {destinationStock ? <span className="metaBadge">{destinationStock.name}</span> : null}
                      </div>
                    </div>
                    <div className="ledgerAmountBlock gap-1">
                      <span className="ledgerAmount positive">{formatMoney(cashflow.netAmountMinor, asset.currency)}</span>
                      {cashflow.taxAmountMinor > 0 ? (
                        <span className="muted">
                          Gross {formatMoney(cashflow.grossAmountMinor, asset.currency)} · tax{" "}
                          {formatMoney(cashflow.taxAmountMinor, asset.currency)}
                        </span>
                      ) : null}
                      <span className="muted">{cashflow.status}</span>
                      {cashflow.eventType === "coupon" && cashflow.status === "projected" ? (
                        <button
                          type="button"
                          className="ghostButton mt-2"
                          onClick={() => openCouponConfirmation(cashflow)}
                        >
                          Confirm coupon
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
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

        <FormDialog
          open={Boolean(confirmingCashflowId)}
          title="Confirm coupon payment"
          description="Adjust the actual coupon and withholding tax, then choose where the net payment goes."
          submitLabel="Confirm coupon"
          pending={savingAction}
          error={couponError || undefined}
          onSubmit={submitCouponConfirmation}
          onClose={() => {
            setConfirmingCashflowId("");
            setCouponError("");
          }}
        >
          <div className="grid gap-4">
            <div className="splitFields">
              <div className="field">
                <label htmlFor="coupon-gross">Gross coupon ({asset.currency})</label>
                <input
                  id="coupon-gross"
                  type="number"
                  min="0"
                  step="0.01"
                  value={couponForm.grossAmount}
                  onChange={(event) =>
                    setCouponForm((current) => ({ ...current, grossAmount: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="coupon-tax">Withholding tax ({asset.currency})</label>
                <input
                  id="coupon-tax"
                  type="number"
                  min="0"
                  step="0.01"
                  value={couponForm.taxAmount}
                  onChange={(event) =>
                    setCouponForm((current) => ({ ...current, taxAmount: event.target.value }))
                  }
                  required
                />
              </div>
            </div>

            <div className="rounded-md border border-outline bg-surface-soft p-3" role="status">
              <span className="muted">Net coupon</span>
              <strong className="mt-1 block text-xl text-positive">
                {formatMoney(Math.max(0, couponNetMinor), asset.currency)}
              </strong>
            </div>

            <div className="splitFields">
              <div className="field">
                <label htmlFor="coupon-payment-date">Payment date</label>
                <input
                  id="coupon-payment-date"
                  type="date"
                  value={couponForm.paymentDate}
                  onChange={(event) =>
                    setCouponForm((current) => ({ ...current, paymentDate: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="coupon-cash-account">Settlement account</label>
                <select
                  id="coupon-cash-account"
                  value={couponForm.cashAccountId}
                  onChange={(event) =>
                    setCouponForm((current) => ({ ...current, cashAccountId: event.target.value }))
                  }
                  required
                >
                  <option value="">Select account</option>
                  {cashAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {account.currency}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="coupon-destination">Use net coupon for</label>
              <select
                id="coupon-destination"
                value={couponForm.destination}
                onChange={(event) =>
                  setCouponForm((current) => ({ ...current, destination: event.target.value }))
                }
              >
                <option value="cash">Keep in settlement account</option>
                <option value="stock" disabled={destinationStocks.length === 0}>
                  Buy an existing stock
                </option>
              </select>
              {destinationStocks.length === 0 ? (
                <span className="muted">Add a stock in {asset.currency} before choosing stock reinvestment.</span>
              ) : null}
            </div>

            {couponForm.destination === "stock" ? (
              <>
                <div className="field">
                  <label htmlFor="coupon-stock">Destination stock</label>
                  <select
                    id="coupon-stock"
                    value={couponForm.destinationAssetId}
                    onChange={(event) =>
                      setCouponForm((current) => ({
                        ...current,
                        destinationAssetId: event.target.value,
                      }))
                    }
                    required
                  >
                    <option value="">Select stock</option>
                    {destinationStocks.map((item) => (
                      <option key={item.assetId} value={item.assetId}>
                        {item.name}{item.symbol ? ` (${item.symbol})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="splitFields">
                  <div className="field">
                    <label htmlFor="coupon-stock-price">Price per share ({asset.currency})</label>
                    <input
                      id="coupon-stock-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={couponForm.unitPrice}
                      onChange={(event) =>
                        setCouponForm((current) => ({ ...current, unitPrice: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="coupon-stock-fee">Purchase fee ({asset.currency})</label>
                    <input
                      id="coupon-stock-fee"
                      type="number"
                      min="0"
                      step="0.01"
                      value={couponForm.purchaseFee}
                      onChange={(event) =>
                        setCouponForm((current) => ({ ...current, purchaseFee: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <span className="muted">
                  Estimated shares: {couponQuantity > 0 ? couponQuantity.toFixed(6) : "—"}
                </span>
              </>
            ) : null}
          </div>
        </FormDialog>

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
  inputId,
  accounts,
  value,
  onChange,
}: {
  inputId: string;
  accounts: Account[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={inputId}>Cash account</label>
      <select id={inputId} value={value} onChange={(event) => onChange(event.target.value)} required>
        <option value="">Select account</option>
        {accounts
          .filter((account) => account.accountClass !== "liability")
          .map((account) => (
            <option key={account.id} value={account.id}>
              {[account.name, account.accountType?.replaceAll("_", " "), account.currency].filter(Boolean).join(" · ")}
            </option>
          ))}
      </select>
    </div>
  );
}
