"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
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

function oneYearFromToday() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().split("T")[0];
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
    maturityDate: oneYearFromToday(),
    couponFrequency: "2",
    reinvestmentCutoffDate: oneYearFromToday(),
    note: "",
  });

  const usableAccounts = useMemo(
    () => accounts.filter((account) => account.accountClass !== "liability" && account.currency === form.currency),
    [accounts, form.currency]
  );

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

  function update(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
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
          accountId: form.accountId,
          assetId: asset.id,
          quantity,
          unitPrice: unitPriceMinor,
          fees: feesMinor || undefined,
          note: form.note.trim() || undefined,
          source: "manual",
        },
      });
    } catch (caught) {
      await apiCall(`/v1/assets/${asset.id}`, { method: "DELETE" }).catch(() => undefined);
      throw caught;
    }
  }

  async function createBond() {
    const principalMinor = toMinor(form.principal);
    const couponRate = Number.parseFloat(form.couponRate);
    if (principalMinor <= 0 || !Number.isFinite(couponRate) || couponRate < 0) {
      throw new Error("Enter a principal greater than zero and a valid coupon rate.");
    }

    await apiCall("/v1/bonds", {
      method: "POST",
      body: {
        name: form.name,
        symbol: form.symbol.trim() || undefined,
        currency: form.currency,
        cashAccountId: form.accountId,
        principalMinor,
        couponRateBps: Math.round(couponRate * 100),
        issueDate: form.issueDate,
        maturityDate: form.maturityDate,
        couponFrequencyPerYear: Number.parseInt(form.couponFrequency, 10),
        reinvestmentCutoffDate: form.reinvestmentCutoffDate,
      },
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.accountId) {
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
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-6 pb-28 sm:px-8 lg:px-12 lg:py-10">
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

        <form className="grid gap-4 rounded-lg border border-outline bg-surface p-5 shadow-sm sm:p-6" onSubmit={handleSubmit}>
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
                {['ZMW', 'USD', 'GBP', 'EUR', 'ZAR'].map((currency) => <option key={currency} value={currency}>{currency}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="accountId">{kind === "stock" ? "Paid from account" : "Coupon and maturity account"}</label>
            <select id="accountId" value={form.accountId} onChange={(event) => update("accountId", event.target.value)} required disabled={loadingOptions || usableAccounts.length === 0}>
              <option value="">Select an account</option>
              {usableAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}
            </select>
            {!loadingOptions && usableAccounts.length === 0 ? <span className="muted">No {form.currency} cash or bank account exists yet. <Link href="/settings/accounts">Create one in Settings</Link>.</span> : null}
          </div>

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
                  <input id="issueDate" type="date" value={form.issueDate} onChange={(event) => update("issueDate", event.target.value)} required />
                </div>
                <div className="field">
                  <label htmlFor="maturityDate">Maturity date</label>
                  <input id="maturityDate" type="date" value={form.maturityDate} min={form.issueDate} onChange={(event) => update("maturityDate", event.target.value)} required />
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

          <button type="submit" className="primaryButton" disabled={saving || loadingOptions || usableAccounts.length === 0}>
            {saving ? "Saving..." : kind === "stock" ? "Add stock holding" : "Add government bond"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/investments" className="ghostButton">Back to portfolio</Link>
        </div>
      </section>
    </main>
  );
}
