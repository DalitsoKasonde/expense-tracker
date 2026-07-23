"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useApiCall } from "@/lib/client-api";
import { primeUserCurrency } from "@/lib/use-user-currency";

type AccountType = "cash" | "mobile_money" | "bank" | "savings" | "investment" | "other";

type AccountDraft = {
  localId: number;
  name: string;
  accountType: AccountType;
  openingBalance: string;
};

type OnboardingStatus = {
  completed: boolean;
  interests: string[];
  accountsCreated?: number;
};

type OnboardingDraft = {
  version: 1;
  step: number;
  currency: string;
  accounts: AccountDraft[];
  interests: string[];
};

const currencies = ["ZMW", "USD", "GBP", "EUR", "ZAR"];
const accountTypes: Array<{ value: AccountType; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "bank", label: "Bank account" },
  { value: "savings", label: "Savings account" },
  { value: "investment", label: "Investment account" },
  { value: "other", label: "Other" },
];
const accountPresets: Array<{ name: string; accountType: AccountType }> = [
  { name: "Airtel Money", accountType: "mobile_money" },
  { name: "MTN MoMo", accountType: "mobile_money" },
  { name: "Cash", accountType: "cash" },
  { name: "Main bank", accountType: "bank" },
  { name: "Savings", accountType: "savings" },
];
const interestOptions = [
  { value: "loans", label: "Loans" },
  { value: "stocks", label: "Stocks" },
  { value: "bonds", label: "Government bonds" },
];

function emptyAccount(localId = 1): AccountDraft {
  return { localId, name: "", accountType: "mobile_money", openingBalance: "" };
}

function parseOpeningBalance(value: string) {
  const normalized = value.trim();
  if (!normalized) return 0;
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Balances must be numbers with no more than two decimal places.");
  }
  const minor = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(minor)) {
    throw new Error("One of the opening balances is too large.");
  }
  return minor;
}

function formatDraftBalance(value: string, currency: string) {
  const amount = Number.parseFloat(value || "0");
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function isSavedDraft(value: unknown): value is OnboardingDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<OnboardingDraft>;
  return draft.version === 1
    && typeof draft.step === "number"
    && typeof draft.currency === "string"
    && Array.isArray(draft.accounts)
    && Array.isArray(draft.interests);
}

export default function OnboardingPage() {
  const { data: session, status: sessionStatus } = useSession();
  const apiCall = useApiCall();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [currency, setCurrency] = useState("ZMW");
  const [accounts, setAccounts] = useState<AccountDraft[]>([emptyAccount()]);
  const [interests, setInterests] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState("");
  const draftKey = session?.user?.id ? `chuma:onboarding:${session.user.id}` : "";

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !session?.accessToken || !draftKey) {
      if (sessionStatus !== "loading") setChecking(false);
      return;
    }

    const saved = window.localStorage.getItem(draftKey);
    if (saved) {
      try {
        const parsed: unknown = JSON.parse(saved);
        if (isSavedDraft(parsed)) {
          setStep(Math.min(3, Math.max(1, parsed.step)));
          setCurrency(parsed.currency);
          setAccounts(parsed.accounts.length ? parsed.accounts : [emptyAccount()]);
          setInterests(parsed.interests);
        }
      } catch {
        window.localStorage.removeItem(draftKey);
      }
    }

    let ignore = false;
    void apiCall<OnboardingStatus>("/v1/onboarding/status")
      .then((onboarding) => {
        if (ignore) return;
        if (onboarding.completed) {
          window.localStorage.removeItem(draftKey);
          router.replace("/today");
          return;
        }
        setHydrated(true);
        setChecking(false);
      })
      .catch((caught) => {
        if (ignore) return;
        setError(caught instanceof Error ? caught.message : "Could not load your setup.");
        setChecking(false);
      });

    return () => {
      ignore = true;
    };
  }, [apiCall, draftKey, router, session?.accessToken, sessionStatus]);

  useEffect(() => {
    if (!hydrated || !draftKey || step > 3) return;
    const draft: OnboardingDraft = {
      version: 1,
      step,
      currency,
      accounts,
      interests,
    };
    window.localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [accounts, currency, draftKey, hydrated, interests, step]);

  const namedAccounts = useMemo(
    () => accounts.filter((account) => account.name.trim()),
    [accounts],
  );

  function updateAccount(localId: number, change: Partial<AccountDraft>) {
    setError("");
    setAccounts((current) => current.map(
      (account) => account.localId === localId ? { ...account, ...change } : account,
    ));
  }

  function addPreset(name: string, accountType: AccountType) {
    setError("");
    setAccounts((current) => {
      if (current.some((account) => account.name.trim().toLowerCase() === name.toLowerCase())) {
        return current;
      }
      if (current.length === 1 && !current[0]?.name.trim()) {
        return [{ ...current[0], name, accountType }];
      }
      if (current.length >= 12) return current;
      return [...current, { localId: Date.now(), name, accountType, openingBalance: "" }];
    });
  }

  function addBlankAccount() {
    if (accounts.length >= 12) {
      setError("You can add up to 12 accounts during setup. Add more later in Settings.");
      return;
    }
    setAccounts((current) => [...current, emptyAccount(Date.now())]);
  }

  function continueFromAccounts() {
    setError("");
    if (!namedAccounts.length) {
      setError("Add at least one place where you keep money.");
      return;
    }
    if (accounts.some((account) => !account.name.trim())) {
      setError("Name or remove each unfinished account before continuing.");
      return;
    }
    const uniqueNames = new Set(namedAccounts.map((account) => account.name.trim().toLowerCase()));
    if (uniqueNames.size !== namedAccounts.length) {
      setError("Give each account a different name.");
      return;
    }
    try {
      namedAccounts.forEach((account) => parseOpeningBalance(account.openingBalance));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check the opening balances.");
      return;
    }
    setStep(3);
  }

  function toggleInterest(interest: string) {
    setInterests((current) => current.includes(interest)
      ? current.filter((item) => item !== interest)
      : [...current, interest]);
  }

  async function finishSetup() {
    setSaving(true);
    setError("");
    try {
      const response = await apiCall<OnboardingStatus>("/v1/onboarding/complete", {
        method: "POST",
        body: {
          defaultCurrency: currency,
          accounts: namedAccounts.map((account) => ({
            name: account.name.trim(),
            accountType: account.accountType,
            openingBalanceMinor: parseOpeningBalance(account.openingBalance),
          })),
          interests,
        },
      });
      setInterests(response.interests ?? interests);
      primeUserCurrency(currency);
      if (draftKey) window.localStorage.removeItem(draftKey);
      setStep(4);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.trim() : "Could not finish setup.");
    } finally {
      setSaving(false);
    }
  }

  if (sessionStatus === "loading" || checking) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-on-surface-soft">
        Loading your setup...
      </main>
    );
  }

  if (sessionStatus === "unauthenticated" || !session) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <section className="card grid max-w-md gap-4 text-center">
          <h1 className="text-2xl font-semibold text-on-surface">Sign in to continue</h1>
          <p className="text-on-surface-soft">Your setup is tied to your Chuma account.</p>
          <Link href="/login" className="primaryButton justify-center">Go to sign in</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <section className="mx-auto grid w-full max-w-3xl gap-6 rounded-lg border border-outline bg-surface p-5 shadow-md sm:p-8">
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-4">
            <strong className="text-2xl text-primary">Chuma</strong>
            {step <= 3 ? (
              <span className="text-sm font-semibold text-on-surface-soft">Step {step} of 3</span>
            ) : null}
          </div>
          {step <= 3 ? (
            <div
              className="h-1.5 overflow-hidden rounded-full bg-surface-soft"
              role="progressbar"
              aria-label="Setup progress"
              aria-valuemin={1}
              aria-valuemax={3}
              aria-valuenow={step}
            >
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
          ) : null}
        </div>

        {step === 1 ? (
          <section className="grid gap-5" aria-labelledby="currency-heading">
            <div>
              <p className="text-sm font-semibold text-accent">Welcome to Chuma</p>
              <h1 id="currency-heading" className="mt-1 text-3xl font-semibold text-on-surface">
                Start with your everyday currency
              </h1>
              <p className="mt-2 text-on-surface-soft">
                Chuma uses this for your main dashboard. Individual investments can still use other currencies.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Default currency">
              {currencies.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={currency === item}
                  className={currency === item ? "entryTypeButton active" : "entryTypeButton"}
                  onClick={() => {
                    setCurrency(item);
                    setError("");
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="grid gap-5" aria-labelledby="accounts-heading">
            <div>
              <p className="text-sm font-semibold text-accent">Your starting point</p>
              <h1 id="accounts-heading" className="mt-1 text-3xl font-semibold text-on-surface">
                Where is your money today?
              </h1>
              <p className="mt-2 text-on-surface-soft">
                Add the places you use and, optionally, their current balances. You can change everything later.
              </p>
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-semibold text-on-surface">Quick add</span>
              <div className="flex flex-wrap gap-2">
                {accountPresets.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    className="ghostButton"
                    onClick={() => addPreset(preset.name, preset.accountType)}
                  >
                    + {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              {accounts.map((account, index) => (
                <div
                  key={account.localId}
                  className="grid gap-3 rounded-lg border border-outline bg-surface-soft p-4 md:grid-cols-[minmax(0,1fr)_170px_170px_auto]"
                >
                  <div className="field">
                    <label htmlFor={`account-name-${account.localId}`}>Account name</label>
                    <input
                      id={`account-name-${account.localId}`}
                      value={account.name}
                      placeholder={index === 0 ? "e.g. Airtel Money" : "e.g. Main bank"}
                      onChange={(event) => updateAccount(account.localId, { name: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`account-type-${account.localId}`}>Type</label>
                    <select
                      id={`account-type-${account.localId}`}
                      value={account.accountType}
                      onChange={(event) => updateAccount(account.localId, {
                        accountType: event.target.value as AccountType,
                      })}
                    >
                      {accountTypes.map((type) => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`account-balance-${account.localId}`}>Balance now</label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-on-surface-soft">{currency}</span>
                      <input
                        id={`account-balance-${account.localId}`}
                        aria-label={`${account.name || "Account"} opening balance`}
                        inputMode="decimal"
                        placeholder="0.00"
                        value={account.openingBalance}
                        onChange={(event) => updateAccount(account.localId, {
                          openingBalance: event.target.value,
                        })}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ghostButton self-end"
                    aria-label={`Remove ${account.name || "account"}`}
                    onClick={() => {
                      setAccounts((current) => current.length === 1
                        ? [emptyAccount(current[0]?.localId)]
                        : current.filter((item) => item.localId !== account.localId));
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" className="ghostButton" onClick={addBlankAccount}>
                + Add another account
              </button>
              <span className="text-xs text-on-surface-soft">
                Balances are optional. Use a minus sign only for an overdrawn account.
              </span>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="grid gap-6" aria-labelledby="other-heading">
            <div>
              <p className="text-sm font-semibold text-accent">Personalize your next steps</p>
              <h1 id="other-heading" className="mt-1 text-3xl font-semibold text-on-surface">
                What else would you like to track?
              </h1>
              <p className="mt-2 text-on-surface-soft">
                This is optional. Your choices create a useful checklist after setup.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {interestOptions.map((option) => {
                const selected = interests.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    className={selected ? "entryTypeButton active" : "entryTypeButton"}
                    onClick={() => toggleInterest(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="rounded-lg border border-outline bg-surface-soft p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Review</p>
                  <h2 className="mt-1 text-lg font-semibold text-on-surface">
                    {namedAccounts.length} {namedAccounts.length === 1 ? "account" : "accounts"} in {currency}
                  </h2>
                </div>
                <button type="button" className="ghostButton" onClick={() => setStep(2)}>Edit accounts</button>
              </div>
              <ul className="mt-3 divide-y divide-outline">
                {namedAccounts.map((account) => (
                  <li key={account.localId} className="flex items-center justify-between gap-4 py-2 text-sm">
                    <span className="font-semibold text-on-surface">{account.name}</span>
                    <span className="text-on-surface-soft">
                      {formatDraftBalance(account.openingBalance, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="grid gap-5" aria-labelledby="ready-heading">
            <div>
              <p className="text-sm font-semibold text-positive">Setup complete</p>
              <h1 id="ready-heading" className="mt-1 text-3xl font-semibold text-on-surface">
                Your workspace is ready
              </h1>
              <p className="mt-2 text-on-surface-soft">
                Add one real transaction first. The other items can wait until you need them.
              </p>
            </div>
            <Link
              href="/add"
              className="rounded-lg border-2 border-primary bg-primary-softer p-5 text-lg font-semibold text-primary hover:bg-primary-soft"
            >
              Add your first transaction
            </Link>
            <div className="grid gap-3 sm:grid-cols-2">
              {(interests.includes("stocks") || interests.includes("bonds")) ? (
                <Link
                  href="/investments/add"
                  className="rounded-lg border border-outline bg-surface-soft p-4 font-semibold text-on-surface hover:border-outline-strong"
                >
                  Add your first {interests.includes("stocks") && interests.includes("bonds")
                    ? "investment"
                    : interests.includes("bonds") ? "government bond" : "stock"}
                </Link>
              ) : null}
              {interests.includes("loans") ? (
                <Link
                  href="/loans"
                  className="rounded-lg border border-outline bg-surface-soft p-4 font-semibold text-on-surface hover:border-outline-strong"
                >
                  Add your first loan
                </Link>
              ) : null}
            </div>
            <button
              type="button"
              className="ghostButton justify-self-start"
              onClick={() => {
                router.push("/today");
                router.refresh();
              }}
            >
              Go to Home
            </button>
          </section>
        ) : null}

        {error ? (
          <div role="alert" className="rounded-md bg-negative-soft p-3 text-sm text-negative">
            <p>{error}</p>
            {!hydrated && step <= 3 ? (
              <button
                type="button"
                className="mt-2 font-semibold underline"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}

        {step <= 3 ? (
          <div className="flex items-center justify-between gap-3 border-t border-outline pt-5">
            <button
              type="button"
              className="ghostButton"
              disabled={step === 1 || saving}
              onClick={() => {
                setError("");
                setStep((current) => Math.max(1, current - 1));
              }}
            >
              Back
            </button>
            {step === 1 ? (
              <button type="button" className="primaryButton" onClick={() => setStep(2)}>
                Continue
              </button>
            ) : null}
            {step === 2 ? (
              <button type="button" className="primaryButton" onClick={continueFromAccounts}>
                Review setup
              </button>
            ) : null}
            {step === 3 ? (
              <button
                type="button"
                className="primaryButton"
                disabled={saving}
                onClick={() => void finishSetup()}
              >
                {saving ? "Creating your workspace..." : "Finish setup"}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
