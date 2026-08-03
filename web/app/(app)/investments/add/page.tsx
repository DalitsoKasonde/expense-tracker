"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Breadcrumbs,
  PageHeader,
  PageShell,
} from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { supportedCurrencies } from "@/lib/currencies";
import { addYearsToDate, isPastDate } from "@/lib/date-terms";
import { formatMoney } from "@/lib/format-money";
import type { MarketStockDirectory } from "@/lib/market-data";
import { isSpendableAccount, spendableAccounts } from "@/lib/spendable-accounts";
import { useUserCurrency } from "@/lib/use-user-currency";

type InvestmentKind = "stock" | "bond" | "group";
type StockMode = "existing" | "new";
type BondMode = "existing" | "new";

type Account = {
  id: string;
  name: string;
  accountClass: string;
  accountType?: string;
  currency: string;
  isSavingsGroupAccount?: boolean;
};

type InvestmentType = {
  id: string;
  name: string;
  code: string;
};

type Asset = {
  id: string;
  name: string;
  symbol?: string | null;
  assetClass: string;
  currency: string;
};

type BondPosition = {
  assetId: string;
  name: string;
  symbol?: string | null;
  currency: string;
  issueDate: string;
  maturityDate: string;
  couponRateBps: number;
};

function today() {
  return new Date().toISOString().split("T")[0];
}

function toMinor(value: string) {
  return Math.round((Number.parseFloat(value || "0") || 0) * 100);
}

export default function AddInvestmentPage() {
  const apiCall = useApiCall();
  const router = useRouter();
  const { currency: userCurrency } = useUserCurrency();
  const [kind, setKind] = useState<InvestmentKind>("stock");
  const [stockMode, setStockMode] = useState<StockMode>("existing");
  const [bondMode, setBondMode] = useState<BondMode>("new");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [bonds, setBonds] = useState<BondPosition[]>([]);
  const [investmentTypes, setInvestmentTypes] = useState<InvestmentType[]>([]);
  const [stockDirectory, setStockDirectory] = useState<MarketStockDirectory | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    symbol: "",
    assetId: "",
    bondAssetId: "",
    currency: userCurrency,
    accountId: "",
    quantity: "",
    unitPrice: "",
    fees: "0",
    purchaseDate: today(),
    principal: "",
    couponRate: "",
    issueDate: today(),
    termYears: "1",
    maturityDate: addYearsToDate(today(), 1),
    bondFee: "0",
    couponFrequency: "2",
    reinvestmentCutoffDate: addYearsToDate(today(), 1),
    note: "",
    historicalBackfill: false,
    cycleStart: today(),
    cycleLengthMonths: "12",
    target: "",
    openingContribution: "0",
    isShareoutGroup: true,
  });

  const usableAccounts = useMemo(
    () => spendableAccounts(accounts).filter((account) => account.currency === form.currency),
    [accounts, form.currency]
  );
  const stockAssets = useMemo(
    () => assets.filter((asset) => asset.assetClass !== "bond"),
    [assets],
  );
  const selectedStock = stockAssets.find((asset) => asset.id === form.assetId);
  const selectedBond = bonds.find((bond) => bond.assetId === form.bondAssetId);
  // A savings group opens its own savings account and is funded by transfers
  // afterwards, so it has no purchase, no funding account, and no backfill flag.
  const isSavingsGroup = kind === "group";
  const historicalDate = kind === "stock" || bondMode === "existing" ? form.purchaseDate : form.issueDate;
  const historicalEligible = !isSavingsGroup && isPastDate(historicalDate, today());
  const historicalBackfill = historicalEligible && form.historicalBackfill;
  const accountRequired = !historicalBackfill && !isSavingsGroup;

  useEffect(() => {
    if (!historicalEligible && form.historicalBackfill) {
      setForm((current) => ({ ...current, historicalBackfill: false }));
    }
  }, [form.historicalBackfill, historicalEligible]);

  useEffect(() => {
    let ignore = false;
    void apiCall<MarketStockDirectory>("/v1/market-data/luse")
      .then((directory) => {
        if (!ignore) setStockDirectory(directory ?? null);
      })
      .catch(() => {
        // Manual stock entry remains available when market data is offline.
      });
    void Promise.all([
      apiCall<Account[]>("/v1/accounts"),
      apiCall<InvestmentType[]>("/v1/investment-types"),
      apiCall<Asset[]>("/v1/assets"),
      apiCall<BondPosition[]>("/v1/bonds").catch(() => []),
    ])
      .then(([nextAccounts, nextTypes, nextAssets, nextBonds]) => {
        if (ignore) return;
        const availableAccounts = spendableAccounts(nextAccounts ?? []);
        const availableStocks = (nextAssets ?? []).filter((asset) => asset.assetClass !== "bond");
        setAccounts(nextAccounts ?? []);
        setInvestmentTypes(nextTypes ?? []);
        setAssets(nextAssets ?? []);
        setBonds(nextBonds ?? []);
        setForm((current) => ({
          ...current,
          accountId: current.accountId || availableAccounts[0]?.id || "",
          assetId: current.assetId || availableStocks[0]?.id || "",
          bondAssetId: current.bondAssetId || nextBonds?.[0]?.assetId || "",
          currency: availableStocks[0]?.currency || current.currency,
        }));
      })
      .catch((caught) => {
        if (!ignore) setError(caught instanceof Error ? caught.message : "Failed to load investment options");
      })
      .finally(() => {
        if (!ignore) setLoadingOptions(false);
      });
    return () => {
      ignore = true;
    };
  }, [apiCall]);

  useEffect(() => {
    setForm((current) => (current.currency === userCurrency ? current : { ...current, currency: userCurrency }));
  }, [userCurrency]);

  useEffect(() => {
    setForm((current) => {
      const accountStillMatches = accounts.some(
        (account) => account.id === current.accountId && isSpendableAccount(account) && account.currency === current.currency
      );
      if (accountStillMatches) return current;
      const matchingAccount = accounts.find(
        (account) => isSpendableAccount(account) && account.currency === current.currency
      );
      return { ...current, accountId: matchingAccount?.id ?? "" };
    });
  }, [accounts, form.currency]);

  useEffect(() => {
    if (kind !== "stock" || stockMode !== "existing" || !selectedStock) return;
    setForm((current) =>
      current.currency === selectedStock.currency
        ? current
        : { ...current, currency: selectedStock.currency },
    );
  }, [kind, selectedStock, stockMode]);

  useEffect(() => {
    if (kind !== "bond" || bondMode !== "existing" || !selectedBond) return;
    setForm((current) =>
      current.currency === selectedBond.currency
        ? current
        : { ...current, currency: selectedBond.currency },
    );
  }, [bondMode, kind, selectedBond]);

  function update<K extends keyof typeof form>(name: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateBondIssueDate(issueDate: string) {
    setForm((current) => {
      const maturityDate = addYearsToDate(issueDate, Number.parseInt(current.termYears, 10));
      const cutoffFollowedMaturity = current.reinvestmentCutoffDate === current.maturityDate;
      return {
        ...current,
        issueDate,
        maturityDate,
        reinvestmentCutoffDate: cutoffFollowedMaturity ? maturityDate : current.reinvestmentCutoffDate,
      };
    });
  }

  function updateBondTerm(termYears: string) {
    setForm((current) => {
      const maturityDate = addYearsToDate(current.issueDate, Number.parseInt(termYears, 10));
      const cutoffFollowedMaturity = current.reinvestmentCutoffDate === current.maturityDate;
      return {
        ...current,
        termYears,
        maturityDate,
        reinvestmentCutoffDate: cutoffFollowedMaturity ? maturityDate : current.reinvestmentCutoffDate,
      };
    });
  }

  async function ensureStockType() {
    const existing = investmentTypes.find(
      (investmentType) => investmentType.code === "stock" || investmentType.name.toLowerCase() === "stock"
    );
    if (existing) return existing;

    const created = await apiCall<InvestmentType>("/v1/investment-types", {
      method: "POST",
      body: { name: "Stock" },
    });
    if (!created) throw new Error("Could not create the stock investment type");
    setInvestmentTypes((current) => [...current, created]);
    return created;
  }

  async function createStock() {
    const quantity = Number.parseFloat(form.quantity);
    const unitPriceMinor = toMinor(form.unitPrice);
    const feesMinor = toMinor(form.fees);
    if (!Number.isFinite(quantity) || quantity <= 0 || unitPriceMinor <= 0) {
      throw new Error("Enter a quantity and unit price greater than zero.");
    }

    let assetId = form.assetId;
    let createdAssetId = "";
    if (stockMode === "existing") {
      if (!assetId) throw new Error("Select an existing stock.");
    } else {
      const stockType = await ensureStockType();
      const asset = await apiCall<Asset>("/v1/assets", {
        method: "POST",
        body: {
          investmentTypeId: stockType.id,
          assetClass: "stock",
          name: form.name,
          symbol: form.symbol.trim() || undefined,
          currency: form.currency,
        },
      });
      if (!asset) throw new Error("Could not create the stock");
      assetId = asset.id;
      createdAssetId = asset.id;
    }

    try {
      await apiCall("/v1/transactions", {
        method: "POST",
        body: {
          transactionDate: form.purchaseDate,
          entryKind: "investment_buy",
          amount: Math.round(quantity * unitPriceMinor) + feesMinor,
          currency: form.currency,
          accountId: historicalBackfill ? undefined : form.accountId,
          assetId,
          quantity,
          unitPrice: unitPriceMinor,
          fees: feesMinor || undefined,
          note: form.note.trim() || undefined,
          source: "manual",
          historicalBackfill: historicalBackfill || undefined,
        },
      });
    } catch (caught) {
      if (createdAssetId) {
        await apiCall(`/v1/assets/${createdAssetId}`, { method: "DELETE" }).catch(() => undefined);
      }
      throw caught;
    }
  }

  async function createBond() {
    const principalMinor = toMinor(form.principal);
    const purchaseFeeMinor = toMinor(form.bondFee);
    if (bondMode === "existing") {
      if (!form.bondAssetId) throw new Error("Select an existing government bond.");
      if (principalMinor <= 0 || purchaseFeeMinor < 0) {
        throw new Error("Enter a principal greater than zero and a non-negative fee.");
      }
      await apiCall(`/v1/bonds/${form.bondAssetId}/purchases`, {
        method: "POST",
        body: {
          cashAccountId: historicalBackfill ? undefined : form.accountId,
          principalMinor,
          purchaseFeeMinor,
          purchaseDate: form.purchaseDate,
          note: form.note.trim() || undefined,
          historicalBackfill: historicalBackfill || undefined,
        },
      });
      return;
    }

    const couponRate = Number.parseFloat(form.couponRate);
    const termYears = Number.parseInt(form.termYears, 10);
    if (principalMinor <= 0 || purchaseFeeMinor < 0 || !Number.isFinite(couponRate) || couponRate < 0) {
      throw new Error("Enter a principal greater than zero, a non-negative fee, and a valid coupon rate.");
    }
    if (!Number.isInteger(termYears) || termYears <= 0 || !form.maturityDate) {
      throw new Error("Enter a whole-number bond term greater than zero.");
    }

    await apiCall("/v1/bonds", {
      method: "POST",
      body: {
        name: form.name,
        symbol: form.symbol.trim() || undefined,
        currency: form.currency,
        cashAccountId: historicalBackfill ? undefined : form.accountId,
        principalMinor,
        purchaseFeeMinor,
        couponRateBps: Math.round(couponRate * 100),
        issueDate: form.issueDate,
        maturityDate: form.maturityDate,
        couponFrequencyPerYear: Number.parseInt(form.couponFrequency, 10),
        reinvestmentCutoffDate: form.reinvestmentCutoffDate,
        historicalBackfill: historicalBackfill || undefined,
      },
    });
  }

  async function createSavingsGroup() {
    const name = form.name.trim();
    if (!name) throw new Error("Enter a name for the savings group.");
    const cycleLengthMonths = Number.parseInt(form.cycleLengthMonths, 10);
    if (!Number.isInteger(cycleLengthMonths) || cycleLengthMonths <= 0) {
      throw new Error("Enter a cycle length of at least one month.");
    }
    const targetMinor = toMinor(form.target);
    const openingContributionMinor = toMinor(form.openingContribution);
    if (openingContributionMinor < 0) {
      throw new Error("Contributions so far cannot be negative.");
    }

    await apiCall("/v1/savings-groups", {
      method: "POST",
      body: {
        name,
        currency: form.currency,
        isShareoutGroup: form.isShareoutGroup,
        cycleStart: form.cycleStart,
        cycleLengthMonths,
        targetMinor: targetMinor > 0 ? targetMinor : undefined,
        openingContributionMinor,
      },
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (accountRequired && !form.accountId) {
      setError("Create a cash or bank account before adding an investment.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (kind === "stock") await createStock();
      else if (kind === "group") await createSavingsGroup();
      else await createBond();
      router.push("/investments");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to add investment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell width="narrow">
      <section className="grid gap-6">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/today" },
            { label: "Portfolio", href: "/investments" },
            { label: "Add investment" },
          ]}
        />
        <PageHeader
          title="Add investment"
          subtitle="Track a stock holding, a government bond, or a savings group in its own currency."
        />

        <div className="rangeSwitcher" role="tablist" aria-label="Investment type">
          <button type="button" className={kind === "stock" ? "rangeChip active" : "rangeChip"} onClick={() => setKind("stock")}>
            Stock
          </button>
          <button type="button" className={kind === "bond" ? "rangeChip active" : "rangeChip"} onClick={() => setKind("bond")}>
            Government bond
          </button>
          <button type="button" className={kind === "group" ? "rangeChip active" : "rangeChip"} onClick={() => setKind("group")}>
            Savings group
          </button>
        </div>

        <form className="card grid gap-4" onSubmit={handleSubmit}>
          {kind === "stock" ? (
            <div className="entryTypeGrid" aria-label="Stock purchase type">
              <button
                type="button"
                className={stockMode === "new" ? "entryTypeButton active" : "entryTypeButton"}
                onClick={() => setStockMode("new")}
              >
                New stock
              </button>
              <button
                type="button"
                className={stockMode === "existing" ? "entryTypeButton active" : "entryTypeButton"}
                onClick={() => setStockMode("existing")}
              >
                Existing stock
              </button>
            </div>
          ) : null}
          {kind === "bond" ? (
            <div className="entryTypeGrid" aria-label="Government bond purchase type">
              <button type="button" className={bondMode === "new" ? "entryTypeButton active" : "entryTypeButton"} onClick={() => setBondMode("new")}>
                New bond
              </button>
              <button type="button" className={bondMode === "existing" ? "entryTypeButton active" : "entryTypeButton"} onClick={() => setBondMode("existing")}>
                Existing bond
              </button>
            </div>
          ) : null}

          {kind === "stock" && stockMode === "existing" ? (
            <div className="field">
              <label htmlFor="assetId">Stock</label>
              <select
                id="assetId"
                value={form.assetId}
                onChange={(event) => update("assetId", event.target.value)}
                required
                disabled={loadingOptions || stockAssets.length === 0}
              >
                <option value="">Select stock</option>
                {stockAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}{asset.symbol ? ` (${asset.symbol})` : ""} · {asset.currency}
                  </option>
                ))}
              </select>
              {!loadingOptions && stockAssets.length === 0 ? (
                <span className="muted">No stocks exist yet. Choose New stock to create your first holding.</span>
              ) : (
                <span className="muted">This purchase will be added as a new lot under the selected holding.</span>
              )}
            </div>
          ) : kind === "bond" && bondMode === "existing" ? (
            <div className="field">
              <label htmlFor="bondAssetId">Government bond</label>
              <select id="bondAssetId" value={form.bondAssetId} onChange={(event) => update("bondAssetId", event.target.value)} required disabled={loadingOptions || bonds.length === 0}>
                <option value="">Select bond</option>
                {bonds.map((bond) => (
                  <option key={bond.assetId} value={bond.assetId}>
                    {bond.name}{bond.symbol ? ` (${bond.symbol})` : ""} · matures {bond.maturityDate} · {bond.currency}
                  </option>
                ))}
              </select>
              {!loadingOptions && bonds.length === 0 ? (
                <span className="muted">No government bonds exist yet. Choose New bond to create your first holding.</span>
              ) : (
                <span className="muted">The additional principal will update this bond&apos;s future coupons and maturity value.</span>
              )}
            </div>
          ) : (
            <>
              {kind === "stock" ? (
                <div className="field">
                  <label htmlFor="listedStock">LuSE-listed stock (optional)</label>
                  <select
                    id="listedStock"
                    value={stockDirectory?.stocks.some((stock) => stock.ticker === form.symbol) ? form.symbol : ""}
                    onChange={(event) => {
                      const stock = stockDirectory?.stocks.find((item) => item.ticker === event.target.value);
                      if (!stock) return;
                      setForm((current) => ({
                        ...current,
                        name: stock.name,
                        symbol: stock.ticker,
                        currency: stock.currency,
                      }));
                    }}
                  >
                    <option value="">Select a listed stock or enter it manually</option>
                    {(stockDirectory?.stocks ?? []).map((stock) => (
                      <option key={stock.ticker} value={stock.ticker}>
                        {stock.ticker} — {stock.name}
                      </option>
                    ))}
                  </select>
                  {stockDirectory ? (
                    <span className="muted">
                      Listings by <a href={stockDirectory.sourceUrl} target="_blank" rel="noreferrer">{stockDirectory.sourceName}</a>. Selecting one fills the name, ticker, and currency.
                    </span>
                  ) : (
                    <span className="muted">Enter the company and ticker manually if the directory is unavailable.</span>
                  )}
                </div>
              ) : null}
              <div className="field">
                <label htmlFor="name">
                  {kind === "stock"
                    ? "Company or fund name"
                    : kind === "group"
                      ? "Savings group name"
                      : "Bond name"}
                </label>
                <input
                  id="name"
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                  placeholder={
                    kind === "stock"
                      ? "e.g. ZCCM Investments Holdings"
                      : kind === "group"
                        ? "e.g. Month-end chilimba"
                        : "e.g. GRZ 15-year bond"
                  }
                  required
                />
              </div>
            </>
          )}

          <div className="splitFields">
            {(kind === "stock" && stockMode === "new") || (kind === "bond" && bondMode === "new") ? (
              <div className="field">
                <label htmlFor="symbol">{kind === "stock" ? "Ticker symbol (optional)" : "Bond code (optional)"}</label>
                <input id="symbol" value={form.symbol} onChange={(event) => update("symbol", event.target.value.toUpperCase())} placeholder={kind === "stock" ? "e.g. ZCCM-IH" : "e.g. GRZ-BOND"} />
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="currency">Currency</label>
              <select id="currency" value={form.currency} onChange={(event) => update("currency", event.target.value)} disabled={(kind === "stock" && stockMode === "existing") || (kind === "bond" && bondMode === "existing")}>
                {supportedCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
              </select>
              {(kind === "stock" && stockMode === "existing") || (kind === "bond" && bondMode === "existing") ? (
                <span className="muted">Uses the selected {kind === "stock" ? "stock" : "bond"}&apos;s currency.</span>
              ) : null}
            </div>
          </div>

          {isSavingsGroup ? (
            <div className="rounded-md border border-primary/30 bg-primary-softer p-4">
              <strong className="block text-sm text-on-surface">Its own savings account</strong>
              <span className="mt-1 block text-xs text-on-surface-soft">
                Creating the group opens a savings account in its name. Fund it afterwards by
                transferring money into that account, and each transfer counts as a contribution.
              </span>
            </div>
          ) : historicalBackfill ? (
            <div className="rounded-md border border-primary/30 bg-primary-softer p-4">
              <strong className="block text-sm text-on-surface">Funding account not required</strong>
              <span className="mt-1 block text-xs text-on-surface-soft">
                {kind === "bond" && bondMode === "new"
                  ? "This historical bond will not reduce a cash-account balance. Coupons and maturity stay projected until you confirm one against an account."
                  : "This historical holding will not reduce a cash-account balance."}
              </span>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="accountId">
                {kind === "stock" || bondMode === "existing" ? "Paid from account" : "Coupon and maturity account"}
              </label>
              <select id="accountId" value={form.accountId} onChange={(event) => update("accountId", event.target.value)} required={accountRequired} disabled={loadingOptions || usableAccounts.length === 0}>
                <option value="">Select an account</option>
                {usableAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}
              </select>
              {!loadingOptions && usableAccounts.length === 0 ? <span className="muted">No {form.currency} cash or bank account exists yet. <Link href="/settings/accounts">Create one in Settings</Link>.</span> : null}
            </div>
          )}

          {historicalEligible && !isSavingsGroup ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-outline bg-surface-soft p-4">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                checked={form.historicalBackfill}
                onChange={(event) => update("historicalBackfill", event.target.checked)}
              />
              <span>
                <strong className="block text-sm text-on-surface">
                  Record as historical without a funding account
                </strong>
                <span className="mt-1 block text-xs text-on-surface-soft">
                  Available only before today. The holding is recorded without changing the source-account balance.
                </span>
              </span>
            </label>
          ) : null}

          {isSavingsGroup ? (
            <>
              <div className="splitFields items-start">
                <div className="field">
                  <label htmlFor="cycleStart">Cycle start</label>
                  <input
                    id="cycleStart"
                    type="date"
                    value={form.cycleStart}
                    onChange={(event) => update("cycleStart", event.target.value)}
                    required
                  />
                  <span className="muted">Contributions are counted from this date.</span>
                </div>
                <div className="field">
                  <label htmlFor="cycleLengthMonths">Cycle length (months)</label>
                  <input
                    id="cycleLengthMonths"
                    type="number"
                    min="1"
                    step="1"
                    value={form.cycleLengthMonths}
                    onChange={(event) => update("cycleLengthMonths", event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="splitFields items-start">
                <div className="field">
                  <label htmlFor="target">Target ({form.currency}, optional)</label>
                  <input
                    id="target"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.target}
                    onChange={(event) => update("target", event.target.value)}
                  />
                  <span className="muted">Leave blank if the group has no set goal.</span>
                </div>
                <div className="field">
                  <label htmlFor="openingContribution">Contributed so far ({form.currency})</label>
                  <input
                    id="openingContribution"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.openingContribution}
                    onChange={(event) => update("openingContribution", event.target.value)}
                  />
                  <span className="muted">
                    What you had already put in before tracking it here. Recorded as historical, so
                    it does not come out of any account.
                  </span>
                </div>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-outline bg-surface-soft p-4">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={form.isShareoutGroup}
                  onChange={(event) => update("isShareoutGroup", event.target.checked)}
                />
                <span>
                  <strong className="block text-sm text-on-surface">
                    Pays out at the end of a cycle
                  </strong>
                  <span className="mt-1 block text-xs text-on-surface-soft">
                    Chilimba and similar groups share out the pot at the end of each cycle. Leave
                    unticked for a group you simply save into.
                  </span>
                </span>
              </label>
            </>
          ) : kind === "stock" ? (
            <>
              <div className="splitFields">
                <div className="field">
                  <label htmlFor="quantity">Shares purchased</label>
                  <input id="quantity" type="number" min="0" step="0.000001" value={form.quantity} onChange={(event) => update("quantity", event.target.value)} required />
                </div>
                <div className="field">
                  <label htmlFor="unitPrice">Price per share ({form.currency})</label>
                  <input id="unitPrice" type="number" min="0" step="0.01" value={form.unitPrice} onChange={(event) => update("unitPrice", event.target.value)} required />
                </div>
              </div>
              <div className="splitFields">
                <div className="field">
                  <label htmlFor="fees">Broker fees ({form.currency})</label>
                  <input id="fees" type="number" min="0" step="0.01" value={form.fees} onChange={(event) => update("fees", event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="purchaseDate">Purchase date</label>
                  <input id="purchaseDate" type="date" value={form.purchaseDate} onChange={(event) => update("purchaseDate", event.target.value)} required />
                </div>
              </div>
              <div className="field">
                <label htmlFor="note">Note (optional)</label>
                <input id="note" value={form.note} onChange={(event) => update("note", event.target.value)} placeholder="Broker, order reference, or context" />
              </div>
            </>
          ) : bondMode === "existing" ? (
            <>
              <div className="splitFields">
                <div className="field">
                  <label htmlFor="principal">Additional principal ({form.currency})</label>
                  <input id="principal" type="number" min="0" step="0.01" value={form.principal} onChange={(event) => update("principal", event.target.value)} required />
                </div>
                <div className="field">
                  <label htmlFor="bondFee">Purchase charge / fee ({form.currency})</label>
                  <input id="bondFee" type="number" min="0" step="0.01" value={form.bondFee} onChange={(event) => update("bondFee", event.target.value)} />
                  <span className="muted">Total deducted: {formatMoney(toMinor(form.principal) + toMinor(form.bondFee), form.currency)}</span>
                </div>
              </div>
              <div className="field">
                <label htmlFor="purchaseDate">Purchase date</label>
                <input id="purchaseDate" type="date" value={form.purchaseDate} onChange={(event) => update("purchaseDate", event.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="note">Note (optional)</label>
                <input id="note" value={form.note} onChange={(event) => update("note", event.target.value)} placeholder="Broker, auction, order reference, or context" />
              </div>
            </>
          ) : (
            <>
              <div className="splitFields">
                <div className="field">
                  <label htmlFor="principal">Principal ({form.currency})</label>
                  <input id="principal" type="number" min="0" step="0.01" value={form.principal} onChange={(event) => update("principal", event.target.value)} required />
                </div>
                <div className="field">
                  <label htmlFor="couponRate">Annual coupon rate (%)</label>
                  <input id="couponRate" type="number" min="0" step="0.01" value={form.couponRate} onChange={(event) => update("couponRate", event.target.value)} required />
                </div>
              </div>
              <div className="splitFields">
                <div className="field">
                  <label htmlFor="issueDate">Issue date</label>
                  <input id="issueDate" type="date" value={form.issueDate} onChange={(event) => updateBondIssueDate(event.target.value)} required />
                </div>
                <div className="field">
                  <label htmlFor="termYears">Term (years)</label>
                  <input id="termYears" type="number" min="1" step="1" value={form.termYears} onChange={(event) => updateBondTerm(event.target.value)} required />
                </div>
              </div>
              <div className="splitFields">
                <div className="field">
                  <label htmlFor="maturityDate">Maturity date</label>
                  <input id="maturityDate" type="date" value={form.maturityDate} min={form.issueDate} readOnly required />
                  <span className="muted">Calculated from the issue date and term.</span>
                </div>
                <div className="field">
                  <label htmlFor="bondFee">Purchase charge / fee ({form.currency})</label>
                  <input id="bondFee" type="number" min="0" step="0.01" value={form.bondFee} onChange={(event) => update("bondFee", event.target.value)} />
                  <span className="muted">
                    Total deducted: {formatMoney(toMinor(form.principal) + toMinor(form.bondFee), form.currency)}
                  </span>
                </div>
              </div>
              <div className="splitFields">
                <div className="field">
                  <label htmlFor="couponFrequency">Coupon frequency</label>
                  <select id="couponFrequency" value={form.couponFrequency} onChange={(event) => update("couponFrequency", event.target.value)}>
                    <option value="1">Annually</option>
                    <option value="2">Semi-annually</option>
                    <option value="4">Quarterly</option>
                    <option value="12">Monthly</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="reinvestmentCutoffDate">Stop reinvesting coupons</label>
                  <input id="reinvestmentCutoffDate" type="date" value={form.reinvestmentCutoffDate} min={form.issueDate} max={form.maturityDate} onChange={(event) => update("reinvestmentCutoffDate", event.target.value)} required />
                </div>
              </div>
              <p className="muted">Coupons before the cutoff are projected as reinvested. Later coupons and the principal redemption flow to the selected account.</p>
            </>
          )}

          {error ? <p className="muted">{error}</p> : null}

          <button type="submit" className="btn btn-primary" disabled={saving || loadingOptions || (accountRequired && usableAccounts.length === 0) || (kind === "stock" && stockMode === "existing" && stockAssets.length === 0) || (kind === "bond" && bondMode === "existing" && bonds.length === 0)}>
            {saving
              ? "Saving..."
              : isSavingsGroup
                ? "Add savings group"
                : kind === "stock" && stockMode === "existing"
                  ? "Add purchase to stock"
                  : kind === "stock"
                    ? "Add stock holding"
                    : bondMode === "existing"
                      ? "Add purchase to bond"
                      : "Add government bond"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/investments" className="btn btn-ghost">Back to portfolio</Link>
        </div>
      </section>
    </PageShell>
  );
}
