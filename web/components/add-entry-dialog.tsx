"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useApiCall } from "@/lib/client-api";
import { formatMoney } from "@/lib/format-money";
import { useUserCurrency } from "@/lib/use-user-currency";

type EntryKind =
  | ""
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

interface InvestmentType {
  id: string;
  name: string;
  code: string;
}

interface LoanSummary {
  id: string;
  creditorName: string;
  totalRemainingBalance: number;
  remainingPrincipal: number;
}

type EntryTypeOption = {
  value: Exclude<EntryKind, "">;
  label: string;
  description: string;
  symbol: string;
  tone: string;
};

const entryTypeGroups: Array<{ label: string; options: EntryTypeOption[] }> = [
  {
    label: "Everyday money",
    options: [
      {
        value: "expense_living",
        label: "I spent money",
        description: "Purchase, bill, fee, or everyday expense",
        symbol: "−",
        tone: "bg-[#FDECEC] text-[#A84242]",
      },
      {
        value: "income_earned",
        label: "I received money",
        description: "Salary, payment, sale, or other income",
        symbol: "+",
        tone: "bg-[#E9F7F0] text-[#257453]",
      },
    ],
  },
  {
    label: "Move & grow",
    options: [
      {
        value: "saving_transfer",
        label: "I transferred money",
        description: "Move money between any two active accounts",
        symbol: "↔",
        tone: "bg-[#EAF2FF] text-[#264E86]",
      },
      {
        value: "investment_buy",
        label: "I bought an investment",
        description: "Add a stock or government bond purchase",
        symbol: "↗",
        tone: "bg-[#E8F6F7] text-[#216A73]",
      },
    ],
  },
  {
    label: "Borrowing",
    options: [
      {
        value: "income_borrowed",
        label: "I took a loan",
        description: "Record borrowed money entering an account",
        symbol: "↓",
        tone: "bg-[#FFF3E3] text-[#9A5B16]",
      },
      {
        value: "debt_principal_payment",
        label: "I paid a loan",
        description: "Reduce the balance on an existing loan",
        symbol: "✓",
        tone: "bg-[#F2ECFF] text-[#6542A8]",
      },
    ],
  },
];

const entryTypes = entryTypeGroups.flatMap((group) => group.options);

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

function oneYearFromToday() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().split("T")[0];
}

type AddEntryDialogProps = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function AddEntryDialog({ open, onClose, onSaved }: AddEntryDialogProps) {
  const { data: session } = useSession();
  const apiCall = useApiCall();
  const { currency: userCurrency } = useUserCurrency();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [investmentTypes, setInvestmentTypes] = useState<InvestmentType[]>([]);
  const [loans, setLoans] = useState<LoanSummary[]>([]);
  const [investmentMode, setInvestmentMode] = useState<"existing" | "stock" | "bond">("existing");
  const [newInvestment, setNewInvestment] = useState({
    name: "",
    symbol: "",
    couponRate: "",
    issueDate: today(),
    maturityDate: oneYearFromToday(),
    couponFrequency: "2",
    reinvestmentCutoffDate: oneYearFromToday(),
  });

  const [formData, setFormData] = useState({
    transactionDate: today(),
    entryKind: "" as EntryKind,
    amount: "",
    currency: userCurrency,
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
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open || !session?.accessToken) {
      if (!session?.accessToken) {
        setInitializing(false);
      }
      return;
    }

    let ignore = false;
    setInitializing(true);
    setError("");

    const loadSettingsData = async () => {
      try {
        const [
          loadedAccounts,
          loadedCategories,
          loadedIncomeSources,
          loadedBusinesses,
          loadedAssets,
          loadedInvestmentTypes,
          loadedLoans,
        ] = await Promise.all([
          apiCall<Account[]>("/v1/accounts"),
          apiCall<Category[]>("/v1/categories"),
          apiCall<IncomeSource[]>("/v1/income-sources").catch(() => []),
          apiCall<Business[]>("/v1/businesses").catch(() => []),
          apiCall<Asset[]>("/v1/assets").catch(() => []),
          apiCall<InvestmentType[]>("/v1/investment-types").catch(() => []),
          apiCall<LoanSummary[]>("/v1/loans").catch(() => []),
        ]);

        if (ignore) {
          return;
        }

        const nonLiabilityAccounts = (loadedAccounts ?? []).filter(
          (account) => account.accountClass !== "liability",
        );
        const defaultSourceAccount = nonLiabilityAccounts[0] ?? loadedAccounts?.[0];
        const defaultDestinationAccount = nonLiabilityAccounts.find(
          (account) =>
            account.id !== defaultSourceAccount?.id &&
            account.currency === defaultSourceAccount?.currency,
        );

        setAccounts(loadedAccounts ?? []);
        setCategories(loadedCategories ?? []);
        setIncomeSources(loadedIncomeSources ?? []);
        setBusinesses(loadedBusinesses ?? []);
        setAssets(loadedAssets ?? []);
        setInvestmentTypes(loadedInvestmentTypes ?? []);
        setLoans(loadedLoans ?? []);
        setFormData({
          transactionDate: today(),
          entryKind: "",
          amount: "",
          currency: defaultSourceAccount?.currency ?? userCurrency,
          accountId: defaultSourceAccount?.id ?? "",
          destinationAccountId: defaultDestinationAccount?.id ?? "",
          categoryId: "",
          incomeSourceId: "",
          businessId: "",
          loanId: loadedLoans?.[0]?.id ?? "",
          assetId: loadedAssets?.[0]?.id ?? "",
          quantity: "",
          unitPrice: "",
          fees: "0",
          note: "",
        });
        setInvestmentMode((loadedAssets ?? []).some((asset) => asset.assetClass !== "bond") ? "existing" : "stock");
        setNewInvestment({
          name: "",
          symbol: "",
          couponRate: "",
          issueDate: today(),
          maturityDate: oneYearFromToday(),
          couponFrequency: "2",
          reinvestmentCutoffDate: oneYearFromToday(),
        });
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load entry setup");
        }
      } finally {
        if (!ignore) {
          setInitializing(false);
        }
      }
    };

    void loadSettingsData();

    return () => {
      ignore = true;
    };
  }, [open, session?.accessToken, apiCall, userCurrency]);

  useEffect(() => {
    setFormData((current) =>
      current.currency === userCurrency ? current : { ...current, currency: userCurrency },
    );
  }, [userCurrency]);

  const cashAccounts = useMemo(
    () => accounts.filter((account) => account.accountClass !== "liability"),
    [accounts],
  );
  const sourceAccount = useMemo(
    () => cashAccounts.find((account) => account.id === formData.accountId),
    [cashAccounts, formData.accountId],
  );
  const transferDestinationAccounts = useMemo(
    () =>
      cashAccounts.filter(
        (account) =>
          account.id !== formData.accountId && account.currency === sourceAccount?.currency,
      ),
    [cashAccounts, formData.accountId, sourceAccount?.currency],
  );
  const orderedCategories = useMemo(() => buildOrderedCategories(categories), [categories]);
  const filteredCategories = useMemo(
    () =>
      orderedCategories.filter(
        (category) => category.categoryGroup === categoryGroupForEntryKind(formData.entryKind),
      ),
    [orderedCategories, formData.entryKind],
  );
  const showCategories =
    formData.entryKind === "expense_living" || formData.entryKind === "income_earned";
  const showBusiness =
    formData.entryKind === "expense_living" || formData.entryKind === "income_earned";
  const isWorkflowMode =
    formData.entryKind === "income_borrowed" ||
    formData.entryKind === "debt_principal_payment";
  const accountLabel = formData.entryKind === "income_earned" || formData.entryKind === "income_borrowed"
    ? "Received into"
    : formData.entryKind === "saving_transfer"
      ? "From account"
    : formData.entryKind === "debt_principal_payment"
      ? "Paid from"
      : formData.entryKind === "investment_buy" && investmentMode === "bond"
        ? "Coupon and maturity account"
        : "Paid from";
  const isStockPurchase = formData.entryKind === "investment_buy" && investmentMode !== "bond";
  const stockQuantity = Number.parseFloat(formData.quantity || "0") || 0;
  const stockUnitPriceMinor = toMinor(formData.unitPrice);
  const stockFeesMinor = toMinor(formData.fees);
  const stockSubtotalMinor = Math.round(stockQuantity * stockUnitPriceMinor);
  const stockTotalMinor = stockSubtotalMinor + stockFeesMinor;

  useEffect(() => {
    if (!formData.categoryId) return;
    const stillValid = filteredCategories.some((category) => category.id === formData.categoryId);
    if (!stillValid) {
      setFormData((current) => ({ ...current, categoryId: "" }));
    }
  }, [filteredCategories, formData.categoryId]);

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleAccountChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const accountId = event.target.value;
    const account = cashAccounts.find((item) => item.id === accountId);
    setFormData((current) => {
      const destination = cashAccounts.find(
        (item) => item.id === current.destinationAccountId,
      );
      const keepDestination =
        current.entryKind !== "saving_transfer" ||
        (destination?.id !== accountId && destination?.currency === account?.currency);

      return {
        ...current,
        accountId,
        currency: account?.currency ?? current.currency,
        destinationAccountId: keepDestination ? current.destinationAccountId : "",
      };
    });
  };

  const handleSubmit = async (event: FormEvent) => {
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
      const amountMinor = isStockPurchase ? stockTotalMinor : toMinor(formData.amount);
      if (amountMinor <= 0) {
        throw new Error("Amount must be greater than zero");
      }

      if (formData.entryKind === "investment_buy" && investmentMode === "bond") {
        const couponRate = Number.parseFloat(newInvestment.couponRate);
        if (!newInvestment.name.trim()) throw new Error("Enter a bond name");
        if (!Number.isFinite(couponRate) || couponRate < 0) throw new Error("Enter a valid coupon rate");
        await apiCall("/v1/bonds", {
          method: "POST",
          body: {
            name: newInvestment.name.trim(),
            symbol: newInvestment.symbol.trim() || undefined,
            currency: formData.currency,
            cashAccountId: formData.accountId,
            principalMinor: amountMinor,
            couponRateBps: Math.round(couponRate * 100),
            issueDate: newInvestment.issueDate,
            maturityDate: newInvestment.maturityDate,
            couponFrequencyPerYear: Number.parseInt(newInvestment.couponFrequency, 10),
            reinvestmentCutoffDate: newInvestment.reinvestmentCutoffDate,
          },
        });
      } else if (formData.entryKind === "income_borrowed") {
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
        let investmentAssetId = formData.assetId;
        let createdAssetId = "";
        if (formData.entryKind === "investment_buy" && investmentMode === "stock") {
          if (!newInvestment.name.trim()) throw new Error("Enter a company or fund name");
          let stockType = investmentTypes.find((item) => item.code === "stock" || item.name.toLowerCase() === "stock");
          if (!stockType) {
            stockType = await apiCall<InvestmentType>("/v1/investment-types", {
              method: "POST",
              body: { name: "Stock" },
            });
          }
          if (!stockType) throw new Error("Could not prepare stock tracking");
          const createdAsset = await apiCall<Asset>("/v1/assets", {
            method: "POST",
            body: {
              investmentTypeId: stockType.id,
              assetClass: "stock",
              name: newInvestment.name.trim(),
              symbol: newInvestment.symbol.trim() || undefined,
              currency: formData.currency,
            },
          });
          if (!createdAsset) throw new Error("Could not create the stock");
          investmentAssetId = createdAsset.id;
          createdAssetId = createdAsset.id;
        }
        if (formData.entryKind === "investment_buy" && !investmentAssetId) {
          throw new Error("Please select or create a stock");
        }

        const quantity = stockQuantity || undefined;
        const unitPrice = stockUnitPriceMinor;
        const fees = stockFeesMinor;
        if (formData.entryKind === "investment_buy" && (!quantity || unitPrice <= 0)) {
          throw new Error("Investment buys need quantity and unit price");
        }

        try {
          await apiCall("/v1/transactions", {
            method: "POST",
            body: {
            transactionDate: formData.transactionDate,
            entryKind: formData.entryKind,
            amount:
              formData.entryKind === "investment_buy" && quantity && unitPrice > 0
                ? Math.round(quantity * unitPrice) + fees
                : amountMinor,
            currency: formData.currency,
            accountId: formData.accountId,
            destinationAccountId: formData.destinationAccountId || undefined,
            categoryId: showCategories ? formData.categoryId || undefined : undefined,
            incomeSourceId:
              formData.entryKind === "income_earned"
                ? formData.incomeSourceId || undefined
                : undefined,
            businessId: showBusiness ? formData.businessId || undefined : undefined,
            assetId: formData.entryKind === "investment_buy" ? investmentAssetId || undefined : undefined,
            quantity: formData.entryKind === "investment_buy" ? quantity : undefined,
            unitPrice:
              formData.entryKind === "investment_buy" && unitPrice > 0
                ? unitPrice
                : undefined,
            fees: formData.entryKind === "investment_buy" && fees > 0 ? fees : undefined,
            note: formData.note || undefined,
            source: "manual",
            },
          });
        } catch (caught) {
          if (createdAssetId) {
            await apiCall(`/v1/assets/${createdAssetId}`, { method: "DELETE" }).catch(() => undefined);
          }
          throw caught;
        }

      }

      router.refresh();
      onSaved?.();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Error creating entry");
    } finally {
      setLoading(false);
    }
  };

  const hasAccounts = accounts.length > 0;
  const selectedEntryType = entryTypes.find((item) => item.value === formData.entryKind);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="add-entry-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className="w-[min(94vw,760px)] rounded-2xl border border-outline bg-surface p-0 text-on-surface shadow-md backdrop:bg-[#071225]/55"
    >
      <div className="max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-outline pb-4">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="add-entry-title" className="text-2xl font-semibold text-on-surface">Add entry</h2>
              <span className="rounded-full bg-primary-softer px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-primary">
                {formData.entryKind ? "Details" : "Choose type"}
              </span>
            </div>
            <p className="text-sm text-on-surface-soft">
              Record money movement, debt, or an investment in one flow.
            </p>
          </div>
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-outline bg-surface-soft text-xl leading-none text-on-surface-soft transition hover:border-primary hover:text-primary"
            onClick={onClose}
            aria-label="Close add entry dialog"
          >
            ×
          </button>
        </div>

        {!session || initializing ? <div className="py-8 text-sm text-on-surface-soft">Loading...</div> : null}

        {session && !initializing && !hasAccounts ? (
          <div className="grid gap-4">
            <div className="rounded-lg border border-outline bg-surface-soft p-4">
              <strong className="block text-on-surface">No accounts configured yet</strong>
              <p className="mt-1 text-sm text-on-surface-soft">
                Add an account first so entries have somewhere to land.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Link href="/settings/accounts" className="primaryButton" onClick={onClose}>
                Go to Accounts
              </Link>
            </div>
          </div>
        ) : null}

        {session && !initializing && hasAccounts ? (
          <form className="grid gap-5" onSubmit={handleSubmit}>
            {!selectedEntryType ? (
              <section className="rounded-xl border border-outline bg-[linear-gradient(145deg,var(--surface-soft),var(--surface))] p-4 sm:p-5">
                <div className="mb-5 grid gap-1">
                  <h2 className="text-xl font-semibold text-on-surface">What happened?</h2>
                  <p className="text-sm text-on-surface-soft">Pick the closest action. Expenses will tailor the fields that follow.</p>
                </div>

                <div className="grid gap-5">
                  {entryTypeGroups.map((group) => (
                    <div key={group.label} className="grid gap-2">
                      <p className="text-[11px] font-bold uppercase tracking-[0.11em] text-on-surface-soft">
                        {group.label}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.options.map((item) => (
                          <button
                            key={item.value}
                            type="button"
                            aria-label={item.label}
                            className="group flex min-h-[76px] items-center gap-3 rounded-lg border border-outline bg-surface p-3 text-left shadow-xs transition hover:-translate-y-0.5 hover:border-primary hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            onClick={() =>
                              setFormData((current) => ({
                                ...current,
                                entryKind: item.value,
                                categoryId: "",
                              }))
                            }
                          >
                            <span aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-xl font-bold ${item.tone}`}>
                              {item.symbol}
                            </span>
                            <span className="min-w-0 flex-1">
                              <strong className="block text-sm text-on-surface">{item.label}</strong>
                              <span className="mt-0.5 block text-xs leading-4 text-on-surface-soft">{item.description}</span>
                            </span>
                            <span aria-hidden="true" className="text-lg text-outline-strong transition group-hover:translate-x-0.5 group-hover:text-primary">›</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <section className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary-softer p-3 sm:p-4">
                <span aria-hidden="true" className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xl font-bold ${selectedEntryType.tone}`}>
                  {selectedEntryType.symbol}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm text-on-surface">{selectedEntryType.label}</strong>
                  <span className="mt-0.5 block text-xs text-on-surface-soft">{selectedEntryType.description}</span>
                </span>
                <button
                  type="button"
                  className="rounded-md border border-outline bg-surface px-3 py-2 text-xs font-bold text-primary transition hover:border-primary"
                  onClick={() => setFormData((current) => ({ ...current, entryKind: "", categoryId: "" }))}
                >
                  Change
                </button>
              </section>
            )}

            {formData.entryKind ? (
            <div className="formSectionCard">
              <div className="formSectionHeader">
                <h2 className="formSectionTitle">{isStockPurchase ? "Purchase total & account" : "Amount & account"}</h2>
                <span className="muted">{isStockPurchase ? "The total updates from shares, price, and broker fees." : "Add the core details for this activity."}</span>
              </div>

              {isStockPurchase ? (
                <div className="rounded-xl border border-investment/25 bg-investment-soft p-4" aria-live="polite" aria-label="Calculated stock purchase total">
                  <span className="sectionKicker">Total purchase cost</span>
                  <strong className="mt-2 block text-3xl font-bold tracking-tight text-on-surface">
                    {formatMoney(stockTotalMinor, formData.currency)}
                  </strong>
                  <p className="mt-2 text-xs text-on-surface-soft">
                    {stockQuantity > 0 && stockUnitPriceMinor > 0
                      ? `${stockQuantity.toLocaleString()} shares × ${formatMoney(stockUnitPriceMinor, formData.currency)} + ${formatMoney(stockFeesMinor, formData.currency)} fees`
                      : "Enter the number of shares and price per share below."}
                  </p>
                </div>
              ) : (
              <div className="quickAddAmountBlock mt-1">
                <span className="sectionKicker">{formData.entryKind === "investment_buy" && investmentMode === "bond" ? "Principal" : "Amount"}</span>
                <label htmlFor="amount" className="srOnlyLabel">
                  {formData.entryKind === "investment_buy" && investmentMode === "bond" ? "Principal" : "Amount"}
                </label>
                <div className="quickAddCurrency">{formData.currency}</div>
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  min="0"
                  className="quickAddAmountInput"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={handleChange}
                  required
                  step="0.01"
                  autoFocus
                />
              </div>
              )}

              <div className="splitFields mt-5">
                <div className="field">
                  <label htmlFor="accountId">{isWorkflowMode ? "Cash account" : accountLabel}</label>
                  <select
                    id="accountId"
                    name="accountId"
                    value={formData.accountId}
                    onChange={handleAccountChange}
                    required
                  >
                    <option value="">Select account</option>
                    {cashAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {[account.name, account.accountType?.replaceAll("_", " "), account.currency].filter(Boolean).join(" · ")}
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
            ) : null}

            {formData.entryKind === "income_borrowed" ||
            formData.entryKind === "debt_principal_payment" ? (
              <div className="formSectionCard">
                <div className="formSectionHeader">
                  <h2 className="formSectionTitle">Loan</h2>
                  <span className="muted">
                    Borrowing increases what you owe. Repayment reduces it.
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="loanId">Creditor / loan</label>
                  <select
                    id="loanId"
                    name="loanId"
                    value={formData.loanId}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select loan</option>
                    {loans.map((loan) => (
                      <option key={loan.id} value={loan.id}>
                        {loan.creditorName} - {formatMoney(loan.totalRemainingBalance, formData.currency)}
                      </option>
                    ))}
                  </select>
                </div>

                {loans.length === 0 ? (
                  <Link href={"/loans" as Route} className="ghostButton" onClick={onClose}>
                    Create a loan first
                  </Link>
                ) : null}
              </div>
            ) : null}

            {formData.entryKind === "saving_transfer" ? (
              <div className="formSectionCard">
                <div className="formSectionHeader">
                  <h2 className="formSectionTitle">To account</h2>
                  <span className="muted">Choose another active account using the same currency.</span>
                </div>
                <div className="field">
                  <label htmlFor="destinationAccountId">To account</label>
                  <select
                    id="destinationAccountId"
                    name="destinationAccountId"
                    value={formData.destinationAccountId}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select destination</option>
                    {transferDestinationAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {[account.name, account.accountType?.replaceAll("_", " "), account.currency].filter(Boolean).join(" · ")}
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
                  <span className="muted">Choose an existing stock, create a stock, or add a government bond.</span>
                </div>

                <div className="entryTypeGrid">
                  {([
                    ["existing", "Existing stock"],
                    ["stock", "New stock"],
                    ["bond", "Government bond"],
                  ] as const).map(([value, label]) => (
                    <button key={value} type="button" className={investmentMode === value ? "entryTypeButton active" : "entryTypeButton"} onClick={() => setInvestmentMode(value)}>
                      {label}
                    </button>
                  ))}
                </div>

                {investmentMode === "existing" ? (
                  <div className="field">
                    <label htmlFor="assetId">Stock</label>
                    <select id="assetId" name="assetId" value={formData.assetId} onChange={handleChange} required>
                      <option value="">Select stock</option>
                      {assets.filter((asset) => asset.assetClass !== "bond").map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name}{asset.symbol ? ` (${asset.symbol})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="field">
                    <label htmlFor="investmentName">{investmentMode === "bond" ? "Bond name" : "Company or fund name"}</label>
                    <input id="investmentName" value={newInvestment.name} onChange={(event) => setNewInvestment((current) => ({ ...current, name: event.target.value }))} required />
                  </div>
                )}

                {investmentMode !== "existing" ? <div className="field">
                  <label htmlFor="investmentSymbol">{investmentMode === "bond" ? "Bond code (optional)" : "Ticker symbol (optional)"}</label>
                  <input id="investmentSymbol" value={newInvestment.symbol} onChange={(event) => setNewInvestment((current) => ({ ...current, symbol: event.target.value.toUpperCase() }))} />
                </div> : null}

                {investmentMode !== "bond" ? <>
                  <div className="splitFields">
                    <div className="field"><label htmlFor="quantity">Shares purchased</label><input id="quantity" name="quantity" type="number" min="0" step="0.000001" value={formData.quantity} onChange={handleChange} required /></div>
                    <div className="field"><label htmlFor="unitPrice">Price per share</label><input id="unitPrice" name="unitPrice" type="number" min="0" step="0.01" value={formData.unitPrice} onChange={handleChange} required /></div>
                  </div>
                  <div className="field"><label htmlFor="fees">Broker fees</label><input id="fees" name="fees" type="number" min="0" step="0.01" value={formData.fees} onChange={handleChange} /><span className="muted">Included automatically in the total purchase cost.</span></div>
                </> : <>
                  <div className="splitFields">
                    <div className="field"><label htmlFor="couponRate">Annual coupon rate (%)</label><input id="couponRate" type="number" min="0" step="0.01" value={newInvestment.couponRate} onChange={(event) => setNewInvestment((current) => ({ ...current, couponRate: event.target.value }))} required /></div>
                    <div className="field"><label htmlFor="couponFrequency">Coupon frequency</label><select id="couponFrequency" value={newInvestment.couponFrequency} onChange={(event) => setNewInvestment((current) => ({ ...current, couponFrequency: event.target.value }))}><option value="1">Annually</option><option value="2">Semi-annually</option><option value="4">Quarterly</option><option value="12">Monthly</option></select></div>
                  </div>
                  <div className="splitFields">
                    <div className="field"><label htmlFor="issueDate">Issue date</label><input id="issueDate" type="date" value={newInvestment.issueDate} onChange={(event) => setNewInvestment((current) => ({ ...current, issueDate: event.target.value }))} required /></div>
                    <div className="field"><label htmlFor="maturityDate">Maturity date</label><input id="maturityDate" type="date" min={newInvestment.issueDate} value={newInvestment.maturityDate} onChange={(event) => setNewInvestment((current) => ({ ...current, maturityDate: event.target.value }))} required /></div>
                  </div>
                  <div className="field"><label htmlFor="reinvestmentCutoffDate">Stop reinvesting coupons</label><input id="reinvestmentCutoffDate" type="date" min={newInvestment.issueDate} max={newInvestment.maturityDate} value={newInvestment.reinvestmentCutoffDate} onChange={(event) => setNewInvestment((current) => ({ ...current, reinvestmentCutoffDate: event.target.value }))} required /><span className="muted">Coupons after this date and the principal redemption go to the selected account.</span></div>
                </>}
              </div>
            ) : null}

            {showCategories ? (
              <div className="formSectionCard">
                <div className="formSectionHeader">
                  <h2 className="formSectionTitle">Category</h2>
                  <span className="muted">Use a category when it helps history and reports.</span>
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
                        className={
                          formData.categoryId === category.id ? "choiceChip active" : "choiceChip"
                        }
                        onClick={() =>
                          setFormData((current) => ({ ...current, categoryId: category.id }))
                        }
                      >
                        {`${category.depth > 0 ? `${"· ".repeat(category.depth)}` : ""}${category.name}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {formData.entryKind ? <div className="formSectionCard">
              <div className="formSectionHeader">
                <h2 className="formSectionTitle">Context</h2>
                <span className="muted">Add the details you will want later.</span>
              </div>

              {formData.entryKind === "income_earned" ? (
                <div className="field">
                  <label htmlFor="incomeSourceId">Income source</label>
                  <select
                    id="incomeSourceId"
                    name="incomeSourceId"
                    value={formData.incomeSourceId}
                    onChange={handleChange}
                  >
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
                    <select
                      id="businessId"
                      name="businessId"
                      value={formData.businessId}
                      onChange={handleChange}
                    >
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
            </div> : null}

            {error ? <p className="statusText">{error}</p> : null}

            {formData.entryKind ? <div className="flex flex-wrap justify-end gap-2 border-t border-outline pt-4">
              <button type="button" className="ghostButton" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="primaryButton" disabled={loading}>
                {loading ? "Saving..." : "Save entry"}
              </button>
            </div> : null}
          </form>
        ) : null}
      </div>
    </dialog>
  );
}
