"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useApiCall } from "@/lib/client-api";
import { primeUserCurrency } from "@/lib/use-user-currency";

type AccountDraft = {
  localId: number;
  name: string;
  accountType: "cash" | "mobile_money" | "bank" | "savings" | "investment" | "other";
  openingBalance: string;
};

type Preferences = {
  defaultCurrency: string;
  theme: "light" | "dark";
  notificationsEnabled: boolean;
};

const currencies = ["ZMW", "USD", "GBP", "EUR", "ZAR"];
const accountTypes: Array<{ value: AccountDraft["accountType"]; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "bank", label: "Bank account" },
  { value: "savings", label: "Savings account" },
  { value: "investment", label: "Investment account" },
  { value: "other", label: "Other" },
];

function toMinor(value: string) {
  return Math.round((Number.parseFloat(value || "0") || 0) * 100);
}

export default function OnboardingPage() {
  const { data: session } = useSession();
  const apiCall = useApiCall();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [currency, setCurrency] = useState("ZMW");
  const [accounts, setAccounts] = useState<AccountDraft[]>([
    { localId: 1, name: "", accountType: "mobile_money", openingBalance: "" },
  ]);
  const [hasLoans, setHasLoans] = useState(false);
  const [hasStocks, setHasStocks] = useState(false);
  const [hasBonds, setHasBonds] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session?.accessToken) return;
    void apiCall<Array<{ id: string }>>("/v1/accounts")
      .then((existing) => {
        if (existing?.length) router.replace("/today");
      })
      .catch(() => undefined);
  }, [apiCall, router, session?.accessToken]);

  function updateAccount(localId: number, change: Partial<AccountDraft>) {
    setAccounts((current) => current.map((account) => account.localId === localId ? { ...account, ...change } : account));
  }

  function nextStep() {
    setError("");
    if (step === 2 && !accounts.some((account) => account.name.trim())) {
      setError("Add at least one place where you keep money.");
      return;
    }
    setStep((current) => Math.min(4, current + 1));
  }

  async function finishSetup() {
    const accountsToCreate = accounts.filter((account) => account.name.trim());
    if (accountsToCreate.length === 0) {
      setError("Add at least one account before finishing setup.");
      setStep(2);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const currentPreferences = await apiCall<Preferences>("/v1/user/preferences").catch(() => ({
        defaultCurrency: currency,
        theme: "light" as const,
        notificationsEnabled: false,
      }));
      await apiCall("/v1/user/preferences", {
        method: "PATCH",
        body: {
          defaultCurrency: currency,
          theme: currentPreferences.theme,
          notificationsEnabled: currentPreferences.notificationsEnabled,
        },
      });
      primeUserCurrency(currency);

      for (const account of accountsToCreate) {
        await apiCall("/v1/accounts", {
          method: "POST",
          body: {
            name: account.name.trim(),
            accountType: account.accountType,
            accountClass: "asset",
            currency,
            openingBalanceMinor: toMinor(account.openingBalance),
          },
        });
      }
      setStep(5);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not finish setup");
    } finally {
      setSaving(false);
    }
  }

  if (!session) return <main className="grid min-h-screen place-items-center bg-background p-6 text-on-surface-soft">Loading your setup...</main>;

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <section className="mx-auto grid w-full max-w-2xl gap-6 rounded-lg border border-outline bg-surface p-5 shadow-md sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <strong className="text-2xl text-primary">Chuma</strong>
          {step <= 4 ? <span className="text-sm font-semibold text-on-surface-soft">Step {step} of 4</span> : null}
        </div>

        {step === 1 ? <section className="grid gap-5" aria-labelledby="currency-heading">
          <div><p className="text-sm font-semibold text-accent">Your everyday money</p><h1 id="currency-heading" className="mt-1 text-3xl font-semibold text-on-surface">Which currency do you use most?</h1><p className="mt-2 text-on-surface-soft">This becomes your default. Investments can still use other currencies.</p></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {currencies.map((item) => <button key={item} type="button" className={currency === item ? "entryTypeButton active" : "entryTypeButton"} onClick={() => setCurrency(item)}>{item}</button>)}
          </div>
        </section> : null}

        {step === 2 ? <section className="grid gap-5" aria-labelledby="accounts-heading">
          <div><p className="text-sm font-semibold text-accent">Your accounts</p><h1 id="accounts-heading" className="mt-1 text-3xl font-semibold text-on-surface">Where do you keep money?</h1><p className="mt-2 text-on-surface-soft">Add only the places you actually use. You can change these later.</p></div>
          <div className="grid gap-4">
            {accounts.map((account, index) => <div key={account.localId} className="grid gap-3 rounded-lg border border-outline bg-surface-soft p-4 sm:grid-cols-[1fr_180px_auto]">
              <div className="field"><label htmlFor={`account-name-${account.localId}`}>Account name</label><input id={`account-name-${account.localId}`} value={account.name} placeholder={index === 0 ? "e.g. Airtel Money" : "e.g. Main bank"} onChange={(event) => updateAccount(account.localId, { name: event.target.value })} /></div>
              <div className="field"><label htmlFor={`account-type-${account.localId}`}>Type</label><select id={`account-type-${account.localId}`} value={account.accountType} onChange={(event) => updateAccount(account.localId, { accountType: event.target.value as AccountDraft["accountType"] })}>{accountTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></div>
              {accounts.length > 1 ? <button type="button" className="ghostButton self-end" onClick={() => setAccounts((current) => current.filter((item) => item.localId !== account.localId))}>Remove</button> : null}
            </div>)}
          </div>
          <button type="button" className="ghostButton justify-self-start" onClick={() => setAccounts((current) => [...current, { localId: Date.now(), name: "", accountType: "bank", openingBalance: "" }])}>+ Add another account</button>
        </section> : null}

        {step === 3 ? <section className="grid gap-5" aria-labelledby="balances-heading">
          <div><p className="text-sm font-semibold text-accent">Starting point</p><h1 id="balances-heading" className="mt-1 text-3xl font-semibold text-on-surface">What are the balances now?</h1><p className="mt-2 text-on-surface-soft">Optional. Enter today’s balance so Chuma starts from the right amount.</p></div>
          <div className="grid gap-3">{accounts.filter((account) => account.name.trim()).map((account) => <label key={account.localId} className="grid gap-2 rounded-lg border border-outline p-4 sm:grid-cols-[1fr_220px] sm:items-center"><span><strong className="block text-on-surface">{account.name}</strong><span className="text-sm text-on-surface-soft">{currency}</span></span><input aria-label={`${account.name} opening balance`} type="number" step="0.01" placeholder="0.00" value={account.openingBalance} onChange={(event) => updateAccount(account.localId, { openingBalance: event.target.value })} /></label>)}</div>
        </section> : null}

        {step === 4 ? <section className="grid gap-5" aria-labelledby="other-heading">
          <div><p className="text-sm font-semibold text-accent">What else do you track?</p><h1 id="other-heading" className="mt-1 text-3xl font-semibold text-on-surface">Do you already have any of these?</h1><p className="mt-2 text-on-surface-soft">Choose all that apply. Chuma will put the right next steps on your checklist.</p></div>
          <div className="grid gap-3 sm:grid-cols-3">
            {([["Loans", hasLoans, setHasLoans], ["Stocks", hasStocks, setHasStocks], ["Government bonds", hasBonds, setHasBonds]] as const).map(([label, selected, setter]) => <button key={label} type="button" aria-pressed={selected} className={selected ? "entryTypeButton active" : "entryTypeButton"} onClick={() => setter(!selected)}>{label}</button>)}
          </div>
        </section> : null}

        {step === 5 ? <section className="grid gap-5" aria-labelledby="ready-heading">
          <div><p className="text-sm font-semibold text-positive">Setup complete</p><h1 id="ready-heading" className="mt-1 text-3xl font-semibold text-on-surface">Your workspace is ready</h1><p className="mt-2 text-on-surface-soft">Start with one real action. You do not need to finish every item now.</p></div>
          <div className="grid gap-3">
            <Link href="/add" className="rounded-lg border border-outline bg-surface-soft p-4 font-semibold text-on-surface hover:border-outline-strong">Add your first transaction</Link>
            {(hasStocks || hasBonds) ? <Link href="/investments/add" className="rounded-lg border border-outline bg-surface-soft p-4 font-semibold text-on-surface hover:border-outline-strong">Add your first {hasStocks && hasBonds ? "investment" : hasBonds ? "government bond" : "stock"}</Link> : null}
            {hasLoans ? <Link href="/loans" className="rounded-lg border border-outline bg-surface-soft p-4 font-semibold text-on-surface hover:border-outline-strong">Add your first loan</Link> : null}
          </div>
          <button type="button" className="primaryButton" onClick={() => { router.push("/today"); router.refresh(); }}>Go to Home</button>
        </section> : null}

        {error ? <p role="alert" className="rounded-md bg-negative-soft p-3 text-sm text-negative">{error}</p> : null}

        {step <= 4 ? <div className="flex items-center justify-between gap-3 border-t border-outline pt-5">
          <button type="button" className="ghostButton" disabled={step === 1 || saving} onClick={() => { setError(""); setStep((current) => Math.max(1, current - 1)); }}>Back</button>
          {step < 4 ? <button type="button" className="primaryButton" onClick={nextStep}>Continue</button> : <button type="button" className="primaryButton" disabled={saving} onClick={() => void finishSetup()}>{saving ? "Saving..." : "Finish setup"}</button>}
        </div> : null}
      </section>
    </main>
  );
}
