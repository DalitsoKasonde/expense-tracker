"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Crumb } from "@/components/ui";
import {
  Breadcrumbs,
  ConfirmationDialog,
  FormDialog,
  PageHeader,
  PageShell,
} from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { useUnifiedDashboard } from "@/lib/use-unified-dashboard";
import { formatMoney } from "@/lib/format-money";
import { isPastDate } from "@/lib/date-terms";
import type { MarketStockDirectory } from "@/lib/market-data";
import { isSpendableAccount } from "@/lib/spendable-accounts";

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
  isSavingsGroupAccount?: boolean;
}

interface AssetHolding {
  quantity: number;
  totalCost: number;
  avgCostBasis: number;
  unrealizedPnl: number;
  currentValueMinor: number;
  lots?: AssetLot[];
}

interface AssetLot {
  id: string;
  quantity: number;
  remainingQuantity: number;
  unitPrice: number;
  fees: number;
  totalCost: number;
  acquisitionDate: string;
}

interface AssetTransaction {
  id: string;
  transactionDate: string;
  entryKind: string;
  amount: number;
  currency: string;
  accountId?: string;
  assetId?: string;
  note?: string;
  originEventType?: string;
  source?: string;
}

interface MarketQuote {
  ticker: string;
  name: string;
  priceMinor: number;
  changeMinor: number;
  changePercent: number;
  currency: string;
  quotedAt: string;
  marketDate: string;
  sourceName: string;
  sourceUrl: string;
  refreshInterval: string;
}

type EquityDialog = "dividend" | "sell" | "value" | null;

function today() {
  return new Date().toISOString().split("T")[0];
}

function toMinor(value: string) {
  return Math.round((parseFloat(value || "0") || 0) * 100);
}

// Labels and hrefs mirror the category pages' own breadcrumbs so the trail
// reads the same wherever you entered from. Classes without a category page
// (cash_equivalent, other) fall back to Portfolio rather than linking nowhere.
function assetCategoryCrumb(assetClass: string): Crumb[] {
  if (assetClass === "stock") {
    return [{ label: "Stocks", href: "/investments/stocks" }];
  }
  if (assetClass === "bond") {
    return [{ label: "Government bonds", href: "/investments/bonds" }];
  }
  return [];
}

function formatPurchaseDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function inferLuSETicker(symbol: string | null | undefined, name: string) {
  const explicitSymbol = symbol?.trim().toUpperCase().replace(/\.ZM$/, "");
  if (explicitSymbol) {
    return explicitSymbol;
  }

  const normalizedName = name.trim().toLowerCase();
  const aliases: Array<[string, string]> = [
    ["airtel", "ATEL"],
    ["copperbelt energy", "CECZ"],
    ["zanaco", "ZNCO"],
    ["zambia national commercial", "ZNCO"],
    ["zambia sugar", "ZSUG"],
    ["standard chartered", "SCBL"],
    ["puma", "PUMA"],
    ["shoprite", "SHOP"],
    ["british american tobacco", "BATZ"],
    ["chilanga cement", "CHIL"],
    ["zambia reinsurance", "ZMRE"],
    ["zccm", "ZCCM-IH"],
    ["national breweries", "NATB"],
    ["bata", "BATA"],
  ];
  return aliases.find(([alias]) => normalizedName.includes(alias))?.[1] ?? "";
}

export default function AssetDetailPage() {
  const params = useParams<{ assetId: string }>();
  const assetId = params?.assetId ?? "";
  const router = useRouter();
  const apiCall = useApiCall();
  const apiCallRef = useRef(apiCall);
  apiCallRef.current = apiCall;
  const { data, loading, reload } = useUnifiedDashboard();
  const [projection, setProjection] = useState<BondProjection | null>(null);
  const [holding, setHolding] = useState<AssetHolding | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dividends, setDividends] = useState<AssetTransaction[]>([]);
  const [equityDialog, setEquityDialog] = useState<EquityDialog>(null);
  const [actionStatus, setActionStatus] = useState("");
  const [actionError, setActionError] = useState("");
  const [marketQuote, setMarketQuote] = useState<MarketQuote | null>(null);
  const [stockDirectory, setStockDirectory] = useState<MarketStockDirectory | null>(null);
  const [marketQuoteError, setMarketQuoteError] = useState("");
  const [loadingMarketQuote, setLoadingMarketQuote] = useState(false);
  const [savingAction, setSavingAction] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", symbol: "" });
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
    historicalBackfill: false,
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
    historicalBackfill: false,
  });
  const asset = data?.assets.find((item) => item.assetId === assetId) ?? null;
  const cashAccounts = accounts.filter(
    (account) =>
      isSpendableAccount(account) &&
      account.currency === asset?.currency,
  );
  const destinationStocks = (data?.assets ?? []).filter(
    (item) => item.assetClass === "stock" && item.currency === asset?.currency,
  );
  const couponNetMinor = toMinor(couponForm.grossAmount) - toMinor(couponForm.taxAmount);
  const couponPurchaseFeeMinor = toMinor(couponForm.purchaseFee);
  const couponUnitPriceMinor = toMinor(couponForm.unitPrice);
  const dividendTotalMinor = dividends.reduce((total, dividend) => total + dividend.amount, 0);
  const dividendHistoricalEligible = isPastDate(dividendForm.executionDate, today());
  const dividendHistoricalBackfill = dividendHistoricalEligible && dividendForm.historicalBackfill;
  const couponHistoricalEligible = isPastDate(couponForm.paymentDate, today());
  const couponHistoricalBackfill = couponHistoricalEligible && couponForm.historicalBackfill;
  // A coupon or dividend that is happening now is paid into an account and stops
  // there; the reinvestment is recorded as its own purchase at the price and date
  // it actually happened. Only a historical entry, where both legs are already in
  // the past, can be booked as a reinvestment in one step.
  const couponDestination = couponHistoricalBackfill ? couponForm.destination : "cash";
  const dividendDisposition = dividendHistoricalBackfill ? dividendForm.disposition : "cash";
  const couponQuantity =
    couponDestination === "stock" && couponUnitPriceMinor > 0
      ? Math.max(0, couponNetMinor - couponPurchaseFeeMinor) / couponUnitPriceMinor
      : 0;
  const luseTicker = asset ? inferLuSETicker(asset.symbol, asset.name) : "";
  // What the holding has actually done for you: the price move plus every
  // dividend it has paid. A reinvested dividend raises the cost basis by the
  // same amount it adds here, so it is counted once, not twice. Money already
  // banked by selling shares is not in either figure — invested and current
  // value both drop on a sale.
  const investedMinor = asset?.investedAmountMinor ?? 0;
  const priceReturnMinor = (asset?.currentValueMinor ?? 0) - investedMinor;
  const totalReturnMinor = priceReturnMinor + dividendTotalMinor;
  const totalReturnPercent = investedMinor > 0 ? (totalReturnMinor / investedMinor) * 100 : null;
  const costRecoveredPercent = investedMinor > 0 ? (dividendTotalMinor / investedMinor) * 100 : null;
  // The price at which the dividends have already made you whole.
  const breakEvenPriceMinor =
    holding && holding.quantity > 0
      ? Math.round((investedMinor - dividendTotalMinor) / holding.quantity)
      : null;

  useEffect(() => {
    if (!dividendHistoricalEligible && dividendForm.historicalBackfill) {
      setDividendForm((current) => ({ ...current, historicalBackfill: false }));
    }
  }, [dividendForm.historicalBackfill, dividendHistoricalEligible]);

  useEffect(() => {
    if (!couponHistoricalEligible && couponForm.historicalBackfill) {
      setCouponForm((current) => ({ ...current, historicalBackfill: false }));
    }
  }, [couponForm.historicalBackfill, couponHistoricalEligible]);

  useEffect(() => {
    if (!assetId) {
      return;
    }

    let ignore = false;
    const fetchDetails = async () => {
      try {
        const [accountsResult, holdingResult, transactionResult] = await Promise.all([
          apiCallRef.current<Account[]>("/v1/accounts").catch(() => []),
          apiCallRef.current<AssetHolding>(`/v1/assets/${assetId}/holding`).catch(() => null),
          apiCallRef.current<AssetTransaction[]>("/v1/transactions?limit=1000").catch(() => []),
        ]);
        if (!ignore) {
          setAccounts(accountsResult ?? []);
          setHolding(holdingResult);
          setDividends(
            (transactionResult ?? []).filter(
              (transaction) =>
                transaction.assetId === assetId &&
                (transaction.originEventType === "equity_dividend" ||
                  transaction.entryKind === "dividend_drip"),
            ),
          );
          const firstCash =
            accountsResult?.find(
              (account) =>
                isSpendableAccount(account) &&
                (!asset?.currency || account.currency === asset.currency),
            )?.id ?? "";
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
  }, [asset?.currency, assetId]);

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

  useEffect(() => {
    if (asset?.assetClass === "bond") return;
    let ignore = false;
    void apiCallRef.current<MarketStockDirectory>("/v1/market-data/luse")
      .then((directory) => {
        if (!ignore) setStockDirectory(directory ?? null);
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [asset?.assetClass]);

  async function refreshHolding() {
    const result = await apiCallRef.current<AssetHolding>(`/v1/assets/${assetId}/holding`);
    setHolding(result);
  }

  async function refreshDividends() {
    const result = await apiCallRef.current<AssetTransaction[]>("/v1/transactions?limit=1000");
    setDividends(
      (result ?? []).filter(
        (transaction) =>
          transaction.assetId === assetId &&
          (transaction.originEventType === "equity_dividend" ||
            transaction.entryKind === "dividend_drip"),
      ),
    );
  }

  async function deleteInvestment() {
    setDeleting(true);
    setActionError("");
    try {
      await apiCallRef.current(`/v1/assets/${assetId}`, { method: "DELETE" });
      router.push("/investments");
      router.refresh();
    } catch (error) {
      setDeleteOpen(false);
      setActionError(error instanceof Error ? error.message : "Failed to delete investment");
    } finally {
      setDeleting(false);
    }
  }

  function openEditInvestment() {
    setActionError("");
    setEditForm({ name: asset?.name ?? "", symbol: asset?.symbol ?? "" });
    setEditOpen(true);
  }

  async function saveInvestment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asset) return;
    setSavingAction(true);
    setActionError("");
    try {
      await apiCallRef.current(`/v1/assets/${assetId}`, {
        method: "PATCH",
        body: {
          name: editForm.name.trim(),
          symbol: editForm.symbol.trim() || undefined,
          assetClass: asset.assetClass,
          currency: asset.currency,
        },
      });
      setEditOpen(false);
      setActionStatus("Investment details updated.");
      reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to update investment");
    } finally {
      setSavingAction(false);
    }
  }

  function openEquityDialog(dialog: Exclude<EquityDialog, null>) {
    setActionError("");
    setMarketQuoteError("");
    setEquityDialog(dialog);
  }

  async function loadMarketQuote() {
    if (!luseTicker) {
      setMarketQuoteError("Add the LuSE ticker to this investment before looking up its market price.");
      return;
    }

    setLoadingMarketQuote(true);
    setMarketQuoteError("");
    try {
      const quote = await apiCallRef.current<MarketQuote>(
        `/v1/market-data/luse/${encodeURIComponent(luseTicker)}`,
      );
      const estimatedValueMinor = Math.round(quote.priceMinor * (holding?.quantity ?? 0));
      setMarketQuote(quote);
      setValuationForm((current) => ({
        ...current,
        currentValue: (estimatedValueMinor / 100).toFixed(2),
        valuationDate: quote.marketDate || current.valuationDate,
      }));
    } catch (error) {
      setMarketQuoteError(
        error instanceof Error ? error.message : "The latest market price is unavailable.",
      );
    } finally {
      setLoadingMarketQuote(false);
    }
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
      historicalBackfill: false,
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
    if (!couponHistoricalBackfill && !couponForm.cashAccountId) {
      setCouponError("Select the account that receives the coupon.");
      return;
    }
    if (
      couponDestination === "stock" &&
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
            cashAccountId: couponHistoricalBackfill ? undefined : couponForm.cashAccountId,
            grossAmountMinor,
            taxAmountMinor,
            paymentDate: couponForm.paymentDate,
            destination: couponDestination,
            destinationAssetId:
              couponDestination === "stock" ? couponForm.destinationAssetId : undefined,
            unitPriceMinor: couponDestination === "stock" ? unitPriceMinor : undefined,
            purchaseFeeMinor:
              couponDestination === "stock" ? purchaseFeeMinor : undefined,
            historicalBackfill: couponHistoricalBackfill || undefined,
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
    setActionError("");
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
      setEquityDialog(null);
      setActionStatus("Sale recorded.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to record sale");
    } finally {
      setSavingAction(false);
    }
  }

  async function submitDividend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAction(true);
    setActionStatus("");
    setActionError("");
    try {
      await apiCallRef.current(`/v1/assets/${assetId}/dividends`, {
        method: "POST",
        body: {
          cashAccountId: dividendHistoricalBackfill ? undefined : dividendForm.cashAccountId,
          amountMinor: toMinor(dividendForm.amount),
          reinvestmentPriceMinor: dividendDisposition === "drip" ? toMinor(dividendForm.reinvestmentPrice) : undefined,
          dividendDisposition,
          currency: asset?.currency ?? "ZMW",
          executionDate: dividendForm.executionDate,
          note: dividendForm.note || undefined,
          historicalBackfill: dividendHistoricalBackfill || undefined,
        },
      });
      setDividendForm((current) => ({ ...current, amount: "", reinvestmentPrice: "", historicalBackfill: false, note: "" }));
      await Promise.all([refreshHolding(), refreshDividends()]);
      setEquityDialog(null);
      setActionStatus(
        dividendDisposition === "drip"
          ? "Reinvested dividend recorded."
          : "Cash dividend recorded.",
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to record dividend");
    } finally {
      setSavingAction(false);
    }
  }

  async function submitValuation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAction(true);
    setActionStatus("");
    setActionError("");
    const quotedValueMinor = marketQuote
      ? Math.round(marketQuote.priceMinor * (holding?.quantity ?? 0))
      : null;
    const usesMarketQuote =
      quotedValueMinor !== null &&
      toMinor(valuationForm.currentValue) === quotedValueMinor &&
      valuationForm.valuationDate === marketQuote?.marketDate;
    try {
      await apiCallRef.current(`/v1/assets/${assetId}/valuations`, {
        method: "POST",
        body: {
          valuationDate: valuationForm.valuationDate,
          currentValueMinor: toMinor(valuationForm.currentValue),
          currency: asset?.currency ?? "ZMW",
          source: usesMarketQuote ? "mansa_market" : "manual",
        },
      });
      await refreshHolding();
      setEquityDialog(null);
      setActionStatus("Valuation updated.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to update valuation");
    } finally {
      setSavingAction(false);
    }
  }

  if (loading) return <div className="page-shell">Loading...</div>;
  if (!asset) {
    return (
      <PageShell>
        <section className="workspaceStack">
          <p className="muted">Asset not found.</p>
          <Link href="/investments" className="btn btn-ghost">
            Back
          </Link>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="workspaceStack">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/today" },
            { label: "Portfolio", href: "/investments" },
            ...assetCategoryCrumb(asset.assetClass),
            { label: asset.name },
          ]}
        />
        <PageHeader
          eyebrow="Portfolio"
          title={asset.name}
          subtitle={
            asset.assetClass === "bond"
              ? "See what your bond is worth and when payments are due."
              : "See what you own, what it is worth, and every dividend you have received."
          }
        />

        <div className="investmentOverview">
          <section className="heroCard investmentValueCard">
            <p className="sectionKicker">{asset.assetClass === "bond" ? "Principal value" : "Current value"}</p>
            <h2 className="text-2xl font-bold my-2">
              {formatMoney(
                asset.assetClass === "bond"
                  ? projection?.bond.principalMinor ?? asset.currentValueMinor
                  : asset.currentValueMinor,
                asset.currency,
              )}
            </h2>
            <p className="muted">
              {asset.assetClass === "bond"
                ? "The face value currently tracked for this bond."
                : "What this investment is worth today."}
            </p>
            <div className="portfolioMiniGrid mt-4">
              {asset.assetClass === "bond" ? (
                <>
                  <div className="metricCard">
                    <span className="metricCardLabel">Total purchase cost</span>
                    <strong className="metricCardValue">
                      {formatMoney(
                        projection
                          ? projection.bond.principalMinor + projection.bond.purchaseFeeMinor
                          : asset.investedAmountMinor,
                        asset.currency,
                      )}
                    </strong>
                    <span className="muted">Principal plus the purchase fee.</span>
                  </div>
                  <div className="metricCard">
                    <span className="metricCardLabel">Projected net coupons</span>
                    <strong className="metricCardValue">
                      {projection ? formatMoney(projection.totalCouponMinor, asset.currency) : "—"}
                    </strong>
                    <span className="muted">Coupon income after withholding tax.</span>
                  </div>
                  <div className="metricCard">
                    <span className="metricCardLabel">Projected total payout</span>
                    <strong className="metricCardValue">
                      {projection ? formatMoney(projection.totalProjectedPayoutMinor, asset.currency) : "—"}
                    </strong>
                    <span className="muted">Principal redemption plus net coupons.</span>
                  </div>
                  <div className="metricCard">
                    <span className="metricCardLabel">Maturity date</span>
                    <strong className="metricCardValue">
                      {projection ? formatPurchaseDate(projection.bond.maturityDate) : "—"}
                    </strong>
                    <span className="muted">When the principal is due back.</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="metricCard">
                    <span className="metricCardLabel">Money invested</span>
                    <strong className="metricCardValue">{formatMoney(asset.investedAmountMinor, asset.currency)}</strong>
                  </div>
                  {holding ? (
                    <div className="metricCard">
                      <span className="metricCardLabel">Shares owned</span>
                      <strong className="metricCardValue">{holding.quantity.toFixed(4)}</strong>
                    </div>
                  ) : null}
                  <div className="metricCard">
                    <span className="metricCardLabel">Total return</span>
                    <strong
                      className={`metricCardValue ${totalReturnMinor >= 0 ? "text-positive" : "text-negative"}`}
                    >
                      {totalReturnMinor >= 0 ? "+" : ""}
                      {formatMoney(totalReturnMinor, asset.currency)}
                      {totalReturnPercent === null
                        ? ""
                        : ` (${totalReturnPercent >= 0 ? "+" : ""}${totalReturnPercent.toFixed(1)}%)`}
                    </strong>
                    <span className="muted">
                      Price {priceReturnMinor >= 0 ? "+" : ""}
                      {formatMoney(priceReturnMinor, asset.currency)} · Dividends{" "}
                      {formatMoney(dividendTotalMinor, asset.currency)}
                    </span>
                  </div>
                  <div className="metricCard">
                    <span className="metricCardLabel">Cost recovered</span>
                    <strong className="metricCardValue">
                      {costRecoveredPercent === null ? "—" : `${costRecoveredPercent.toFixed(1)}%`}
                    </strong>
                    <span className="muted">
                      {formatMoney(dividendTotalMinor, asset.currency)} of{" "}
                      {formatMoney(asset.investedAmountMinor, asset.currency)} paid back in dividends.
                    </span>
                  </div>
                  {holding ? (
                    <div className="metricCard">
                      <span className="metricCardLabel">Average cost per share</span>
                      <strong className="metricCardValue">
                        {formatMoney(holding.avgCostBasis, asset.currency)}
                      </strong>
                      <span className="muted">Includes allocated brokerage fees.</span>
                    </div>
                  ) : null}
                  {breakEvenPriceMinor === null ? null : (
                    <div className="metricCard">
                      <span className="metricCardLabel">Break-even price</span>
                      <strong className="metricCardValue">
                        {formatMoney(Math.max(0, breakEvenPriceMinor), asset.currency)}
                      </strong>
                      <span className="muted">
                        {breakEvenPriceMinor <= 0
                          ? "Dividends alone have already returned what you paid."
                          : "What a share must be worth for the dividends to have made you whole."}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          <aside className="card investmentActionsCard">
            <div>
              <p className="sectionKicker">What would you like to do?</p>
              <h2 className="sectionHeading">Manage {asset.name}</h2>
            </div>
            {asset.assetClass !== "bond" ? (
              <div className="investmentActionList">
                <button type="button" className="investmentActionButton primary" onClick={() => openEquityDialog("dividend")}>
                  <span>Record a dividend</span>
                  <small>Add a cash payment or reinvested dividend</small>
                </button>
                <button type="button" className="investmentActionButton" onClick={() => openEquityDialog("value")}>
                  <span>Update current value</span>
                  <small>Keep your portfolio value up to date</small>
                </button>
                <button type="button" className="investmentActionButton" onClick={() => openEquityDialog("sell")}>
                  <span>Record a sale</span>
                  <small>Reduce the number of shares you own</small>
                </button>
                <Link href="/investments/add" className="investmentActionButton">
                  <span>Add another investment</span>
                  <small>Record another stock or government bond purchase</small>
                </Link>
              </div>
            ) : (
              <p className="muted">Review the payment schedule below and confirm each payment when it arrives.</p>
            )}
            <button type="button" className="btn btn-ghost" onClick={openEditInvestment}>
              Edit investment
            </button>
            <div className="border-t border-outline pt-4">
              <button
                type="button"
                className="btn btn-danger"
                disabled={deleting}
                onClick={() => {
                  setActionError("");
                  setDeleteOpen(true);
                }}
              >
                Delete investment
              </button>
              <p className="muted mt-2">Only investments without later sales, dividends, reinvestments, or confirmed coupons can be deleted.</p>
            </div>
            {actionError && equityDialog === null ? <p className="field-error" role="alert">{actionError}</p> : null}
          </aside>
        </div>

        {asset.assetClass !== "bond" ? (
          <section className="card settingsListPanel overflow-hidden">
            <div className="settingsHeaderRow">
              <div>
                <p className="sectionKicker">Cost breakdown</p>
                <h2 className="sectionHeading">Purchase lots</h2>
                <p className="muted mt-1">Each purchase keeps its share price and one-off brokerage fee separate.</p>
              </div>
            </div>
            {holding?.lots?.length ? (
              <div className="overflow-x-auto">
                <table className="dataTable">
                  <thead>
                    <tr>
                      <th>Purchase date</th>
                      <th className="numeric">Shares bought</th>
                      <th className="numeric">Remaining</th>
                      <th className="numeric">Share price</th>
                      <th className="numeric">Brokerage fee</th>
                      <th className="numeric">Total paid</th>
                      <th className="numeric">Cost per share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holding.lots.map((lot) => {
                      const effectiveCost = lot.quantity > 0 ? Math.round(lot.totalCost / lot.quantity) : 0;
                      return (
                        <tr key={lot.id}>
                          <td data-label="Purchase date" className="font-semibold text-on-surface">{formatPurchaseDate(lot.acquisitionDate)}</td>
                          <td data-label="Shares bought" className="numeric">{lot.quantity.toFixed(4)}</td>
                          <td data-label="Remaining" className="numeric">{lot.remainingQuantity.toFixed(4)}</td>
                          <td data-label="Share price" className="numeric">{formatMoney(lot.unitPrice, asset.currency)}</td>
                          <td data-label="Brokerage fee" className="numeric">{formatMoney(lot.fees, asset.currency)}</td>
                          <td data-label="Total paid" className="numeric font-semibold">{formatMoney(lot.totalCost, asset.currency)}</td>
                          <td data-label="Cost per share" className="numeric">{formatMoney(effectiveCost, asset.currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">No purchase lots have been recorded for this stock yet.</p>
            )}
          </section>
        ) : null}

        {asset.assetClass !== "bond" ? (
          <section className="card dividendHistoryCard">
            <div className="dividendHistoryHeader">
              <div>
                <p className="sectionKicker">Payments received</p>
                <h2 className="sectionHeading">Dividend history</h2>
                <p className="muted mt-1">Every dividend recorded for {asset.name} appears here.</p>
              </div>
              <div className="dividendTotal">
                <span>Total received</span>
                <strong>{formatMoney(dividendTotalMinor, asset.currency)}</strong>
              </div>
            </div>

            {actionStatus ? <p className="investmentSuccess" role="status">{actionStatus}</p> : null}

            {dividends.length > 0 ? (
              <div className="dividendList">
                {dividends.map((dividend) => {
                  const account = accounts.find((item) => item.id === dividend.accountId);
                  const reinvested = dividend.entryKind === "dividend_drip";
                  const historical = dividend.source === "historical_backfill";
                  return (
                    <div className="dividendRow" key={dividend.id}>
                      <div className="dividendDate">
                        <strong>{new Date(`${dividend.transactionDate.slice(0, 10)}T00:00:00`).getDate()}</strong>
                        <span>
                          {new Date(`${dividend.transactionDate.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      <div className="dividendDetails">
                        <strong>{reinvested ? "Reinvested dividend" : "Cash dividend"}</strong>
                        <span>
                          {historical
                            ? reinvested
                              ? "Historical · added to this investment"
                              : "Historical · no account adjustment"
                            : account?.name ?? (reinvested ? "Added to this investment" : "Cash account")}
                        </span>
                      </div>
                      <strong className="dividendAmount">
                        +{formatMoney(dividend.amount, dividend.currency)}
                      </strong>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="dividendEmptyState">
                <span className="dividendEmptyMark" aria-hidden="true">$</span>
                <div>
                  <strong>No dividends recorded yet</strong>
                  <p>When {asset.name} pays you, record it here so you can keep a complete history.</p>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => openEquityDialog("dividend")}>
                  Record first dividend
                </button>
              </div>
            )}
          </section>
        ) : null}

        {asset.assetClass === "bond" ? projection ? (
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
                        <span className="metaBadge">
                          {cashflow.disposition === "historical_cash"
                            ? "historical · no account adjustment"
                            : cashflow.disposition.replaceAll("_", " ")}
                        </span>
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
                          className="btn btn-ghost mt-2"
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
            <strong>Payment schedule unavailable</strong>
            <span className="muted">
              Bond payment details will appear here when they are available.
            </span>
          </section>
        ) : null}

        <ConfirmationDialog
          open={deleteOpen}
          title={`Delete ${asset.name}?`}
          description="This removes the investment and reverses its purchase entries from account balances. This cannot be undone. Investments with later sales, dividends, reinvestments, or confirmed coupons cannot be deleted."
          confirmLabel={deleting ? "Deleting..." : "Delete investment"}
          destructive
          onConfirm={() => void deleteInvestment()}
          onClose={() => setDeleteOpen(false)}
        />

        <FormDialog
          open={editOpen}
          title={`Edit ${asset.name}`}
          description="Correct the investment name or ticker. Currency stays fixed so existing purchase history remains consistent."
          submitLabel="Save changes"
          pending={savingAction}
          error={actionError || undefined}
          onSubmit={saveInvestment}
          onClose={() => {
            setEditOpen(false);
            setActionError("");
          }}
        >
          <div className="grid gap-4">
            {asset.assetClass !== "bond" ? (
              <div className="field">
                <label htmlFor="edit-listed-stock">LuSE-listed stock (optional)</label>
                <select
                  id="edit-listed-stock"
                  value={stockDirectory?.stocks.some((stock) => stock.ticker === editForm.symbol) ? editForm.symbol : ""}
                  onChange={(event) => {
                    const stock = stockDirectory?.stocks.find((item) => item.ticker === event.target.value);
                    if (stock) setEditForm({ name: stock.name, symbol: stock.ticker });
                  }}
                >
                  <option value="">Select a listed stock or edit manually</option>
                  {(stockDirectory?.stocks ?? []).map((stock) => (
                    <option key={stock.ticker} value={stock.ticker}>
                      {stock.ticker} — {stock.name}
                    </option>
                  ))}
                </select>
                {stockDirectory ? (
                  <span className="muted">Listings by <a href={stockDirectory.sourceUrl} target="_blank" rel="noreferrer">{stockDirectory.sourceName}</a>.</span>
                ) : null}
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="edit-investment-name">Investment name</label>
              <input
                id="edit-investment-name"
                value={editForm.name}
                onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="edit-investment-symbol">{asset.assetClass === "bond" ? "Bond code (optional)" : "Ticker symbol (optional)"}</label>
              <input
                id="edit-investment-symbol"
                value={editForm.symbol}
                onChange={(event) => setEditForm((current) => ({ ...current, symbol: event.target.value.toUpperCase() }))}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-investment-currency">Currency</label>
              <input id="edit-investment-currency" value={asset.currency} readOnly />
            </div>
          </div>
        </FormDialog>

        <FormDialog
          open={equityDialog === "dividend"}
          title="Record a dividend"
          description={`Add a payment you received from ${asset.name}.`}
          submitLabel="Save dividend"
          pending={savingAction}
          error={actionError || undefined}
          onSubmit={submitDividend}
          onClose={() => setEquityDialog(null)}
        >
          <div className="grid gap-4">
            {dividendHistoricalBackfill ? (
              <div className="field">
                <label htmlFor="dividend-disposition">What happened to the payment?</label>
                <select
                  id="dividend-disposition"
                  value={dividendForm.disposition}
                  onChange={(event) =>
                    setDividendForm((current) => ({ ...current, disposition: event.target.value }))
                  }
                >
                  <option value="cash">Taken as cash</option>
                  <option value="drip">Reinvested to buy more shares</option>
                </select>
              </div>
            ) : (
              <p className="muted">
                The dividend is paid into your account. If you reinvest it, record that purchase
                separately so it carries the price and date you actually paid.
              </p>
            )}
            <div className="splitFields">
              <div className="field">
                <label htmlFor="dividend-amount">Dividend amount ({asset.currency})</label>
                <input
                  id="dividend-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={dividendForm.amount}
                  onChange={(event) =>
                    setDividendForm((current) => ({ ...current, amount: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="dividend-execution-date">Date received</label>
                <input
                  id="dividend-execution-date"
                  type="date"
                  value={dividendForm.executionDate}
                  onChange={(event) =>
                    setDividendForm((current) => ({ ...current, executionDate: event.target.value }))
                  }
                  required
                />
              </div>
            </div>
            {dividendHistoricalBackfill ? (
              <div className="rounded-md border border-outline bg-surface-soft p-4">
                <strong className="block text-sm text-on-surface">No account will be changed</strong>
                <span className="mt-1 block text-xs text-on-surface-soft">
                  The dividend remains in your investment history and reports only.
                </span>
              </div>
            ) : (
              <ActionAccountSelect
                inputId="dividend-cash-account"
                accounts={cashAccounts}
                value={dividendForm.cashAccountId}
                onChange={(value) =>
                  setDividendForm((current) => ({ ...current, cashAccountId: value }))
                }
              />
            )}
            {dividendHistoricalEligible ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-outline bg-surface-soft p-4">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={dividendForm.historicalBackfill}
                  onChange={(event) =>
                    setDividendForm((current) => ({ ...current, historicalBackfill: event.target.checked }))
                  }
                />
                <span>
                  <strong className="block text-sm text-on-surface">Record as a historical dividend</strong>
                  <span className="mt-1 block text-xs text-on-surface-soft">
                    Use this for a dividend received before tracking it here. It will not change an account balance.
                  </span>
                </span>
              </label>
            ) : null}
            {dividendHistoricalBackfill && dividendForm.disposition === "drip" ? (
              <div className="field">
                <label htmlFor="dividend-reinvestment-price">Share price when reinvested ({asset.currency})</label>
                <input
                  id="dividend-reinvestment-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={dividendForm.reinvestmentPrice}
                  onChange={(event) =>
                    setDividendForm((current) => ({
                      ...current,
                      reinvestmentPrice: event.target.value,
                    }))
                  }
                  required
                />
              </div>
            ) : null}
          </div>
        </FormDialog>

        <FormDialog
          open={equityDialog === "sell"}
          title="Record a sale"
          description={`Add shares of ${asset.name} that you sold.`}
          submitLabel="Save sale"
          pending={savingAction}
          error={actionError || undefined}
          onSubmit={submitSell}
          onClose={() => setEquityDialog(null)}
        >
          <div className="grid gap-4">
            <ActionAccountSelect
              inputId="sell-cash-account"
              accounts={cashAccounts}
              value={sellForm.cashAccountId}
              onChange={(value) => setSellForm((current) => ({ ...current, cashAccountId: value }))}
            />
            <div className="splitFields">
              <div className="field">
                <label htmlFor="sell-quantity">Shares sold</label>
                <input
                  id="sell-quantity"
                  type="number"
                  min="0"
                  step="0.000001"
                  value={sellForm.quantity}
                  onChange={(event) =>
                    setSellForm((current) => ({ ...current, quantity: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="sell-unit-price">Price per share ({asset.currency})</label>
                <input
                  id="sell-unit-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={sellForm.unitPrice}
                  onChange={(event) =>
                    setSellForm((current) => ({ ...current, unitPrice: event.target.value }))
                  }
                  required
                />
              </div>
            </div>
            <div className="splitFields">
              <div className="field">
                <label htmlFor="sell-fees">Fees ({asset.currency})</label>
                <input
                  id="sell-fees"
                  type="number"
                  min="0"
                  step="0.01"
                  value={sellForm.fees}
                  onChange={(event) =>
                    setSellForm((current) => ({ ...current, fees: event.target.value }))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="sell-execution-date">Date sold</label>
                <input
                  id="sell-execution-date"
                  type="date"
                  value={sellForm.executionDate}
                  onChange={(event) =>
                    setSellForm((current) => ({ ...current, executionDate: event.target.value }))
                  }
                  required
                />
              </div>
            </div>
          </div>
        </FormDialog>

        <FormDialog
          open={equityDialog === "value"}
          title="Update current value"
          description={`Enter what your ${asset.name} holding is worth on this date.`}
          submitLabel="Update value"
          pending={savingAction}
          error={actionError || undefined}
          onSubmit={submitValuation}
          onClose={() => setEquityDialog(null)}
        >
          <div className="grid gap-4">
            <div className="marketPriceLookup">
              <div>
                <strong>Use the latest LuSE price</strong>
                <p>
                  We’ll multiply the latest {luseTicker || "LuSE"} share price by your{" "}
                  {holding?.quantity.toFixed(4) ?? "0"} shares.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={loadingMarketQuote || !holding || holding.quantity <= 0}
                onClick={() => void loadMarketQuote()}
              >
                {loadingMarketQuote ? "Checking price…" : "Get market price"}
              </button>
            </div>

            {marketQuote ? (
              <div className="marketQuoteResult" role="status">
                <div>
                  <span>{marketQuote.ticker} closing price</span>
                  <strong>{formatMoney(marketQuote.priceMinor, marketQuote.currency)}</strong>
                </div>
                <div>
                  <span>Estimated holding value</span>
                  <strong>
                    {formatMoney(
                      Math.round(marketQuote.priceMinor * (holding?.quantity ?? 0)),
                      marketQuote.currency,
                    )}
                  </strong>
                </div>
                <p>
                  Market date{" "}
                  {new Date(`${marketQuote.marketDate}T00:00:00`).toLocaleDateString()} ·{" "}
                  <a href={marketQuote.sourceUrl} target="_blank" rel="noreferrer">
                    {marketQuote.sourceName}
                  </a>
                </p>
              </div>
            ) : null}

            {marketQuoteError ? <p className="marketQuoteError" role="alert">{marketQuoteError}</p> : null}

            <div className="field">
              <label htmlFor="valuation-current-value">Current value ({asset.currency})</label>
              <input
                id="valuation-current-value"
                type="number"
                min="0"
                step="0.01"
                value={valuationForm.currentValue}
                onChange={(event) =>
                  setValuationForm((current) => ({ ...current, currentValue: event.target.value }))
                }
                required
              />
            </div>
            <div className="field">
              <label htmlFor="valuation-date">Value on</label>
              <input
                id="valuation-date"
                type="date"
                value={valuationForm.valuationDate}
                onChange={(event) =>
                  setValuationForm((current) => ({ ...current, valuationDate: event.target.value }))
                }
                required
              />
            </div>
          </div>
        </FormDialog>

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
              {couponHistoricalBackfill ? (
                <div className="rounded-md border border-outline bg-surface-soft p-4">
                  <strong className="block text-sm text-on-surface">No account will be changed</strong>
                  <span className="mt-1 block text-xs text-on-surface-soft">The coupon remains in bond history and reports only.</span>
                </div>
              ) : (
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
              )}
            </div>

            {couponHistoricalEligible ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-outline bg-surface-soft p-4">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={couponForm.historicalBackfill}
                  onChange={(event) =>
                    setCouponForm((current) => ({ ...current, historicalBackfill: event.target.checked }))
                  }
                />
                <span>
                  <strong className="block text-sm text-on-surface">Record as a historical coupon</strong>
                  <span className="mt-1 block text-xs text-on-surface-soft">
                    Use this for a coupon received before tracking it here. It will not change an account balance.
                  </span>
                </span>
              </label>
            ) : null}

            {couponHistoricalBackfill ? (
              <div className="field">
                <label htmlFor="coupon-destination">Use net coupon for</label>
                <select
                  id="coupon-destination"
                  value={couponForm.destination}
                  onChange={(event) =>
                    setCouponForm((current) => ({ ...current, destination: event.target.value }))
                  }
                >
                  <option value="cash">Taken as cash</option>
                  <option value="stock" disabled={destinationStocks.length === 0}>
                    Bought an existing stock
                  </option>
                </select>
                {destinationStocks.length === 0 ? (
                  <span className="muted">Add a stock in {asset.currency} before recording a reinvestment.</span>
                ) : null}
              </div>
            ) : (
              <p className="muted">
                The net coupon is paid into the settlement account. If you reinvest it, record that
                purchase from <Link href="/investments/add">Add investment</Link> once the money has
                arrived, so it carries the price and date you actually paid.
              </p>
            )}

            {couponHistoricalBackfill && couponForm.destination === "stock" ? (
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
          <Link href="/investments" className="btn btn-ghost">
            Back
          </Link>
        </div>
      </section>
    </PageShell>
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
      <label htmlFor={inputId}>Account receiving the money</label>
      <select id={inputId} value={value} onChange={(event) => onChange(event.target.value)} required>
        <option value="">Select account</option>
        {accounts
          .filter(isSpendableAccount)
          .map((account) => (
            <option key={account.id} value={account.id}>
              {[account.name, account.accountType?.replaceAll("_", " "), account.currency].filter(Boolean).join(" · ")}
            </option>
          ))}
      </select>
    </div>
  );
}
