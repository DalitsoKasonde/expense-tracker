"use client";

import { AppPageHeader } from "@/components/app-page-header";
import { AddIcon } from "@/components/nav-icons";
import { useApiCall } from "@/lib/client-api";
import { useSession } from "next-auth/react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type EntryKind =
  | "expense_living"
  | "income_earned"
  | "income_borrowed"
  | "debt_principal_payment"
  | "saving_transfer"
  | "investment_buy";

interface Account {
  id: string;
  name: string;
  accountType: string;
  accountClass: string;
  currency: string;
}

interface Category {
  id: string;
  name: string;
  categoryGroup: string;
  parentId: string | null;
}

interface IncomeSource {
  id: string;
  name: string;
  sourceType: string;
}

interface Business {
  id: string;
  name: string;
}

interface Asset {
  id: string;
  name: string;
  symbol?: string | null;
  assetClass: string;
}

interface LoanSummary {
  id: string;
  creditorName: string;
  totalRemainingBalance: number;
  remainingPrincipal: number;
}

interface UserPreferences {
  defaultCurrency: string;
}

const entryTypes: Array<{ value: EntryKind; label: string }> = [
  { value: "expense_living", label: "Expense" },
  { value: "income_earned", label: "Income" },
  { value: "income_borrowed", label: "Borrowed" },
  { value: "debt_principal_payment", label: "Debt payment" },
  { value: "saving_transfer", label: "Saving" },
  { value: "investment_buy", label: "Investment" },
];

function buildOrderedCategories(categories: Category[]) {
  const byParent = new Map<string | null, Category[]>();
  for (const category of categories) {
    const key = category.parentId ?? null;
    const bucket = byParent.get(key) ?? [];
    bucket.push(category);
    byParent.set(key, bucket);
  }

  for (const bucket of byParent.values()) {
    bucket.sort((left, right) => left.name.localeCompare(right.name));
  }

  const ordered: Array<Category & { depth: number }> = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const category of byParent.get(parentId) ?? []) {
      ordered.push({ ...category, depth });
      visit(category.id, depth + 1);
    }
  };

  visit(null, 0);
  return ordered;
}

function categoryGroupForEntryKind(entryKind: EntryKind) {
  switch (entryKind) {
    case "income_earned":
      return "income";
    case "saving_transfer":
      return "saving";
    case "investment_buy":
      return "investment";
    default:
      return "expense";
  }
}

function toMinor(value: string) {
  return Math.round((parseFloat(value || "0") || 0) * 100);
}

function today() {
  return new Date().toISOString().split("T")[0];
}

export default function AddPage() {
  const { data: session } = useSession();
  const apiCall = useApiCall();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loans, setLoans] = useState<LoanSummary[]>([]);

  const [formData, setFormData] = useState({
    transactionDate: today(),
    entryKind: "expense_living" as EntryKind,
    amount: "",
    currency: "ZMW",
    accountId: "",
    destinationAccountId: "",
    categoryId: "",
    incomeSourceId: "",
    businessId: "",
    loanId: "",
    assetId: "",
    quantity: "",
    unitPrice: "",
    fees: "0",
    note: "",
  });

  useEffect(() => {
    if (!session?.accessToken) {
      setInitializing(false);
      return;
    }

    let ignore = false;
    const loadSettingsData = async () => {
      try {
        const [loadedAccounts, loadedCategories, loadedIncomeSources, loadedBusinesses, loadedAssets, loadedLoans, prefs] =
          await Promise.all([
            apiCall<Account[]>("/v1/accounts"),
            apiCall<Category[]>("/v1/categories"),
            apiCall<IncomeSource[]>("/v1/income-sources").catch(() => []),
            apiCall<Business[]>("/v1/businesses").catch(() => []),
            apiCall<Asset[]>("/v1/assets").catch(() => []),
            apiCall<LoanSummary[]>("/v1/loans").catch(() => []),
            apiCall<UserPreferences>("/v1/user/preferences").catch(() => ({ defaultCurrency: "ZMW" })),
          ]);

        if (!ignore) {
          const nonLiabilityAccounts = (loadedAccounts ?? []).filter((account) => account.accountClass !== "liability");
          setAccounts(loadedAccounts ?? []);
          setCategories(loadedCategories ?? []);
          setIncomeSources(loadedIncomeSources ?? []);
          setBusinesses(loadedBusinesses ?? []);
          setAssets(loadedAssets ?? []);
          setLoans(loadedLoans ?? []);

          setFormData((current) => ({
            ...current,
            currency: prefs.defaultCurrency || "ZMW",
            accountId: nonLiabilityAccounts[0]?.id ?? loadedAccounts?.[0]?.id ?? "",
            destinationAccountId: nonLiabilityAccounts[1]?.id ?? "",
            loanId: loadedLoans?.[0]?.id ?? "",
            assetId: loadedAssets?.[0]?.id ?? "",
          }));
        }
      } catch (loadError) {
        if (!ignore) setError(loadError instanceof Error ? loadError.message : "Failed to load settings data");
      } finally {
        if (!ignore) setInitializing(false);
      }
    };

    void loadSettingsData();
    return () => {
      ignore = true;
    };
  }, [session?.accessToken, apiCall]);

  const cashAccounts = useMemo(() => accounts.filter((account) => account.accountClass !== "liability"), [accounts]);
  const orderedCategories = useMemo(() => buildOrderedCategories(categories), [categories]);
  const filteredCategories = useMemo(
    () => orderedCategories.filter((category) => category.categoryGroup === categoryGroupForEntryKind(formData.entryKind)),
    [orderedCategories, formData.entryKind]
  );
  const showCategories = formData.entryKind === "expense_living" || formData.entryKind === "income_earned";
  const showBusiness = formData.entryKind === "expense_living" || formData.entryKind === "income_earned";
  const isWorkflowMode = formData.entryKind === "income_borrowed" || formData.entryKind === "debt_principal_payment";

  useEffect(() => {
    if (!formData.categoryId) return;
    const stillValid = filteredCategories.some((category) => category.id === formData.categoryId);
    if (!stillValid) {
      setFormData((current) => ({ ...current, categoryId: "" }));
    }
  }, [filteredCategories, formData.categoryId]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const resetAfterSave = () => {
    setFormData((current) => ({
      ...current,
      transactionDate: today(),
      entryKind: "expense_living",
      amount: "",
      categoryId: "",
      incomeSourceId: "",
      businessId: "",
      quantity: "",
      unitPrice: "",
      fees: "0",
      note: "",
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session?.accessToken) {
      setError("Not authenticated");
      return;
    }
    if (!formData.accountId) {
      setError("Please select an account");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const amountMinor = toMinor(formData.amount);
      if (amountMinor <= 0) {
        throw new Error("Amount must be greater than zero");
      }

      if (formData.entryKind === "income_borrowed") {
        if (!formData.loanId) throw new Error("Please select a loan");
        await apiCall("/v1/loans/borrowed", {
          method: "POST",
          body: {
            loanId: formData.loanId,
            cashAccountId: formData.accountId,
            amountMinor,
            currency: formData.currency,
            transactionDate: formData.transactionDate,
            note: formData.note || undefined,
          },
        });
      } else if (formData.entryKind === "debt_principal_payment") {
        if (!formData.loanId) throw new Error("Please select a loan");
        await apiCall(`/v1/loans/${formData.loanId}/repayments`, {
          method: "POST",
          body: {
            cashAccountId: formData.accountId,
            amountMinor,
            currency: formData.currency,
            transactionDate: formData.transactionDate,
            note: formData.note || undefined,
          },
        });
      } else {
        if (formData.entryKind === "saving_transfer" && !formData.destinationAccountId) {
          throw new Error("Please select a destination account");
        }
        if (formData.entryKind === "investment_buy" && !formData.assetId) {
          throw new Error("Please select an asset");
        }

        const quantity = parseFloat(formData.quantity || "0") || undefined;
        const unitPrice = toMinor(formData.unitPrice);
        const fees = toMinor(formData.fees);
        if (formData.entryKind === "investment_buy" && (!quantity || unitPrice <= 0)) {
          throw new Error("Investment buys need quantity and unit price");
        }

        await apiCall("/v1/transactions", {
          method: "POST",
          body: {
            transactionDate: formData.transactionDate,
            entryKind: formData.entryKind,
            amount: formData.entryKind === "investment_buy" && quantity && unitPrice > 0
              ? Math.round(quantity * unitPrice) + fees
              : amountMinor,
            currency: formData.currency,
            accountId: formData.accountId,
            destinationAccountId: formData.destinationAccountId || undefined,
            categoryId: showCategories ? formData.categoryId || undefined : undefined,
            incomeSourceId: formData.entryKind === "income_earned" ? formData.incomeSourceId || undefined : undefined,
            businessId: showBusiness ? formData.businessId || undefined : undefined,
            assetId: formData.entryKind === "investment_buy" ? formData.assetId || undefined : undefined,
            quantity: formData.entryKind === "investment_buy" ? quantity : undefined,
            unitPrice: formData.entryKind === "investment_buy" && unitPrice > 0 ? unitPrice : undefined,
            fees: formData.entryKind === "investment_buy" && fees > 0 ? fees : undefined,
            note: formData.note || undefined,
            source: "manual",
          },
        });
      }

      resetAfterSave();
      router.push("/today");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Error creating entry");
    } finally {
      setLoading(false);
    }
  };

  if (!session || initializing) {
    return <div className="shell">Loading...</div>;
  }

  if (accounts.length === 0) {
    return (
      <main className="shell">
        <section className="appChrome workspaceStack">
          <AppPageHeader
            eyebrow="Inscribed ledger"
            title="Add"
            accent="Quick entry"
            lead="Quick entry becomes available as soon as at least one account exists."
            icon={AddIcon}
          />

          <div className="card resourceBody">
            <strong>No accounts configured yet</strong>
            <span className="muted">Quick Add needs at least one account before it can save a transaction.</span>
            <div className="formActions">
              <Link href="/settings/accounts" className="primaryButton">
                Go to Accounts
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="appChrome workspaceStack">
        <AppPageHeader
          eyebrow="Inscribed ledger"
          title="Add"
          accent="Quick entry"
          lead="Capture the movement once and let the ledger split the financial meaning underneath."
          icon={AddIcon}
        />

        <section className="addCanvas">
          <form className="card quickAddForm" onSubmit={handleSubmit}>
            <div className="quickAddAmountBlock">
              <span className="sectionKicker">Amount</span>
              <label htmlFor="amount" className="srOnlyLabel">
                Amount
              </label>
              <div className="quickAddCurrency">{formData.currency}</div>
              <input
                id="amount"
                name="amount"
                type="number"
                className="quickAddAmountInput"
                placeholder="0.00"
                value={formData.amount}
                onChange={handleChange}
                required
                step="0.01"
              />
            </div>

            <div className="formSectionCard">
              <div className="formSectionHeader">
                <h2 className="formSectionTitle">Entry type</h2>
                <span className="muted">Choose the financial meaning before filling in the details.</span>
              </div>

              <div className="entryTypeGrid planEntryTypeGrid">
                {entryTypes.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={formData.entryKind === item.value ? "entryTypeButton active" : "entryTypeButton"}
                    onClick={() => setFormData((current) => ({ ...current, entryKind: item.value, categoryId: "" }))}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="splitFields">
                <div className="field">
                  <label htmlFor="accountId">{isWorkflowMode ? "Cash account" : "Source account"}</label>
                  <select id="accountId" name="accountId" value={formData.accountId} onChange={handleChange} required>
                    <option value="">Select account</option>
                    {cashAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="transactionDate">Date</label>
                  <input
                    id="transactionDate"
                    name="transactionDate"
                    type="date"
                    value={formData.transactionDate}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>

            {formData.entryKind === "income_borrowed" || formData.entryKind === "debt_principal_payment" ? (
              <div className="formSectionCard">
                <div className="formSectionHeader">
                  <h2 className="formSectionTitle">Loan</h2>
                  <span className="muted">Borrowing increases liability; repayment clears fees, interest, then principal.</span>
                </div>

                <div className="field">
                  <label htmlFor="loanId">Creditor / loan</label>
                  <select id="loanId" name="loanId" value={formData.loanId} onChange={handleChange} required>
                    <option value="">Select loan</option>
                    {loans.map((loan) => (
                      <option key={loan.id} value={loan.id}>
                        {loan.creditorName} - ZMW {(loan.totalRemainingBalance / 100).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>

                {loans.length === 0 ? (
                  <Link href={"/settings/loans" as Route} className="ghostButton">
                    Create a loan first
                  </Link>
                ) : null}
              </div>
            ) : null}

            {formData.entryKind === "saving_transfer" ? (
              <div className="formSectionCard">
                <div className="formSectionHeader">
                  <h2 className="formSectionTitle">Destination</h2>
                  <span className="muted">Savings are asset movements, not living expenses.</span>
                </div>
                <div className="field">
                  <label htmlFor="destinationAccountId">Destination account</label>
                  <select
                    id="destinationAccountId"
                    name="destinationAccountId"
                    value={formData.destinationAccountId}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select destination</option>
                    {cashAccounts
                      .filter((account) => account.id !== formData.accountId)
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            ) : null}

            {formData.entryKind === "investment_buy" ? (
              <div className="formSectionCard">
                <div className="formSectionHeader">
                  <h2 className="formSectionTitle">Investment</h2>
                  <span className="muted">An investment buy moves cash into the portfolio and records the lot when quantity and price are supplied.</span>
                </div>

                <div className="field">
                  <label htmlFor="assetId">Asset</label>
                  <select id="assetId" name="assetId" value={formData.assetId} onChange={handleChange} required>
                    <option value="">Select asset</option>
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name}
                        {asset.symbol ? ` (${asset.symbol})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="splitFields">
                  <div className="field">
                    <label htmlFor="quantity">Quantity</label>
                    <input id="quantity" name="quantity" type="number" step="0.000001" value={formData.quantity} onChange={handleChange} />
                  </div>
                  <div className="field">
                    <label htmlFor="unitPrice">Unit price</label>
                    <input id="unitPrice" name="unitPrice" type="number" step="0.01" value={formData.unitPrice} onChange={handleChange} />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="fees">Fees</label>
                  <input id="fees" name="fees" type="number" step="0.01" value={formData.fees} onChange={handleChange} />
                </div>

                {assets.length === 0 ? (
                  <Link href="/investments" className="ghostButton">
                    Create an asset first
                  </Link>
                ) : null}
              </div>
            ) : null}

            {showCategories ? (
              <div className="formSectionCard">
                <div className="formSectionHeader">
                  <h2 className="formSectionTitle">Category</h2>
                  <span className="muted">Categories explain history; loan principal is handled by the loan workflow instead.</span>
                </div>

                <div className="chipScrollerContainer">
                  <div className="chipScroller">
                    <button
                      type="button"
                      className={formData.categoryId === "" ? "choiceChip active" : "choiceChip"}
                      onClick={() => setFormData((current) => ({ ...current, categoryId: "" }))}
                    >
                      No category
                    </button>
                    {filteredCategories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        className={formData.categoryId === category.id ? "choiceChip active" : "choiceChip"}
                        onClick={() => setFormData((current) => ({ ...current, categoryId: category.id }))}
                      >
                        {`${category.depth > 0 ? `${"· ".repeat(category.depth)}` : ""}${category.name}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="formSectionCard">
              <div className="formSectionHeader">
                <h2 className="formSectionTitle">Context</h2>
                <span className="muted">Add only what will make reports easier to trust later.</span>
              </div>

              {formData.entryKind === "income_earned" ? (
                <div className="field">
                  <label htmlFor="incomeSourceId">Income source</label>
                  <select id="incomeSourceId" name="incomeSourceId" value={formData.incomeSourceId} onChange={handleChange}>
                    <option value="">No income source</option>
                    {incomeSources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="splitFields">
                {showBusiness ? (
                  <div className="field">
                    <label htmlFor="businessId">Business link</label>
                    <select id="businessId" name="businessId" value={formData.businessId} onChange={handleChange}>
                      <option value="">No business</option>
                      {businesses.map((business) => (
                        <option key={business.id} value={business.id}>
                          {business.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div className="field">
                  <label htmlFor="currency">Currency</label>
                  <input id="currency" name="currency" value={formData.currency} onChange={handleChange} />
                </div>
              </div>

              <div className="field">
                <label htmlFor="note">Note</label>
                <textarea
                  id="note"
                  name="note"
                  placeholder="Add a short note..."
                  value={formData.note}
                  onChange={handleChange}
                />
              </div>
            </div>

            {error ? <p className="statusText">{error}</p> : null}

            <div className="quickAddFooter">
              <button type="submit" className="primaryButton" disabled={loading}>
                {loading ? "Saving..." : "Save entry"}
              </button>
              <Link href="/today" className="ghostButton">
                Back
              </Link>
            </div>
          </form>

          <aside className="card helperNote">
            <span className="sectionKicker">Quick entry note</span>
            <h2 className="sectionHeading">The same amount can mean very different things.</h2>
            <p className="muted">
              Borrowed cash, loan principal, interest, savings, and investments each move through different financial buckets.
            </p>
          </aside>
        </section>
      </section>
    </main>
  );
}
