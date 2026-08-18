"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useApiCall } from "@/lib/client-api";
import { notifyEntriesChanged } from "@/lib/entries-bus";
import {
  recallAccountForEntryKind,
  recallFeesForAccount,
  rememberAccountForEntryKind,
  rememberFeeForAccount,
} from "@/lib/entry-preferences";
import { buildCategoryRows, type Category } from "@/lib/category-tree";
import { addYearsToDate, isPastDate } from "@/lib/date-terms";
import { supportsHistoricalBackfill } from "@/lib/historical-entries";
import { formatMoney } from "@/lib/format-money";
import { spendableAccounts as filterSpendableAccounts } from "@/lib/spendable-accounts";
import type { MarketStockDirectory } from "@/lib/market-data";
import { useUserCurrency } from "@/lib/use-user-currency";
import { EntryTypePicker } from "@/components/add-entry/entry-type-picker";
import {
  categoryGroupForEntryKind,
  entryTypeFor,
  type EntryKind,
} from "@/components/add-entry/entry-types";

// Re-exported because receivables-workspace and the add-entry button import the
// kind from here; the type itself now lives with the rest of the entry vocabulary.
export type { EntryKind };

interface Account {
  id: string;
  name: string;
  accountType: string;
  accountClass: string;
  currency: string;
  isSavingsGroupAccount?: boolean;
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
  currency: string;
}

interface InvestmentType {
  id: string;
  name: string;
  code: string;
}

interface BondPosition {
  assetId: string;
  name: string;
  symbol?: string | null;
  currency: string;
  maturityDate: string;
}

interface LoanSummary {
  id: string;
  creditorName: string;
  totalRemainingBalance: number;
  remainingPrincipal: number;
}

function toMinor(value: string) {
  return Math.round((parseFloat(value || "0") || 0) * 100);
}

function today() {
  return new Date().toISOString().split("T")[0];
}

type AddEntryDialogProps = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  // Opening straight onto a kind (and, for lending, the person it concerns) is
  // what lets a row action mean one click instead of re-picking what the row
  // already says. Omitted, the dialog still opens on the kind picker.
  initialEntryKind?: EntryKind;
  initialReceivableAccountId?: string;
  initialCounterpartyName?: string;
};

export function AddEntryDialog({ open, onClose, onSaved, initialEntryKind, initialReceivableAccountId, initialCounterpartyName }: AddEntryDialogProps) {
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
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [investmentTypes, setInvestmentTypes] = useState<InvestmentType[]>([]);
  const [bonds, setBonds] = useState<BondPosition[]>([]);
  const [stockDirectory, setStockDirectory] = useState<MarketStockDirectory | null>(null);
  const [loans, setLoans] = useState<LoanSummary[]>([]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [investmentMode, setInvestmentMode] = useState<"existing" | "stock" | "bond" | "bond_existing">("existing");
  const [newInvestment, setNewInvestment] = useState({
    name: "",
    symbol: "",
    couponRate: "",
    issueDate: today(),
    termYears: "1",
    maturityDate: addYearsToDate(today(), 1),
    purchaseFee: "0",
    couponFrequency: "2",
    reinvestmentCutoffDate: addYearsToDate(today(), 1),
  });

  const [formData, setFormData] = useState({
    transactionDate: today(),
    entryKind: "" as EntryKind,
    amount: "",
    currency: userCurrency,
    accountId: "",
    destinationAccountId: "",
    receivableAccountId: "",
    counterpartyName: "",
    categoryId: "",
    businessId: "",
    loanId: "",
    assetId: "",
    quantity: "",
    unitPrice: "",
    fees: "0",
    transactionFee: "0",
    note: "",
    historicalBackfill: false,
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
          loadedBusinesses,
          loadedAssets,
          loadedInvestmentTypes,
          loadedLoans,
          loadedStockDirectory,
          loadedBonds,
        ] = await Promise.all([
          apiCall<Account[]>("/v1/accounts"),
          apiCall<Category[]>("/v1/categories"),
          apiCall<Business[]>("/v1/businesses").catch(() => []),
          apiCall<Asset[]>("/v1/assets").catch(() => []),
          apiCall<InvestmentType[]>("/v1/investment-types").catch(() => []),
          apiCall<LoanSummary[]>("/v1/loans").catch(() => []),
          apiCall<MarketStockDirectory>("/v1/market-data/luse").catch(() => null),
          apiCall<BondPosition[]>("/v1/bonds").catch(() => []),
        ]);

        if (ignore) {
          return;
        }

        const spendableLoadedAccounts = filterSpendableAccounts(loadedAccounts ?? []);
        const defaultSourceAccount = spendableLoadedAccounts[0];
        const defaultDestinationAccount = spendableLoadedAccounts.find(
          (account) =>
            account.id !== defaultSourceAccount?.id &&
            account.currency === defaultSourceAccount?.currency,
        );

        setAccounts(loadedAccounts ?? []);
        setCategories(loadedCategories ?? []);
        setBusinesses(loadedBusinesses ?? []);
        setAssets(loadedAssets ?? []);
        setInvestmentTypes(loadedInvestmentTypes ?? []);
        setLoans(loadedLoans ?? []);
        setStockDirectory(
          loadedStockDirectory && Array.isArray(loadedStockDirectory.stocks)
            ? loadedStockDirectory
            : null,
        );
        setBonds(loadedBonds ?? []);
        const firstStock = (loadedAssets ?? []).find((asset) => asset.assetClass !== "bond");
        // Opened straight onto a kind, the picker never runs, so the remembered
        // account is applied here instead of defaulting to whichever account
        // happens to be first.
        const rememberedForInitialKind = initialEntryKind
          ? (initialEntryKind === "investment_buy"
              ? (loadedAccounts ?? []).filter((account) => account.accountClass === "asset")
              : spendableLoadedAccounts
            ).find((account) => account.id === recallAccountForEntryKind(initialEntryKind))
          : undefined;
        const openingAccount = rememberedForInitialKind ?? defaultSourceAccount;
        setFormData({
          transactionDate: today(),
          entryKind: initialEntryKind ?? "",
          amount: "",
          currency: openingAccount?.currency ?? userCurrency,
          accountId: openingAccount?.id ?? "",
          destinationAccountId: defaultDestinationAccount?.id ?? "",
          receivableAccountId:
            initialReceivableAccountId
            ?? (loadedAccounts ?? []).find((account) => account.accountType === "receivable")?.id
            ?? "",
          counterpartyName: initialCounterpartyName ?? "",
          categoryId: "",
          businessId: "",
          loanId: loadedLoans?.[0]?.id ?? "",
          assetId: firstStock?.id ?? "",
          quantity: "",
          unitPrice: "",
          fees: "0",
          transactionFee: "0",
          note: "",
          historicalBackfill: false,
        });
        setInvestmentMode(firstStock ? "existing" : "stock");
        setCreatingCategory(false);
        setNewCategoryName("");
        setNewInvestment({
          name: "",
          symbol: "",
          couponRate: "",
          issueDate: today(),
          termYears: "1",
          maturityDate: addYearsToDate(today(), 1),
          purchaseFee: "0",
          couponFrequency: "2",
          reinvestmentCutoffDate: addYearsToDate(today(), 1),
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
  }, [open, session?.accessToken, apiCall, userCurrency, initialEntryKind, initialReceivableAccountId, initialCounterpartyName]);

  useEffect(() => {
    setFormData((current) =>
      current.currency === userCurrency ? current : { ...current, currency: userCurrency },
    );
  }, [userCurrency]);

  const cashAccounts = useMemo(
    () => accounts.filter((account) => account.accountClass !== "liability"),
    [accounts],
  );
  const spendableAccounts = useMemo(
    () => filterSpendableAccounts(cashAccounts),
    [cashAccounts],
  );
  const investmentAccounts = useMemo(
    () => spendableAccounts.filter((account) => account.currency === formData.currency),
    [formData.currency, spendableAccounts],
  );
  const stockAssets = useMemo(
    () => assets.filter((asset) => asset.assetClass !== "bond"),
    [assets],
  );
  const selectedStock = useMemo(
    () => stockAssets.find((asset) => asset.id === formData.assetId),
    [formData.assetId, stockAssets],
  );
  const selectedBond = useMemo(
    () => bonds.find((bond) => bond.assetId === formData.assetId),
    [bonds, formData.assetId],
  );
  const receivableAccounts = useMemo(
    () => cashAccounts.filter((account) => account.accountType === "receivable"),
    [cashAccounts],
  );
  const sourceAccount = useMemo(
    () => spendableAccounts.find((account) => account.id === formData.accountId),
    [formData.accountId, spendableAccounts],
  );
  const transferDestinationAccounts = useMemo(
    () =>
      cashAccounts.filter(
        (account) =>
          account.id !== formData.accountId && account.currency === sourceAccount?.currency,
      ),
    [cashAccounts, formData.accountId, sourceAccount?.currency],
  );
  const historicalSavingsAccounts = useMemo(
    () =>
      cashAccounts.filter(
        (account) =>
          account.accountType === "savings" && account.currency === formData.currency,
      ),
    [cashAccounts, formData.currency],
  );
  const orderedCategories = useMemo(() => buildCategoryRows(categories), [categories]);
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
  const isDebtWorkflow =
    formData.entryKind === "income_borrowed" ||
    formData.entryKind === "debt_principal_payment";
  const accountLabel =
    formData.entryKind === "income_earned" ||
    formData.entryKind === "income_borrowed" ||
    formData.entryKind === "loan_receivable_repayment"
    ? "Received into"
    : formData.entryKind === "saving_transfer"
      ? "From account"
      : formData.entryKind === "debt_principal_payment"
      ? "Paid from"
      : formData.entryKind === "investment_buy" && investmentMode === "bond"
        ? "Coupon and maturity account"
        : formData.entryKind === "investment_buy"
          ? "Paid from account"
        : "Paid from";
  const isBondPurchase = formData.entryKind === "investment_buy" && (investmentMode === "bond" || investmentMode === "bond_existing");
  const isStockPurchase = formData.entryKind === "investment_buy" && !isBondPurchase;
  const stockQuantity = Number.parseFloat(formData.quantity || "0") || 0;
  const stockUnitPriceMinor = toMinor(formData.unitPrice);
  const stockFeesMinor = toMinor(formData.fees);
  const transactionFeeMinor = toMinor(formData.transactionFee);
  const stockSubtotalMinor = Math.round(stockQuantity * stockUnitPriceMinor);
  const stockTotalMinor = stockSubtotalMinor + stockFeesMinor;
  const bondPurchaseFeeMinor = toMinor(newInvestment.purchaseFee);
  const historicalDate =
    formData.entryKind === "investment_buy" && investmentMode === "bond"
      ? newInvestment.issueDate
      : formData.transactionDate;
  const historicalEligible =
    supportsHistoricalBackfill(formData.entryKind) &&
    isPastDate(historicalDate, today());
  const historicalBackfill = historicalEligible && formData.historicalBackfill;
  const sourceAccountRequired = !historicalBackfill;
  const availableSourceAccounts =
    formData.entryKind === "investment_buy" ? investmentAccounts : spendableAccounts;

  const amountMinor = toMinor(formData.amount);
  // Mirrors movementFeeAccountID on the server: a repayment's fee is charged to
  // the cash account the money arrives in, not the receivable it came from.
  const feeAccountId =
    formData.entryKind === "loan_receivable_repayment" && formData.destinationAccountId
      ? formData.destinationAccountId
      : formData.accountId;
  const feeAccount = accounts.find((account) => account.id === feeAccountId);
  const movementIsIncoming =
    formData.entryKind === "income_earned" ||
    formData.entryKind === "income_borrowed" ||
    formData.entryKind === "loan_receivable_repayment";
  // The fee is a separate record against the same account, so what the balance
  // actually moves by is the two together.
  const netEffectMinor = movementIsIncoming
    ? amountMinor - transactionFeeMinor
    : amountMinor + transactionFeeMinor;
  // Re-read per account rather than cached across the session: the dialog
  // re-reads on its next open, which is when a newly remembered fee matters.
  const feeSuggestions = useMemo(() => recallFeesForAccount(feeAccountId), [feeAccountId]);

  /**
   * The account this kind of entry usually moves through.
   *
   * The form otherwise defaults to whichever account happens to be first, which
   * is right only by luck. Returns undefined when nothing is remembered or the
   * remembered account is no longer selectable — archived, or not valid for this
   * kind — so the caller keeps the existing default.
   */
  function rememberedAccountFor(entryKind: EntryKind) {
    const remembered = recallAccountForEntryKind(entryKind);
    if (!remembered) return undefined;
    const pool = entryKind === "investment_buy" ? investmentAccounts : spendableAccounts;
    return pool.find((account) => account.id === remembered);
  }

  useEffect(() => {
    if (!historicalEligible && formData.historicalBackfill) {
      setFormData((current) => ({ ...current, historicalBackfill: false }));
    }
  }, [formData.historicalBackfill, historicalEligible]);

  useEffect(() => {
    if (formData.entryKind !== "investment_buy") return;
    setFormData((current) => {
      const holdingCurrency = investmentMode === "existing"
        ? selectedStock?.currency
        : investmentMode === "bond_existing"
          ? selectedBond?.currency
          : undefined;
      const currency = holdingCurrency ?? current.currency;
      const accountStillMatches = spendableAccounts.some(
        (account) => account.id === current.accountId && account.currency === currency,
      );
      if (currency === current.currency && accountStillMatches) return current;
      const matchingAccount = spendableAccounts.find((account) => account.currency === currency);
      return {
        ...current,
        currency,
        accountId: accountStillMatches ? current.accountId : matchingAccount?.id ?? "",
      };
    });
  }, [formData.entryKind, formData.currency, investmentMode, selectedBond?.currency, selectedStock?.currency, spendableAccounts]);

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
    const account = spendableAccounts.find((item) => item.id === accountId);
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

  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      setError("Enter a category name");
      return;
    }
    setSavingCategory(true);
    setError("");
    try {
      const category = await apiCall<Category>("/v1/categories", {
        method: "POST",
        body: {
          name,
          categoryGroup: categoryGroupForEntryKind(formData.entryKind),
        },
      });
      if (!category) throw new Error("Could not create category");
      setCategories((current) => [...current, category]);
      setFormData((current) => ({ ...current, categoryId: category.id }));
      setNewCategoryName("");
      setCreatingCategory(false);
    } catch (categoryError) {
      setError(categoryError instanceof Error ? categoryError.message : "Could not create category");
    } finally {
      setSavingCategory(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session?.accessToken) {
      setError("Not authenticated");
      return;
    }
    if (sourceAccountRequired && !formData.accountId) {
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
      if (transactionFeeMinor < 0) {
        throw new Error("Transaction fee cannot be negative");
      }

      if (formData.entryKind === "investment_buy" && investmentMode === "bond_existing") {
        if (!formData.assetId) throw new Error("Select an existing government bond");
        const purchaseFeeMinor = toMinor(newInvestment.purchaseFee);
        if (purchaseFeeMinor < 0) throw new Error("Purchase fee cannot be negative");
        await apiCall(`/v1/bonds/${formData.assetId}/purchases`, {
          method: "POST",
          body: {
            cashAccountId: historicalBackfill ? undefined : formData.accountId,
            principalMinor: amountMinor,
            purchaseFeeMinor,
            purchaseDate: formData.transactionDate,
            note: formData.note.trim() || undefined,
            historicalBackfill: historicalBackfill || undefined,
          },
        });
      } else if (formData.entryKind === "investment_buy" && investmentMode === "bond") {
        const couponRate = Number.parseFloat(newInvestment.couponRate);
        const purchaseFeeMinor = toMinor(newInvestment.purchaseFee);
        const termYears = Number.parseInt(newInvestment.termYears, 10);
        if (!newInvestment.name.trim()) throw new Error("Enter a bond name");
        if (!Number.isFinite(couponRate) || couponRate < 0) throw new Error("Enter a valid coupon rate");
        if (!Number.isInteger(termYears) || termYears <= 0) throw new Error("Enter a valid bond term");
        if (purchaseFeeMinor < 0) throw new Error("Purchase fee cannot be negative");
        await apiCall("/v1/bonds", {
          method: "POST",
          body: {
            name: newInvestment.name.trim(),
            symbol: newInvestment.symbol.trim() || undefined,
            currency: formData.currency,
            cashAccountId: historicalBackfill ? undefined : formData.accountId,
            principalMinor: amountMinor,
            purchaseFeeMinor,
            couponRateBps: Math.round(couponRate * 100),
            issueDate: newInvestment.issueDate,
            maturityDate: newInvestment.maturityDate,
            couponFrequencyPerYear: Number.parseInt(newInvestment.couponFrequency, 10),
            reinvestmentCutoffDate: newInvestment.reinvestmentCutoffDate,
            historicalBackfill: historicalBackfill || undefined,
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
            transactionFeeMinor: transactionFeeMinor || undefined,
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
            transactionFeeMinor: transactionFeeMinor || undefined,
            currency: formData.currency,
            transactionDate: formData.transactionDate,
            note: formData.note || undefined,
          },
        });
      } else if (formData.entryKind === "loan_receivable_advance") {
        const counterpartyName = formData.counterpartyName.trim();
        if (!counterpartyName) throw new Error("Enter the person or loan name");

        const receivableName = `Loan to ${counterpartyName}`;
        let receivableAccount = receivableAccounts.find(
          (account) =>
            account.currency === formData.currency &&
            account.name.toLocaleLowerCase() === receivableName.toLocaleLowerCase(),
        );
        let createdReceivableId = "";

        if (!receivableAccount) {
          receivableAccount = await apiCall<Account>("/v1/accounts", {
            method: "POST",
            body: {
              name: receivableName,
              accountType: "receivable",
              accountClass: "asset",
              currency: formData.currency,
              openingBalanceMinor: 0,
            },
          });
          createdReceivableId = receivableAccount?.id ?? "";
        }
        if (!receivableAccount) throw new Error("Could not create the amount owed to you");

        try {
          await apiCall("/v1/transactions", {
            method: "POST",
            body: {
              transactionDate: formData.transactionDate,
              entryKind: "loan_receivable_advance",
              amount: amountMinor,
              transactionFee: transactionFeeMinor || undefined,
              currency: formData.currency,
              accountId: historicalBackfill ? undefined : formData.accountId,
              destinationAccountId: receivableAccount.id,
              note: formData.note || `Lent to ${counterpartyName}`,
              source: "manual",
              historicalBackfill: historicalBackfill || undefined,
            },
          });
        } catch (caught) {
          if (createdReceivableId) {
            await apiCall(`/v1/accounts/${createdReceivableId}`, { method: "DELETE" }).catch(() => undefined);
          }
          throw caught;
        }
      } else if (formData.entryKind === "loan_receivable_repayment") {
        if (!formData.receivableAccountId) throw new Error("Select who repaid you");
        const receivableAccount = receivableAccounts.find(
          (account) => account.id === formData.receivableAccountId,
        );
        if (!receivableAccount) throw new Error("The selected amount owed to you is unavailable");
        if (receivableAccount.currency !== formData.currency) {
          throw new Error("The repayment account must use the same currency");
        }

        await apiCall("/v1/transactions", {
          method: "POST",
          body: {
            transactionDate: formData.transactionDate,
            entryKind: "loan_receivable_repayment",
            amount: amountMinor,
            transactionFee: transactionFeeMinor || undefined,
            currency: formData.currency,
            accountId: receivableAccount.id,
            destinationAccountId: formData.accountId,
            note: formData.note || `Repayment from ${receivableAccount.name.replace(/^Loan to /, "")}`,
            source: "manual",
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
            accountId: historicalBackfill ? undefined : formData.accountId,
            destinationAccountId: formData.destinationAccountId || undefined,
            categoryId: showCategories ? formData.categoryId || undefined : undefined,
            businessId: showBusiness ? formData.businessId || undefined : undefined,
            assetId: formData.entryKind === "investment_buy" ? investmentAssetId || undefined : undefined,
            quantity: formData.entryKind === "investment_buy" ? quantity : undefined,
            unitPrice:
              formData.entryKind === "investment_buy" && unitPrice > 0
                ? unitPrice
                : undefined,
            fees: formData.entryKind === "investment_buy" && fees > 0 ? fees : undefined,
            transactionFee: formData.entryKind !== "investment_buy" && transactionFeeMinor > 0 ? transactionFeeMinor : undefined,
            note: formData.note || undefined,
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

      router.refresh();
      // Remembered only once the entry is actually recorded, so a failed or
      // abandoned attempt never changes what is offered next time.
      rememberAccountForEntryKind(formData.entryKind, formData.accountId);
      rememberFeeForAccount(feeAccountId, transactionFeeMinor);
      notifyEntriesChanged();
      onSaved?.();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Error creating entry");
    } finally {
      setLoading(false);
    }
  };

  const hasAccounts = accounts.length > 0;
  const selectedEntryType = entryTypeFor(formData.entryKind);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="add-entry-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className="m-auto max-h-[calc(100dvh-1rem)] w-[min(94vw,760px)] max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border border-outline bg-surface p-0 text-on-surface shadow-md backdrop:bg-overlay"
    >
      <div className="flex max-h-[calc(100dvh-1rem)] min-w-0 max-w-full flex-col overflow-hidden">
        <div className="mx-4 flex shrink-0 items-start justify-between gap-4 border-b border-outline py-4 sm:mx-6 sm:py-6">
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

        {!session || initializing ? <div className="p-4 py-8 text-sm text-on-surface-soft sm:p-6">Loading...</div> : null}

        {session && !initializing && !hasAccounts ? (
          <div className="grid gap-4 p-4 sm:p-6">
            <div className="rounded-lg border border-outline bg-surface-soft p-4">
              <strong className="block text-on-surface">No accounts configured yet</strong>
              <p className="mt-1 text-sm text-on-surface-soft">
                Add an account first so entries have somewhere to land.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Link href="/settings/accounts" className="btn btn-primary" onClick={onClose}>
                Go to Accounts
              </Link>
            </div>
          </div>
        ) : null}

        {session && !initializing && hasAccounts ? (
          <form className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col" onSubmit={handleSubmit}>
            <div
              className="grid min-h-0 min-w-0 max-w-full flex-1 gap-5 overflow-x-hidden overflow-y-auto p-4 sm:p-6"
              data-testid="add-entry-scroll-region"
            >
            <EntryTypePicker
              selected={selectedEntryType}
              onSelect={(item) => {
                setCreatingCategory(false);
                setNewCategoryName("");
                setFormData((current) => {
                  // Applied on choosing the kind rather than passively, so it
                  // replaces the arbitrary first-account default without ever
                  // overwriting an account the user has since picked.
                  const account = rememberedAccountFor(item.value);
                  return {
                    ...current,
                    entryKind: item.value,
                    categoryId: "",
                    ...(account ? { accountId: account.id, currency: account.currency } : {}),
                  };
                });
              }}
              onClear={() => {
                setCreatingCategory(false);
                setNewCategoryName("");
                setFormData((current) => ({ ...current, entryKind: "", categoryId: "" }));
              }}
            />

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
                <span className="sectionKicker">{isBondPurchase ? "Principal" : "Amount"}</span>
                <label htmlFor="amount" className="srOnlyLabel">
                  {isBondPurchase ? "Principal" : "Amount"}
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

              <div className={`${investmentMode === "bond" && formData.entryKind === "investment_buy" ? "" : "splitFields"} mt-5`}>
                {historicalBackfill ? (
                  <div className="rounded-md border border-primary/30 bg-primary-softer p-4">
                    <strong className="block text-sm text-on-surface">
                      Source account not required
                    </strong>
                    <span className="mt-1 block text-xs text-on-surface-soft">
                      {formData.entryKind === "investment_buy" && investmentMode === "bond"
                        ? "This past bond will not reduce any cash account. Coupons and maturity stay projected until you confirm one against an account."
                        : formData.entryKind === "loan_receivable_advance"
                          ? "This past loan will not reduce any current cash account. The amount owed to you will still be tracked."
                        : "This past entry will not reduce any cash account."}
                    </span>
                  </div>
                ) : (
                  <div className="field">
                    <label htmlFor="accountId">
                      {isDebtWorkflow ? "Cash account" : accountLabel}
                    </label>
                    <select
                      id="accountId"
                      name="accountId"
                      value={formData.accountId}
                      onChange={handleAccountChange}
                      required={sourceAccountRequired}
                    >
                      <option value="">Select an account</option>
                      {availableSourceAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {[account.name, account.accountType?.replaceAll("_", " "), account.currency].filter(Boolean).join(" · ")}
                        </option>
                      ))}
                    </select>
                    {formData.entryKind === "investment_buy" && availableSourceAccounts.length === 0 ? (
                      <span className="muted">
                        No {formData.currency} cash or bank account exists yet. <Link href="/settings/accounts">Create one in Settings</Link>.
                      </span>
                    ) : null}
                  </div>
                )}

                {formData.entryKind === "investment_buy" && investmentMode === "bond" ? null : (
                  <div className="field">
                    <label htmlFor="transactionDate">
                      {isStockPurchase ? "Purchase date" : "Date"}
                    </label>
                    <input
                      id="transactionDate"
                      name="transactionDate"
                      type="date"
                      value={formData.transactionDate}
                      onChange={handleChange}
                    />
                  </div>
                )}
              </div>

              {/* Asked after the account, because the fee depends on which
                  provider moved the money: a wallet charges, cash does not. */}
              {formData.entryKind !== "investment_buy" ? (
                <div className="field mt-5">
                  <label htmlFor="transactionFee">Transaction fee ({formData.currency})</label>
                  <input
                    id="transactionFee"
                    name="transactionFee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.transactionFee}
                    onChange={handleChange}
                  />

                  {/* Offered rather than prefilled: fees on an account are
                      often but not always the same, and a stale value written
                      without being noticed is worse than an empty field. */}
                  {feeSuggestions.length ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-on-surface-soft">Recently used</span>
                      {feeSuggestions.map((feeMinor) => (
                        <button
                          key={feeMinor}
                          type="button"
                          className="choiceChip"
                          onClick={() =>
                            setFormData((current) => ({
                              ...current,
                              transactionFee: (feeMinor / 100).toFixed(2),
                            }))
                          }
                        >
                          {formatMoney(feeMinor, formData.currency)}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <span className="muted">
                    Recorded separately under Transaction fees; the movement amount stays unchanged.
                  </span>
                </div>
              ) : null}

              {/* The figure that has to match a balance or an SMS alert is the
                  amount and the fee together, which nothing showed before. */}
              {amountMinor > 0 && transactionFeeMinor > 0 && formData.entryKind !== "investment_buy" ? (
                <p className="mt-4 rounded-md bg-surface-soft px-4 py-3 text-sm text-on-surface" aria-live="polite">
                  <strong className="font-semibold">{formatMoney(netEffectMinor, formData.currency)}</strong>
                  {movementIsIncoming ? " net into " : " leaves "}
                  {feeAccount ? feeAccount.name : "this account"}
                  <span className="text-on-surface-soft">
                    {" — "}
                    {formatMoney(amountMinor, formData.currency)}
                    {movementIsIncoming ? " less " : " plus "}
                    {formatMoney(transactionFeeMinor, formData.currency)} fee
                  </span>
                </p>
              ) : null}

              {historicalEligible ? (
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-outline bg-surface-soft p-4">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-primary"
                    checked={formData.historicalBackfill}
                    onChange={(event) =>
                      setFormData((current) => {
                        const destinationStillValid = historicalSavingsAccounts.some(
                          (account) => account.id === current.destinationAccountId,
                        );
                        return {
                          ...current,
                          historicalBackfill: event.target.checked,
                          destinationAccountId:
                            event.target.checked &&
                            current.entryKind === "saving_transfer" &&
                            !destinationStillValid
                              ? historicalSavingsAccounts[0]?.id ?? ""
                              : current.destinationAccountId,
                        };
                      })
                    }
                  />
                  <span>
                    <strong className="block text-sm text-on-surface">
                      Record as historical without a funding account
                    </strong>
                    <span className="mt-1 block text-xs text-on-surface-soft">
                      {formData.entryKind === "loan_receivable_advance"
                        ? "Available only for dates before today. Your current cash balance stays unchanged, while the amount still owed to you is recorded."
                        : "Available only for dates before today. This records what happened without changing the funding account balance, so you can backfill past years you have no account history for."}
                    </span>
                  </span>
                </label>
              ) : null}
            </div>
            ) : null}

            {formData.entryKind === "loan_receivable_advance" ? (
              <div className="formSectionCard">
                <div className="formSectionHeader">
                  <h2 className="formSectionTitle">Who owes you?</h2>
                  <span className="muted">
                    Expenses will create or reuse an asset balance for this person or loan.
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="counterpartyName">Person or loan name</label>
                  <input
                    id="counterpartyName"
                    name="counterpartyName"
                    value={formData.counterpartyName}
                    onChange={handleChange}
                    placeholder="e.g. John — school fees"
                    required
                  />
                </div>
              </div>
            ) : null}

            {formData.entryKind === "loan_receivable_repayment" ? (
              <div className="formSectionCard">
                <div className="formSectionHeader">
                  <h2 className="formSectionTitle">Amount owed to you</h2>
                  <span className="muted">Choose the person or loan whose balance should decrease.</span>
                </div>
                <div className="field">
                  <label htmlFor="receivableAccountId">Who repaid you?</label>
                  <select
                    id="receivableAccountId"
                    name="receivableAccountId"
                    value={formData.receivableAccountId}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select person or loan</option>
                    {receivableAccounts
                      .filter((account) => account.currency === formData.currency)
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name.replace(/^Loan to /, "")}
                        </option>
                      ))}
                  </select>
                </div>
                {receivableAccounts.length === 0 ? (
                  <p className="muted">Record “I lent someone money” first.</p>
                ) : null}
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
                  <Link href={"/loans" as Route} className="btn btn-ghost" onClick={onClose}>
                    Create a loan first
                  </Link>
                ) : null}
              </div>
            ) : null}

            {formData.entryKind === "saving_transfer" ? (
              <div className="formSectionCard">
                <div className="formSectionHeader">
                  <h2 className="formSectionTitle">
                    {historicalBackfill ? "Savings account" : "To account"}
                  </h2>
                  <span className="muted">
                    {historicalBackfill
                      ? "Choose the savings account that already held this money."
                      : "Choose another active account using the same currency."}
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="destinationAccountId">
                    {historicalBackfill ? "Savings account" : "To account"}
                  </label>
                  <select
                    id="destinationAccountId"
                    name="destinationAccountId"
                    value={formData.destinationAccountId}
                    onChange={handleChange}
                    required
                  >
                    <option value="">
                      {historicalBackfill ? "Select savings account" : "Select destination"}
                    </option>
                    {(historicalBackfill
                      ? historicalSavingsAccounts
                      : transferDestinationAccounts
                    ).map((account) => (
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
                    ["stock", "New stock"],
                    ["existing", "Existing stock"],
                    ["bond", "New government bond"],
                    ["bond_existing", "Existing government bond"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={investmentMode === value ? "entryTypeButton active" : "entryTypeButton"}
                      onClick={() => {
                        setInvestmentMode(value);
                        if (value === "existing") {
                          const stock = selectedStock ?? stockAssets[0];
                          setFormData((current) => ({
                            ...current,
                            assetId: stock?.id ?? "",
                            currency: stock?.currency ?? current.currency,
                          }));
                        } else if (value === "bond_existing") {
                          const bond = selectedBond ?? bonds[0];
                          setFormData((current) => ({
                            ...current,
                            assetId: bond?.assetId ?? "",
                            currency: bond?.currency ?? current.currency,
                          }));
                        }
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {investmentMode === "existing" ? (
                  <div className="field">
                    <label htmlFor="assetId">Stock</label>
                    <select
                      id="assetId"
                      name="assetId"
                      value={formData.assetId}
                      onChange={(event) => {
                        const stock = stockAssets.find((asset) => asset.id === event.target.value);
                        setFormData((current) => ({
                          ...current,
                          assetId: event.target.value,
                          currency: stock?.currency ?? current.currency,
                        }));
                      }}
                      required
                      disabled={stockAssets.length === 0}
                    >
                      <option value="">Select stock</option>
                      {stockAssets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name}{asset.symbol ? ` (${asset.symbol})` : ""} · {asset.currency}
                        </option>
                      ))}
                    </select>
                    {stockAssets.length === 0 ? (
                      <span className="muted">No stocks exist yet. Choose New stock to create your first holding.</span>
                    ) : (
                      <span className="muted">This purchase will be added as a new lot under the selected holding.</span>
                    )}
                  </div>
                ) : investmentMode === "bond_existing" ? (
                  <div className="field">
                    <label htmlFor="assetId">Government bond</label>
                    <select
                      id="assetId"
                      name="assetId"
                      value={formData.assetId}
                      onChange={(event) => {
                        const bond = bonds.find((item) => item.assetId === event.target.value);
                        setFormData((current) => ({
                          ...current,
                          assetId: event.target.value,
                          currency: bond?.currency ?? current.currency,
                        }));
                      }}
                      required
                      disabled={bonds.length === 0}
                    >
                      <option value="">Select bond</option>
                      {bonds.map((bond) => (
                        <option key={bond.assetId} value={bond.assetId}>
                          {bond.name}{bond.symbol ? ` (${bond.symbol})` : ""} · matures {bond.maturityDate} · {bond.currency}
                        </option>
                      ))}
                    </select>
                    {bonds.length === 0 ? (
                      <span className="muted">No government bonds exist yet. Choose New government bond to create your first holding.</span>
                    ) : (
                      <span className="muted">The additional principal will update this bond&apos;s future coupons and maturity value.</span>
                    )}
                  </div>
                ) : (
                  <>
                    {investmentMode === "stock" ? (
                      <div className="field">
                        <label htmlFor="listedStock">LuSE-listed stock (optional)</label>
                        <select
                          id="listedStock"
                          value={stockDirectory?.stocks.some((stock) => stock.ticker === newInvestment.symbol) ? newInvestment.symbol : ""}
                          onChange={(event) => {
                            const stock = stockDirectory?.stocks.find((item) => item.ticker === event.target.value);
                            if (!stock) return;
                            setNewInvestment((current) => ({
                              ...current,
                              name: stock.name,
                              symbol: stock.ticker,
                            }));
                            setFormData((current) => ({ ...current, currency: stock.currency }));
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
                      <label htmlFor="investmentName">{investmentMode === "bond" ? "Bond name" : "Company or fund name"}</label>
                      <input id="investmentName" value={newInvestment.name} onChange={(event) => setNewInvestment((current) => ({ ...current, name: event.target.value }))} required />
                    </div>
                  </>
                )}

                {investmentMode === "stock" || investmentMode === "bond" ? <div className="field">
                  <label htmlFor="investmentSymbol">{investmentMode === "bond" ? "Bond code (optional)" : "Ticker symbol (optional)"}</label>
                  <input id="investmentSymbol" value={newInvestment.symbol} onChange={(event) => setNewInvestment((current) => ({ ...current, symbol: event.target.value.toUpperCase() }))} />
                </div> : null}

                {investmentMode === "existing" || investmentMode === "stock" ? <>
                  <div className="splitFields">
                    <div className="field"><label htmlFor="quantity">Shares purchased</label><input id="quantity" name="quantity" type="number" min="0" step="0.000001" value={formData.quantity} onChange={handleChange} required /></div>
                    <div className="field"><label htmlFor="unitPrice">Price per share ({formData.currency})</label><input id="unitPrice" name="unitPrice" type="number" min="0" step="0.01" value={formData.unitPrice} onChange={handleChange} required /></div>
                  </div>
                  <div className="field"><label htmlFor="fees">Broker fees ({formData.currency})</label><input id="fees" name="fees" type="number" min="0" step="0.01" value={formData.fees} onChange={handleChange} /><span className="muted">Included automatically in the total purchase cost.</span></div>
                </> : investmentMode === "bond_existing" ? (
                  <div className="field">
                    <label htmlFor="purchaseFee">Purchase charge / fee ({formData.currency})</label>
                    <input id="purchaseFee" type="number" min="0" step="0.01" value={newInvestment.purchaseFee} onChange={(event) => setNewInvestment((current) => ({ ...current, purchaseFee: event.target.value }))} />
                    <span className="muted">Total deducted: {formatMoney(toMinor(formData.amount) + bondPurchaseFeeMinor, formData.currency)}</span>
                  </div>
                ) : <>
                  <div className="splitFields">
                    <div className="field"><label htmlFor="couponRate">Annual coupon rate (%)</label><input id="couponRate" type="number" min="0" step="0.01" value={newInvestment.couponRate} onChange={(event) => setNewInvestment((current) => ({ ...current, couponRate: event.target.value }))} required /></div>
                    <div className="field"><label htmlFor="couponFrequency">Coupon frequency</label><select id="couponFrequency" value={newInvestment.couponFrequency} onChange={(event) => setNewInvestment((current) => ({ ...current, couponFrequency: event.target.value }))}><option value="1">Annually</option><option value="2">Semi-annually</option><option value="4">Quarterly</option><option value="12">Monthly</option></select></div>
                  </div>
                  <div className="splitFields">
                    <div className="field">
                      <label htmlFor="issueDate">Issue date</label>
                      <input
                        id="issueDate"
                        type="date"
                        value={newInvestment.issueDate}
                        onChange={(event) =>
                          setNewInvestment((current) => {
                            const maturityDate = addYearsToDate(
                              event.target.value,
                              Number.parseInt(current.termYears, 10),
                            );
                            return {
                              ...current,
                              issueDate: event.target.value,
                              maturityDate,
                              reinvestmentCutoffDate:
                                current.reinvestmentCutoffDate === current.maturityDate
                                  ? maturityDate
                                  : current.reinvestmentCutoffDate,
                            };
                          })
                        }
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="termYears">Term (years)</label>
                      <input
                        id="termYears"
                        type="number"
                        min="1"
                        step="1"
                        value={newInvestment.termYears}
                        onChange={(event) =>
                          setNewInvestment((current) => {
                            const maturityDate = addYearsToDate(
                              current.issueDate,
                              Number.parseInt(event.target.value, 10),
                            );
                            return {
                              ...current,
                              termYears: event.target.value,
                              maturityDate,
                              reinvestmentCutoffDate:
                                current.reinvestmentCutoffDate === current.maturityDate
                                  ? maturityDate
                                  : current.reinvestmentCutoffDate,
                            };
                          })
                        }
                        required
                      />
                    </div>
                  </div>
                  <div className="splitFields">
                    <div className="field">
                      <label htmlFor="maturityDate">Maturity date</label>
                      <input id="maturityDate" type="date" min={newInvestment.issueDate} value={newInvestment.maturityDate} readOnly required />
                      <span className="muted">Calculated from the issue date and term.</span>
                    </div>
                    <div className="field">
                      <label htmlFor="purchaseFee">Purchase charge / fee</label>
                      <input id="purchaseFee" type="number" min="0" step="0.01" value={newInvestment.purchaseFee} onChange={(event) => setNewInvestment((current) => ({ ...current, purchaseFee: event.target.value }))} />
                      <span className="muted">
                        Total deducted: {formatMoney(toMinor(formData.amount) + bondPurchaseFeeMinor, formData.currency)}
                      </span>
                    </div>
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

                <div className="field">
                  <label htmlFor="categoryId">Choose category</label>
                  <select
                    id="categoryId"
                    name="categoryId"
                    value={formData.categoryId}
                    onChange={handleChange}
                  >
                    <option value="">No category</option>
                    {filteredCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.path}
                      </option>
                    ))}
                  </select>
                  <span className="muted">
                    {filteredCategories.length
                      ? "Choose the label that best describes this entry."
                      : "No categories yet. Add one here if you want to classify this entry."}
                  </span>
                </div>

                {creatingCategory ? (
                  <div className="field rounded-md border border-outline bg-surface-soft p-4">
                    <label htmlFor="newCategoryName">New category</label>
                    <input
                      id="newCategoryName"
                      value={newCategoryName}
                      placeholder={formData.entryKind === "income_earned" ? "e.g. Salary" : "e.g. Transport"}
                      onChange={(event) => setNewCategoryName(event.target.value)}
                      autoFocus
                    />
                    <div className="formActions">
                      <button type="button" className="btn btn-primary" disabled={savingCategory} onClick={() => void createCategory()}>
                        {savingCategory ? "Creating..." : "Create category"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={savingCategory}
                        onClick={() => {
                          setCreatingCategory(false);
                          setNewCategoryName("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="btn btn-ghost justify-self-start" onClick={() => setCreatingCategory(true)}>
                    + Add category
                  </button>
                )}
              </div>
            ) : null}

            {formData.entryKind ? <div className="formSectionCard">
              <div className="formSectionHeader">
                <h2 className="formSectionTitle">Context</h2>
                <span className="muted">Add the details you will want later.</span>
              </div>

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
                    <span className="muted">
                      Optional. Link this entry to a business to report on it separately.
                    </span>
                  </div>
                ) : null}

                {/* Currency follows the account the money moves through and is
                    not chosen separately: balances match a transaction to its
                    account on currency, so an entry in any other currency is
                    stored and listed but counts toward no balance. Shown as a
                    read-only fact so the entry still says which currency it is
                    in. */}
                <div className="field">
                  <span className="field-label" id="currencyLabel">Currency</span>
                  <p
                    className="control flex items-center"
                    role="note"
                    aria-labelledby="currencyLabel"
                  >
                    {formData.currency}
                  </p>
                  <span className="muted">
                    {formData.entryKind === "investment_buy" && (investmentMode === "existing" || investmentMode === "bond_existing")
                      ? `Uses the selected ${investmentMode === "existing" ? "stock" : "bond"}'s currency.`
                      : "Taken from the account above. To record money in another currency, choose an account that holds it."}
                  </span>
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
            </div>

            {formData.entryKind ? <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-outline bg-surface px-4 py-3 sm:px-6">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  loading ||
                  (sourceAccountRequired && availableSourceAccounts.length === 0) ||
                  (formData.entryKind === "investment_buy" && investmentMode === "existing" && stockAssets.length === 0) ||
                  (formData.entryKind === "investment_buy" && investmentMode === "bond_existing" && bonds.length === 0)
                }
              >
                {loading ? "Saving..." : "Save entry"}
              </button>
            </div> : null}
          </form>
        ) : null}
      </div>
    </dialog>
  );
}
