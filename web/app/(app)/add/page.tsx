"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useApiCall } from "@/lib/client-api";

interface Account {
  id: string;
  name: string;
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

interface UserPreferences {
  defaultCurrency: string;
}

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

function categoryGroupForEntryKind(entryKind: string) {
  switch (entryKind) {
    case "income":
      return "income";
    case "saving_transfer":
      return "saving";
    case "investment_buy":
      return "investment";
    default:
      return "expense";
  }
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

  const [formData, setFormData] = useState({
    transactionDate: new Date().toISOString().split("T")[0],
    entryKind: "expense",
    amount: "",
    currency: "ZMW",
    accountId: "",
    categoryId: "",
    incomeSourceId: "",
    businessId: "",
    note: "",
  });

  useEffect(() => {
    if (!session?.accessToken) return;

    const loadSettingsData = async () => {
      try {
        const [loadedAccounts, loadedCategories, loadedIncomeSources, loadedBusinesses, prefs] = await Promise.all([
          apiCall<Account[]>("/v1/accounts"),
          apiCall<Category[]>("/v1/categories"),
          apiCall<IncomeSource[]>("/v1/income-sources").catch(() => []),
          apiCall<Business[]>("/v1/businesses").catch(() => []),
          apiCall<UserPreferences>("/v1/user/preferences").catch(() => ({ defaultCurrency: "ZMW" })),
        ]);

        setAccounts(loadedAccounts ?? []);
        setCategories(loadedCategories ?? []);
        setIncomeSources(loadedIncomeSources ?? []);
        setBusinesses(loadedBusinesses ?? []);

        setFormData((current) => ({
          ...current,
          currency: prefs.defaultCurrency || "ZMW",
          accountId: loadedAccounts?.[0]?.id ?? "",
        }));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load settings data");
      } finally {
        setInitializing(false);
      }
    };

    void loadSettingsData();
  }, [session?.accessToken, apiCall]);

  const orderedCategories = useMemo(() => buildOrderedCategories(categories), [categories]);
  const filteredCategories = useMemo(
    () => orderedCategories.filter((category) => category.categoryGroup === categoryGroupForEntryKind(formData.entryKind)),
    [orderedCategories, formData.entryKind]
  );

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
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
      await apiCall("/v1/transactions", {
        method: "POST",
        body: {
          transactionDate: formData.transactionDate,
          entryKind: formData.entryKind,
          amount: Math.round(parseFloat(formData.amount) * 100),
          currency: formData.currency,
          accountId: formData.accountId,
          categoryId: formData.categoryId || undefined,
          incomeSourceId: formData.incomeSourceId || undefined,
          businessId: formData.businessId || undefined,
          note: formData.note || undefined,
          source: "manual",
        },
      });

      setFormData({
        transactionDate: new Date().toISOString().split("T")[0],
        entryKind: "expense",
        amount: "",
        currency: formData.currency,
        accountId: accounts.length > 0 ? accounts[0].id : "",
        categoryId: "",
        incomeSourceId: "",
        businessId: "",
        note: "",
      });

      router.push("/today");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Error creating transaction");
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
        <section className="appChrome">
          <h1 className="pageTitle">Quick Add</h1>
          <div className="card">
            <p className="muted">No accounts configured. Please set up an account in settings first.</p>
            <Link href="/settings/accounts" className="primaryButton block text-center mt-4">
              Go to Accounts
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="appChrome">
        <h1 className="pageTitle">Quick Add</h1>

        <form className="grid gap-4 mt-6" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="amount">Amount ({formData.currency})</label>
            <input
              id="amount"
              name="amount"
              type="number"
              placeholder="0"
              value={formData.amount}
              onChange={handleChange}
              required
              step="0.01"
            />
          </div>

          <div className="field">
            <label htmlFor="entryKind">Type</label>
            <select id="entryKind" name="entryKind" value={formData.entryKind} onChange={handleChange}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="saving_transfer">Saving</option>
              <option value="investment_buy">Investment</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="accountId">Account</label>
            <select id="accountId" name="accountId" value={formData.accountId} onChange={handleChange} required>
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="categoryId">Category</label>
            <select id="categoryId" name="categoryId" value={formData.categoryId} onChange={handleChange}>
              <option value="">No category</option>
              {filteredCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {`${"  ".repeat(category.depth)}${category.name}`}
                </option>
              ))}
            </select>
          </div>

          {formData.entryKind === "income" ? (
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

          <div className="field">
            <label htmlFor="note">Note (optional)</label>
            <input
              id="note"
              name="note"
              type="text"
              placeholder="Add a note..."
              value={formData.note}
              onChange={handleChange}
            />
          </div>

          {error && <p className="muted">{error}</p>}

          <button type="submit" className="primaryButton" disabled={loading}>
            {loading ? "Saving..." : "Save Transaction"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/today" className="ghostButton">
            Back
          </Link>
        </div>
      </section>
    </main>
  );
}
