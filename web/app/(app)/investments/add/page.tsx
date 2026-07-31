"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  PageHeader,
  PageShell,
} from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { supportedCurrencies } from "@/lib/currencies";
import { addYearsToDate, isPastDate } from "@/lib/date-terms";
import { formatMoney } from "@/lib/format-money";
import { useUserCurrency } from "@/lib/use-user-currency";

type InvestmentKind = "stock" | "bond";

type Account = {
  id: string;
  name: string;
  accountClass: string;
  currency: string;
};

type InvestmentType = {
  id: string;
  name: string;
  code: string;
};

type Asset = {
  id: string;
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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [investmentTypes, setInvestmentTypes] = useState<InvestmentType[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    symbol: "",
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
  });

  const usableAccounts = useMemo(
    () => accounts.filter((account) => account.accountClass !== "liability" && account.currency === form.currency),
    [accounts, form.currency]
  );
  const historicalDate = kind === "stock" ? form.purchaseDate : form.issueDate;
  const historicalEligible = isPastDate(historicalDate, today());
  const historicalBackfill = historicalEligible && form.historicalBackfill;
  const accountRequired = kind === "bond" || !historicalBackfill;

  useEffect(() => {
    if (!historicalEligible && form.historicalBackfill) {
      setForm((current) => ({ ...current, historicalBackfill: false }));
    }
  }, [form.historicalBackfill, historicalEligible]);

  useEffect(() => {
    let ignore = false;
    void Promise.all([
      apiCall<Account[]>("/v1/accounts"),
      apiCall<InvestmentType[]>("/v1/investment-types"),
    ])
      .then(([nextAccounts, nextTypes]) => {
        if (ignore) return;
        const availableAccounts = (nextAccounts ?? []).filter((account) => account.accountClass !== "liability");
        setAccounts(nextAccounts ?? []);
        setInvestmentTypes(nextTypes ?? []);
        setForm((current) => ({
          ...current,
          accountId: current.accountId || availableAccounts[0]?.id || "",
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
        (account) => account.id === current.accountId && account.accountClass !== "liability" && account.currency === current.currency
      );
      if (accountStillMatches) return current;
      const matchingAccount = accounts.find(
        (account) => account.accountClass !== "liability" && account.currency === current.currency
      );
      return { ...current, accountId: matchingAccount?.id ?? "" };
    });
  }, [accounts, form.currency]);

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

    try {
      await apiCall("/v1/transactions", {
        method: "POST",
        body: {
          transactionDate: form.purchaseDate,
          entryKind: "investment_buy",
          amount: Math.round(quantity * unitPriceMinor) + feesMinor,
          currency: form.currency,
          accountId: historicalBackfill ? undefined : form.accountId,
          assetId: asset.id,
          quantity,
          unitPrice: unitPriceMinor,
          fees: feesMinor || undefined,
          note: form.note.trim() || undefined,
          source: "manual",
          historicalBackfill: historicalBackfill || undefined,
        },
      });
    } catch (caught) {
      await apiCall(`/v1/assets/${asset.id}`, { method: "DELETE" }).catch(() => undefined);
      throw caught;
    }
  }

  async function createBond() {
    const principalMinor = toMinor(form.principal);
    const purchaseFeeMinor = toMinor(form.bondFee);
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
        cashAccountId: form.accountId,
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
        <PageHeader title="Add investment" subtitle="Track a stock holding or a government bond in its original currency." />

        <div className="rangeSwitcher" role="tablist" aria-label="Investment type">
          <button type="button" className={kind === "stock" ? "rangeChip active" : "rangeChip"} onClick={() => setKind("stock")}>
            Stock
          </button>
          <button type="button" className={kind === "bond" ? "rangeChip active" : "rangeChip"} onClick={() => setKind("bond")}>
            Government bond
          </button>
        </div>

        <form className="card grid gap-4" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">{kind === "stock" ? "Company or fund name" : "Bond name"}</label>
            <input id="name" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder={kind === "stock" ? "e.g. ZCCM Investments Holdings" : "e.g. GRZ 15-year bond"} required />
          </div>

          <div className="splitFields">
            <div className="field">
              <label htmlFor="symbol">{kind === "stock" ? "Ticker symbol" : "Bond code (optional)"}</label>
              <input id="symbol" value={form.symbol} onChange={(event) => update("symbol", event.target.value.toUpperCase())} placeholder={kind === "stock" ? "e.g. ZCCM-IH" : "e.g. GRZ-BOND"} />
            </div>
            <div className="field">
              <label htmlFor="currency">Currency</label>
              <select id="currency" value={form.currency} onChange={(event) => update("currency", event.target.value)}>
                {supportedCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
              </select>
            </div>
          </div>

          {historicalBackfill && kind === "stock" ? (
            <div className="rounded-md border border-primary/30 bg-primary-softer p-4">
              <strong className="block text-sm text-on-surface">Funding account not required</strong>
              <span className="mt-1 block text-xs text-on-surface-soft">
                This historical holding will not reduce a cash-account balance.
              </span>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="accountId">
                {kind === "stock" ? "Paid from account" : "Coupon and maturity account"}
              </label>
              <select id="accountId" value={form.accountId} onChange={(event) => update("accountId", event.target.value)} required={accountRequired} disabled={loadingOptions || usableAccounts.length === 0}>
                <option value="">Select an account</option>
                {usableAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}
              </select>
              {historicalBackfill && kind === "bond" ? (
                <span className="muted">
                  Used for coupons and maturity only; the historical purchase is not deducted.
                </span>
              ) : null}
              {!loadingOptions && usableAccounts.length === 0 ? <span className="muted">No {form.currency} cash or bank account exists yet. <Link href="/settings/accounts">Create one in Settings</Link>.</span> : null}
            </div>
          )}

          {historicalEligible ? (
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

          {kind === "stock" ? (
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

          <button type="submit" className="btn btn-primary" disabled={saving || loadingOptions || (accountRequired && usableAccounts.length === 0)}>
            {saving ? "Saving..." : kind === "stock" ? "Add stock holding" : "Add government bond"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/investments" className="btn btn-ghost">Back to portfolio</Link>
        </div>
      </section>
    </PageShell>
  );
}
