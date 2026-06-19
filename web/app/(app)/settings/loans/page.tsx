"use client";

import { useApiCall } from "@/lib/client-api";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";

type Account = {
  id: string;
  name: string;
  accountType: string;
  accountClass: string;
  currency: string;
};

type LoanSummary = {
  id: string;
  creditorName: string;
  loanType: string;
  interestMethod: string;
  fixedInterestMinor: number;
  isForced: boolean;
  status: string;
  principalBorrowed: number;
  principalRepaid: number;
  remainingPrincipal: number;
  outstandingInterest: number;
  outstandingFees: number;
  totalRemainingBalance: number;
  interestAndFeesPaid: number;
  availablePayoffPriority: string;
};

function today() {
  return new Date().toISOString().split("T")[0];
}

function toMinor(value: string) {
  return Math.round((parseFloat(value || "0") || 0) * 100);
}

function formatMoney(value: number) {
  return `ZMW ${(value / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function LoansSettingsPage() {
  const apiCall = useApiCall();
  const [loans, setLoans] = useState<LoanSummary[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [loanForm, setLoanForm] = useState({
    creditorName: "",
    loanType: "personal",
    interestMethod: "fixed",
    fixedInterest: "0",
    isForced: false,
    openedAt: today(),
    currency: "ZMW",
  });
  const [borrowForm, setBorrowForm] = useState({
    loanId: "",
    cashAccountId: "",
    amount: "",
    transactionDate: today(),
    note: "",
  });
  const [repayForm, setRepayForm] = useState({
    loanId: "",
    cashAccountId: "",
    amount: "",
    transactionDate: today(),
    note: "",
  });

  const cashAccounts = useMemo(
    () => accounts.filter((account) => account.accountClass !== "liability"),
    [accounts]
  );

  async function loadData() {
    const [loadedLoans, loadedAccounts] = await Promise.all([
      apiCall<LoanSummary[]>("/v1/loans"),
      apiCall<Account[]>("/v1/accounts"),
    ]);
    setLoans(loadedLoans ?? []);
    setAccounts(loadedAccounts ?? []);
    const firstLoan = loadedLoans?.[0]?.id ?? "";
    const firstCash = loadedAccounts?.find((account) => account.accountClass !== "liability")?.id ?? "";
    setBorrowForm((current) => ({ ...current, loanId: current.loanId || firstLoan, cashAccountId: current.cashAccountId || firstCash }));
    setRepayForm((current) => ({ ...current, loanId: current.loanId || firstLoan, cashAccountId: current.cashAccountId || firstCash }));
  }

  useEffect(() => {
    void loadData()
      .catch((error) => setStatus(error instanceof Error ? error.message : "Failed to load loans"))
      .finally(() => setLoading(false));
  }, [apiCall]);

  async function createLoan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      await apiCall<LoanSummary>("/v1/loans", {
        method: "POST",
        body: {
          ...loanForm,
          fixedInterestMinor: toMinor(loanForm.fixedInterest),
        },
      });
      setLoanForm({ creditorName: "", loanType: "personal", interestMethod: "fixed", fixedInterest: "0", isForced: false, openedAt: today(), currency: "ZMW" });
      await loadData();
      setStatus("Loan created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to create loan");
    } finally {
      setSaving(false);
    }
  }

  async function recordBorrowed(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      await apiCall("/v1/loans/borrowed", {
        method: "POST",
        body: {
          loanId: borrowForm.loanId,
          cashAccountId: borrowForm.cashAccountId,
          amountMinor: toMinor(borrowForm.amount),
          currency: "ZMW",
          transactionDate: borrowForm.transactionDate,
          note: borrowForm.note || undefined,
        },
      });
      setBorrowForm((current) => ({ ...current, amount: "", note: "" }));
      await loadData();
      setStatus("Borrowed money recorded with matching liability.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to record borrowed money");
    } finally {
      setSaving(false);
    }
  }

  async function recordRepayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      await apiCall(`/v1/loans/${repayForm.loanId}/repayments`, {
        method: "POST",
        body: {
          cashAccountId: repayForm.cashAccountId,
          amountMinor: toMinor(repayForm.amount),
          currency: "ZMW",
          transactionDate: repayForm.transactionDate,
          note: repayForm.note || undefined,
        },
      });
      setRepayForm((current) => ({ ...current, amount: "", note: "" }));
      await loadData();
      setStatus("Repayment allocated to fees, interest, then principal.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to record repayment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settingsSection">
      <div className="card settingsLeadCard">
        <p className="sectionKicker">Loans</p>
        <h2 className="sectionHeading">Creditors and debt flow</h2>
        <p className="muted">Borrowed money creates cash and a matching liability. Repayments clear fees, then interest, then principal.</p>
      </div>

      <div className="settingsDetailGrid">
        <form className="card settingsFormPanel" onSubmit={createLoan}>
          <div className="resourceBody">
            <strong>Create loan</strong>
            <span className="muted">A liability account is created automatically for this creditor.</span>
          </div>
          <div className="field">
            <label htmlFor="creditorName">Creditor</label>
            <input id="creditorName" value={loanForm.creditorName} onChange={(event) => setLoanForm((current) => ({ ...current, creditorName: event.target.value }))} required />
          </div>
          <div className="splitFields">
            <div className="field">
              <label htmlFor="loanType">Loan type</label>
              <input id="loanType" value={loanForm.loanType} onChange={(event) => setLoanForm((current) => ({ ...current, loanType: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="fixedInterest">Fixed interest</label>
              <input id="fixedInterest" type="number" step="0.01" value={loanForm.fixedInterest} onChange={(event) => setLoanForm((current) => ({ ...current, fixedInterest: event.target.value }))} />
            </div>
          </div>
          <label className="checkboxRow">
            <input type="checkbox" checked={loanForm.isForced} onChange={(event) => setLoanForm((current) => ({ ...current, isForced: event.target.checked }))} />
            Forced loan
          </label>
          <button className="primaryButton" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Create loan"}
          </button>
        </form>

        <div className="card settingsListPanel">
          <div className="resourceBody">
            <strong>Loan register</strong>
            <span className="muted">Principal is kept separate from interest and fees.</span>
          </div>
          <div className="resourceList">
            {loading ? <div className="muted">Loading loans...</div> : null}
            {!loading && loans.length === 0 ? <div className="muted">No loans yet.</div> : null}
            {loans.map((loan) => (
              <div key={loan.id} className="resourceRow">
                <div className="resourceBody">
                  <strong>{loan.creditorName}</strong>
                  <div className="resourceMeta">
                    <span className="metaBadge">{loan.loanType}</span>
                    {loan.isForced ? <span className="metaBadge">Forced</span> : null}
                    <span className="metaBadge">{loan.availablePayoffPriority.replaceAll("_", " ")}</span>
                  </div>
                </div>
                <div className="resourceBody">
                  <strong>{formatMoney(loan.totalRemainingBalance)}</strong>
                  <span className="muted">Principal {formatMoney(loan.remainingPrincipal)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="settingsDetailGrid">
        <form className="card settingsFormPanel" onSubmit={recordBorrowed}>
          <div className="resourceBody">
            <strong>Record borrowed money</strong>
            <span className="muted">Creates cash inflow and matching liability legs.</span>
          </div>
          <LoanAccountFields loans={loans} cashAccounts={cashAccounts} form={borrowForm} setForm={setBorrowForm} />
          <button className="primaryButton" type="submit" disabled={saving || loans.length === 0 || cashAccounts.length === 0}>
            Record borrowed
          </button>
        </form>

        <form className="card settingsFormPanel" onSubmit={recordRepayment}>
          <div className="resourceBody">
            <strong>Record repayment</strong>
            <span className="muted">Allocates payment to fees, interest, then principal.</span>
          </div>
          <LoanAccountFields loans={loans} cashAccounts={cashAccounts} form={repayForm} setForm={setRepayForm} />
          <button className="primaryButton" type="submit" disabled={saving || loans.length === 0 || cashAccounts.length === 0}>
            Record repayment
          </button>
        </form>
      </div>

      {status ? <p className="statusText">{status}</p> : null}
    </section>
  );
}

function LoanAccountFields({
  loans,
  cashAccounts,
  form,
  setForm,
}: {
  loans: LoanSummary[];
  cashAccounts: Account[];
  form: { loanId: string; cashAccountId: string; amount: string; transactionDate: string; note: string };
  setForm: Dispatch<SetStateAction<{ loanId: string; cashAccountId: string; amount: string; transactionDate: string; note: string }>>;
}) {
  return (
    <>
      <div className="splitFields">
        <div className="field">
          <label>Loan</label>
          <select value={form.loanId} onChange={(event) => setForm((current) => ({ ...current, loanId: event.target.value }))} required>
            <option value="">Select loan</option>
            {loans.map((loan) => (
              <option key={loan.id} value={loan.id}>
                {loan.creditorName}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Cash account</label>
          <select value={form.cashAccountId} onChange={(event) => setForm((current) => ({ ...current, cashAccountId: event.target.value }))} required>
            <option value="">Select account</option>
            {cashAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="splitFields">
        <div className="field">
          <label>Amount</label>
          <input type="number" step="0.01" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} required />
        </div>
        <div className="field">
          <label>Date</label>
          <input type="date" value={form.transactionDate} onChange={(event) => setForm((current) => ({ ...current, transactionDate: event.target.value }))} required />
        </div>
      </div>
      <div className="field">
        <label>Note</label>
        <input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
      </div>
    </>
  );
}
