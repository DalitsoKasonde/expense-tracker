"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useApiCall } from "@/lib/client-api";
import { isApiNotFound } from "@/lib/api-error";
import { primeUserCurrency } from "@/lib/use-user-currency";
import { Brand } from "@/components/brand";

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
  version: 2;
  step: number;
  currency: string;
  accounts: AccountDraft[];
  interests: string[];
};

type Preferences = {
  defaultCurrency: string;
  theme: "light" | "dark";
  notificationsEnabled: boolean;
};

type ExistingAccount = {
  name: string;
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

function emptyAccount(localId = Date.now()): AccountDraft {
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

function isSavedDraft(value: unknown): value is OnboardingDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<OnboardingDraft>;
  return draft.version === 2
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
  const [accounts, setAccounts] = useState<AccountDraft[]>([]);
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
          setStep(Math.min(2, Math.max(1, parsed.step)));
          setCurrency(parsed.currency);
          setAccounts(parsed.accounts);
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
      .catch(async (caught) => {
        if (ignore) return;
        if (isApiNotFound(caught)) {
          try {
            const existing = await apiCall<ExistingAccount[] | null>("/v1/accounts");
            if (ignore) return;
            if (Array.isArray(existing) && existing.length) {
              window.localStorage.removeItem(draftKey);
              router.replace("/today");
              return;
            }
            setHydrated(true);
            setChecking(false);
            return;
          } catch (fallbackError) {
            caught = fallbackError;
          }
        }
        setError(caught instanceof Error ? caught.message : "Could not load your setup.");
        setChecking(false);
      });

    return () => {
      ignore = true;
    };
  }, [apiCall, draftKey, router, session?.accessToken, sessionStatus]);

  useEffect(() => {
    if (!hydrated || !draftKey || step > 2) return;
    const draft: OnboardingDraft = {
      version: 2,
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

  function togglePreset(name: string, accountType: AccountType) {
    setError("");
    setAccounts((current) => {
      const existing = current.find((account) => account.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        return current.filter((account) => account.localId !== existing.localId);
      }
      return [...current, { localId: Date.now(), name, accountType, openingBalance: "" }];
    });
  }

  function addCustomAccount() {
    if (accounts.length >= 12) {
      setError("You can add up to 12 accounts during setup. Add more later in Settings.");
      return;
    }
    setAccounts((current) => [...current, emptyAccount()]);
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
      const uniqueNames = new Set(namedAccounts.map((account) => account.name.trim().toLowerCase()));
      if (uniqueNames.size !== namedAccounts.length) {
        throw new Error("Give each account a different name.");
      }
      const completionBody = {
        defaultCurrency: currency,
        accounts: namedAccounts.map((account) => ({
          name: account.name.trim(),
          accountType: account.accountType,
          openingBalanceMinor: parseOpeningBalance(account.openingBalance),
        })),
        interests,
      };
      let response: OnboardingStatus;
      try {
        response = await apiCall<OnboardingStatus>("/v1/onboarding/complete", {
          method: "POST",
          body: completionBody,
        });
      } catch (caught) {
        if (!isApiNotFound(caught)) throw caught;
        response = await completeWithLegacyApi(completionBody);
      }
      setInterests(response.interests ?? interests);
      primeUserCurrency(currency);
      if (draftKey) window.localStorage.removeItem(draftKey);
      setStep(3);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.trim() : "Could not finish setup.");
    } finally {
      setSaving(false);
    }
  }

  async function completeWithLegacyApi(body: {
    defaultCurrency: string;
    accounts: Array<{
      name: string;
      accountType: AccountType;
      openingBalanceMinor: number;
    }>;
    interests: string[];
  }): Promise<OnboardingStatus> {
    const currentPreferences = await apiCall<Preferences>("/v1/user/preferences").catch(() => ({
      defaultCurrency: body.defaultCurrency,
      theme: "light" as const,
      notificationsEnabled: false,
    }));
    await apiCall("/v1/user/preferences", {
      method: "PATCH",
      body: {
        defaultCurrency: body.defaultCurrency,
        theme: currentPreferences.theme,
        notificationsEnabled: currentPreferences.notificationsEnabled,
      },
    });

    const existing = await apiCall<ExistingAccount[] | null>("/v1/accounts").catch(() => []);
    const existingNames = new Set((existing ?? []).map((account) => account.name.trim().toLowerCase()));
    for (const account of body.accounts) {
      if (existingNames.has(account.name.toLowerCase())) continue;
      await apiCall("/v1/accounts", {
        method: "POST",
        body: {
          ...account,
          accountClass: "asset",
          currency: body.defaultCurrency,
        },
      });
    }

    return { completed: true, interests: body.interests, accountsCreated: body.accounts.length };
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
          <p className="text-on-surface-soft">Your setup is tied to your Expenses account.</p>
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
            <Brand compact priority />
            {step <= 2 ? (
              <span className="text-sm font-semibold text-on-surface-soft">Step {step} of 2</span>
            ) : null}
          </div>
          {step <= 2 ? (
            <div
              className="h-1.5 overflow-hidden rounded-full bg-surface-soft"
              role="progressbar"
              aria-label="Setup progress"
              aria-valuemin={1}
              aria-valuemax={2}
              aria-valuenow={step}
            >
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{ width: `${(step / 2) * 100}%` }}
              />
            </div>
          ) : null}
        </div>

        {step === 1 ? (
          <section className="grid gap-5" aria-labelledby="currency-heading">
            <div>
              <p className="text-sm font-semibold text-accent">Welcome to Expenses</p>
              <h1 id="currency-heading" className="mt-1 text-3xl font-semibold text-on-surface">
                Start with your everyday currency
              </h1>
              <p className="mt-2 text-on-surface-soft">
                Expenses uses this for your main dashboard. Individual investments can still use other currencies.
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
              <p className="text-sm font-semibold text-accent">Optional shortcuts</p>
              <h1 id="accounts-heading" className="mt-1 text-3xl font-semibold text-on-surface">
                Make Expenses useful from day one
              </h1>
              <p className="mt-2 text-on-surface-soft">
                Tap any accounts you use, or skip this and add them later. Detailed balances can wait.
              </p>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-on-surface">Starting accounts</span>
                <span className="text-xs text-on-surface-soft">
                  {namedAccounts.length ? `${namedAccounts.length} selected` : "None selected"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {accountPresets.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    aria-pressed={namedAccounts.some((account) => account.name === preset.name)}
                    className={namedAccounts.some((account) => account.name === preset.name)
                      ? "entryTypeButton active"
                      : "entryTypeButton"}
                    onClick={() => togglePreset(preset.name, preset.accountType)}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
              <p className="text-xs text-on-surface-soft">
                Each selected account starts at {currency} 0.00. Open the optional details only if you want to change that now.
              </p>
              <details className="mt-2 rounded-lg border border-outline bg-surface-soft">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-on-surface">
                  Edit account details or add a custom account
                  <span className="ml-2 font-normal text-on-surface-soft">(optional)</span>
                </summary>
                <div className="grid gap-4 border-t border-outline p-4">
                  {accounts.map((account, index) => (
                    <div
                      key={account.localId}
                      className="grid gap-3 rounded-lg border border-outline bg-surface p-4 md:grid-cols-[minmax(0,1fr)_170px_170px_auto]"
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
                            aria-label={`${account.name || "Custom account"} opening balance`}
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
                        aria-label={`Remove ${account.name || "custom account"}`}
                        onClick={() => setAccounts((current) => current.filter(
                          (item) => item.localId !== account.localId,
                        ))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button type="button" className="ghostButton justify-self-start" onClick={addCustomAccount}>
                    + Add custom account
                  </button>
                  <p className="text-xs text-on-surface-soft">
                    Balances are optional. Use a minus sign only for an overdrawn account.
                  </p>
                </div>
              </details>
            </div>

            <div className="grid gap-3 border-t border-outline pt-5">
              <div>
                <h2 className="text-lg font-semibold text-on-surface">What else would you like to track?</h2>
                <p className="text-sm text-on-surface-soft">
                  Optional—these choices only tailor your next-step suggestions.
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
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="grid gap-5" aria-labelledby="ready-heading">
            <div>
              <p className="text-sm font-semibold text-positive">Setup complete</p>
              <h1 id="ready-heading" className="mt-1 text-3xl font-semibold text-on-surface">
                Your workspace is ready
              </h1>
              <p className="mt-2 text-on-surface-soft">
                {namedAccounts.length
                  ? "Add one real transaction first. The other items can wait until you need them."
                  : "Add an account when you are ready. Everything else can wait until you need it."}
              </p>
            </div>
            {namedAccounts.length ? (
              <Link
                href="/add"
                className="rounded-lg border-2 border-primary bg-primary-softer p-5 text-lg font-semibold text-primary hover:bg-primary-soft"
              >
                Add your first transaction
              </Link>
            ) : (
              <Link
                href="/settings/accounts"
                className="rounded-lg border-2 border-primary bg-primary-softer p-5 text-lg font-semibold text-primary hover:bg-primary-soft"
              >
                Add your first account
              </Link>
            )}
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
            {!hydrated && step <= 2 ? (
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

        {step <= 2 ? (
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
