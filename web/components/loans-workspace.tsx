"use client";

import { FormDialog } from "@/components/ui/dialogs";
import { useApiCall } from "@/lib/client-api";
import { useEntriesChanged } from "@/lib/entries-bus";
import { formatMoney } from "@/lib/format-money";
import { isSpendableAccount, spendableAccounts } from "@/lib/spendable-accounts";
import { useUserCurrency } from "@/lib/use-user-currency";
import { useCallback, useEffect, useMemo, useState } from "react";

type Account = { id: string; name: string; accountType: string; accountClass: string; currency: string; isSavingsGroupAccount?: boolean };
type SavingsGroup = { id: string; name: string; currency: string; contributedMinor: number; currentBalance: number };
type LoanSummary = {
  id: string; creditorName: string; loanType: string; interestMethod: string; interestRateBps?: number | null;
  interestTermMonths?: number | null; fixedInterestMinor: number; isForced: boolean;
  groupId?: string | null; status: string; principalBorrowed: number; remainingPrincipal: number;
  outstandingInterest: number; outstandingFees: number; totalRemainingBalance: number;
  interestAndFeesPaid: number; availablePayoffPriority: string;
};

const today = () => new Date().toISOString().split("T")[0];
const toMinor = (value: string) => Math.round((parseFloat(value || "0") || 0) * 100);
const fromMinor = (value: number) => (value / 100).toFixed(2);
// Interest rate is entered as a monthly percentage (e.g. "10" means 10% per month) and
// stored server-side in basis points, where 1% = 100 bps.
const toBps = (value: string) => Math.round((parseFloat(value || "0") || 0) * 100);
const fromBps = (value: number) => (value / 100).toString();
const blankMovement = () => ({ loanId: "", cashAccountId: "", amount: "", transactionFee: "", transactionDate: today(), note: "" });
const blankEdit = () => ({
  loanId: "", creditorName: "", isForced: false, amount: "",
  hasInterest: false, interestRatePct: "", interestTermMonths: "",
});

export function LoansWorkspace() {
  const apiCall = useApiCall();
  const { currency: userCurrency } = useUserCurrency();
  const [loans, setLoans] = useState<LoanSummary[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<SavingsGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [repayOpen, setRepayOpen] = useState(false);
  const [borrowOpen, setBorrowOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [loanForm, setLoanForm] = useState({
    lenderSource: "savings_group", groupId: "", creditorName: "", loanType: "personal",
    hasInterest: false, interestRatePct: "", interestTermMonths: "",
    isForced: false, amount: "", cashAccountId: "",
    transactionFee: "", openedAt: today(), note: "",
  });
  const [repayForm, setRepayForm] = useState(blankMovement);
  const [borrowForm, setBorrowForm] = useState(blankMovement);
  const [editForm, setEditForm] = useState(blankEdit);

  const cashAccounts = useMemo(() => spendableAccounts(accounts), [accounts]);
  const eligibleGroups = useMemo(() => groups.filter((group) => group.currency === userCurrency), [groups, userCurrency]);
  const activeLoans = useMemo(() => loans.filter((loan) => loan.status === "active"), [loans]);
  const groupNames = useMemo(() => new Map(groups.map((group) => [group.id, group.name])), [groups]);
  const totals = useMemo(() => activeLoans.reduce((result, loan) => ({
    outstanding: result.outstanding + loan.totalRemainingBalance,
    principal: result.principal + loan.remainingPrincipal,
    costs: result.costs + loan.outstandingInterest + loan.outstandingFees,
  }), { outstanding: 0, principal: 0, costs: 0 }), [activeLoans]);
  const selectedRepaymentLoan = activeLoans.find((loan) => loan.id === repayForm.loanId);

  const loadData = useCallback(async () => {
    const [loadedLoans, loadedAccounts, loadedGroups] = await Promise.all([
      apiCall<LoanSummary[]>("/v1/loans"), apiCall<Account[]>("/v1/accounts"), apiCall<SavingsGroup[]>("/v1/savings-groups"),
    ]);
    const nextAccounts = loadedAccounts ?? [];
    const nextGroups = loadedGroups ?? [];
    const firstCash = nextAccounts.find(isSpendableAccount)?.id ?? "";
    const firstGroup = nextGroups.find((group) => group.currency === userCurrency)?.id ?? "";
    setLoans(loadedLoans ?? []); setAccounts(nextAccounts); setGroups(nextGroups);
    setLoanForm((current) => ({ ...current, lenderSource: firstGroup ? current.lenderSource : "other", groupId: current.groupId || firstGroup, cashAccountId: current.cashAccountId || firstCash }));
    setRepayForm((current) => ({ ...current, cashAccountId: current.cashAccountId || firstCash }));
    setBorrowForm((current) => ({ ...current, cashAccountId: current.cashAccountId || firstCash }));
  }, [apiCall, userCurrency]);

  useEffect(() => { void loadData().catch((error) => setStatus(error instanceof Error ? error.message : "Failed to load loans")).finally(() => setLoading(false)); }, [loadData]);

  // A loan entry saved elsewhere (e.g. the sidebar/bottom nav "Add entry")
  // should update balances here without a manual reload.
  useEntriesChanged(() => {
    void loadData().catch((error) => setStatus(error instanceof Error ? error.message : "Failed to load loans"));
  });

  function closeCreate() {
    setCreateOpen(false);
    setLoanForm((current) => ({ ...current, creditorName: "", hasInterest: false, interestRatePct: "", interestTermMonths: "", amount: "", transactionFee: "", openedAt: today(), note: "" }));
  }

  async function createLoan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setStatus("");
    const group = eligibleGroups.find((item) => item.id === loanForm.groupId);
    try {
      await apiCall<LoanSummary>("/v1/loans", { method: "POST", body: {
        creditorName: loanForm.lenderSource === "savings_group" ? group?.name : loanForm.creditorName,
        groupId: loanForm.lenderSource === "savings_group" ? loanForm.groupId : undefined,
        loanType: loanForm.isForced ? "forced" : loanForm.loanType,
        interestMethod: loanForm.hasInterest ? "percentage" : "fixed",
        interestRateBps: loanForm.hasInterest ? toBps(loanForm.interestRatePct) : undefined,
        interestTermMonths: loanForm.hasInterest ? parseInt(loanForm.interestTermMonths, 10) || 1 : undefined,
        isForced: loanForm.isForced,
        openedAt: loanForm.openedAt, currency: userCurrency, initialAmountMinor: toMinor(loanForm.amount),
        cashAccountId: loanForm.cashAccountId, transactionFeeMinor: toMinor(loanForm.transactionFee),
        transactionDate: loanForm.openedAt, note: loanForm.note || undefined,
      }});
      closeCreate(); await loadData(); setStatus("Loan and received money recorded.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Failed to add loan"); } finally { setSaving(false); }
  }

  function openEdit(loan: LoanSummary) {
    setEditForm({
      loanId: loan.id, creditorName: loan.creditorName, isForced: loan.isForced,
      amount: fromMinor(loan.principalBorrowed),
      hasInterest: loan.interestMethod === "percentage",
      interestRatePct: loan.interestRateBps ? fromBps(loan.interestRateBps) : "",
      interestTermMonths: loan.interestTermMonths ? String(loan.interestTermMonths) : "",
    });
    setEditOpen(true);
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setStatus("");
    try {
      await apiCall<LoanSummary>(`/v1/loans/${editForm.loanId}`, { method: "PATCH", body: {
        creditorName: editForm.creditorName, loanType: editForm.isForced ? "forced" : "personal",
        isForced: editForm.isForced, principalAmountMinor: toMinor(editForm.amount),
        interestMethod: editForm.hasInterest ? "percentage" : "fixed",
        interestRateBps: editForm.hasInterest ? toBps(editForm.interestRatePct) : undefined,
        interestTermMonths: editForm.hasInterest ? parseInt(editForm.interestTermMonths, 10) || 1 : undefined,
        fixedInterestMinor: 0,
      }});
      setEditOpen(false); await loadData(); setStatus("Loan updated.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Failed to update loan"); } finally { setSaving(false); }
  }

  async function recordMovement(event: React.FormEvent<HTMLFormElement>, kind: "borrow" | "repay") {
    event.preventDefault(); setSaving(true); setStatus("");
    const form = kind === "repay" ? repayForm : borrowForm;
    const path = kind === "repay" ? `/v1/loans/${form.loanId}/repayments` : "/v1/loans/borrowed";
    try {
      await apiCall(path, { method: "POST", body: {
        ...(kind === "borrow" ? { loanId: form.loanId } : {}), cashAccountId: form.cashAccountId,
        amountMinor: toMinor(form.amount), transactionFeeMinor: toMinor(form.transactionFee),
        currency: userCurrency, transactionDate: form.transactionDate, note: form.note || undefined,
      }});
      if (kind === "repay") { setRepayOpen(false); setRepayForm((current) => ({ ...blankMovement(), cashAccountId: current.cashAccountId })); }
      else { setBorrowOpen(false); setBorrowForm((current) => ({ ...blankMovement(), cashAccountId: current.cashAccountId })); }
      await loadData(); setStatus(kind === "repay" ? "Repayment recorded." : "Additional borrowing recorded.");
    } catch (error) { setStatus(error instanceof Error ? error.message : `Failed to record ${kind === "repay" ? "repayment" : "borrowing"}`); } finally { setSaving(false); }
  }

  function openRepayment(loan: LoanSummary) { setRepayForm((current) => ({ ...current, loanId: loan.id, amount: (loan.totalRemainingBalance / 100).toFixed(2) })); setRepayOpen(true); }
  function openBorrowing(loan: LoanSummary) { setBorrowForm((current) => ({ ...current, loanId: loan.id })); setBorrowOpen(true); }

  return (
    <section className="settingsSection grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="resourceBody">
          <strong>What you owe</strong>
          <span className="muted">Add a loan once, then record repayments directly from its row.</span>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => setCreateOpen(true)}>Add loan</button>
      </div>

      <div className="statsGrid">
        <div className="statCard"><span className="muted">Total outstanding</span><strong>{formatMoney(totals.outstanding, userCurrency)}</strong></div>
        <div className="statCard"><span className="muted">Principal left</span><strong>{formatMoney(totals.principal, userCurrency)}</strong></div>
        <div className="statCard"><span className="muted">Interest and fees left</span><strong>{formatMoney(totals.costs, userCurrency)}</strong></div>
      </div>

      <section className="card settingsListPanel overflow-hidden">
        <div className="settingsHeaderRow"><strong>Loans</strong><span className="muted">{activeLoans.length} active</span></div>
        {loading ? <div className="muted p-4">Loading loans...</div> : null}
        {!loading && loans.length === 0 ? <div className="muted p-4">No loans yet. Add one to record the money received and what you owe.</div> : null}
        {loans.length ? <div className="overflow-x-auto"><table className="dataTable"><thead><tr><th>Lender</th><th>Outstanding</th><th>Breakdown</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {loans.map((loan) => <tr key={loan.id}>
            <td data-label="Lender"><strong>{loan.creditorName}</strong><div className="resourceMeta"><span className="metaBadge">{loan.isForced ? "Forced" : loan.loanType}</span>{loan.groupId ? <span className="metaBadge">Savings group</span> : null}</div></td>
            <td data-label="Outstanding"><strong>{formatMoney(loan.totalRemainingBalance, userCurrency)}</strong></td>
            <td data-label="Breakdown" className="text-on-surface-soft">Principal {formatMoney(loan.remainingPrincipal, userCurrency)} · costs {formatMoney(loan.outstandingInterest + loan.outstandingFees, userCurrency)}</td>
            <td data-label="Status"><span className="metaBadge">{loan.status}</span>{loan.groupId && loan.status === "active" ? <div className="muted">Pending back to {groupNames.get(loan.groupId) ?? "group"}</div> : null}</td>
            <td data-label="Actions"><div className="flex flex-wrap gap-2">{loan.status === "active" ? <><button className="btn btn-primary" type="button" onClick={() => openRepayment(loan)}>Record repayment</button><button className="btn btn-ghost" type="button" onClick={() => openBorrowing(loan)}>Borrow more</button></> : null}<button className="btn btn-ghost" type="button" onClick={() => openEdit(loan)}>Edit</button></div></td>
          </tr>)}
        </tbody></table></div> : null}
      </section>
      {status ? <p className="statusText" role="status">{status}</p> : null}

      <FormDialog open={createOpen} title="Add loan" description="Record the lender, money received, and what you owe in one step." submitLabel="Add loan" pending={saving} error={status && !status.includes("recorded") ? status : undefined} onSubmit={createLoan} onClose={closeCreate}>
        <div className="grid gap-4">
          <div className="field"><label htmlFor="loan-source">Where is the loan from?</label><select id="loan-source" value={loanForm.lenderSource} onChange={(event) => setLoanForm((current) => ({ ...current, lenderSource: event.target.value }))}><option value="savings_group" disabled={eligibleGroups.length === 0}>Savings group</option><option value="other">Another lender</option></select></div>
          {loanForm.lenderSource === "savings_group" ? <div className="field"><label htmlFor="loan-group">Savings group</label><select id="loan-group" value={loanForm.groupId} onChange={(event) => setLoanForm((current) => ({ ...current, groupId: event.target.value }))} required><option value="">Select group</option>{eligibleGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><span className="muted">The group balance stays unchanged now. Repayments will be added back to it.</span></div> : <div className="field"><label htmlFor="loan-creditor">Lender name</label><input id="loan-creditor" value={loanForm.creditorName} onChange={(event) => setLoanForm((current) => ({ ...current, creditorName: event.target.value }))} required /></div>}
          <label className="checkboxRow"><input type="checkbox" checked={loanForm.isForced} onChange={(event) => setLoanForm((current) => ({ ...current, isForced: event.target.checked }))} />This is a forced loan</label>
          <div className="splitFields"><MoneyField id="loan-amount" label="Amount received" value={loanForm.amount} onChange={(amount) => setLoanForm((current) => ({ ...current, amount }))} required /><div className="field"><label htmlFor="loan-destination">Send money to</label><AccountSelect id="loan-destination" accounts={cashAccounts} value={loanForm.cashAccountId} onChange={(cashAccountId) => setLoanForm((current) => ({ ...current, cashAccountId }))} /></div></div>
          <div className="field"><label htmlFor="loan-date">Date received</label><input id="loan-date" type="date" value={loanForm.openedAt} onChange={(event) => setLoanForm((current) => ({ ...current, openedAt: event.target.value }))} required /></div>
          <label className="checkboxRow"><input type="checkbox" checked={loanForm.hasInterest} onChange={(event) => setLoanForm((current) => ({ ...current, hasInterest: event.target.checked }))} />This loan charges interest</label>
          {loanForm.hasInterest ? <InterestFields prefix="loan" ratePct={loanForm.interestRatePct} termMonths={loanForm.interestTermMonths} onRateChange={(interestRatePct) => setLoanForm((current) => ({ ...current, interestRatePct }))} onTermChange={(interestTermMonths) => setLoanForm((current) => ({ ...current, interestTermMonths }))} /> : null}
          <div className="splitFields"><MoneyField id="loan-fee" label="Transaction fee (optional)" value={loanForm.transactionFee} onChange={(transactionFee) => setLoanForm((current) => ({ ...current, transactionFee }))} /><div className="field"><label htmlFor="loan-note">Note (optional)</label><input id="loan-note" value={loanForm.note} onChange={(event) => setLoanForm((current) => ({ ...current, note: event.target.value }))} /></div></div>
        </div>
      </FormDialog>

      <FormDialog open={editOpen} title={`Edit ${editForm.creditorName || "loan"}`} description="Update the lender, amount received, and interest terms." submitLabel="Save changes" pending={saving} error={status.startsWith("Failed") ? status : undefined} onSubmit={saveEdit} onClose={() => setEditOpen(false)}>
        <div className="grid gap-4">
          <div className="field"><label htmlFor="edit-creditor">Lender name</label><input id="edit-creditor" value={editForm.creditorName} onChange={(event) => setEditForm((current) => ({ ...current, creditorName: event.target.value }))} required /></div>
          <label className="checkboxRow"><input type="checkbox" checked={editForm.isForced} onChange={(event) => setEditForm((current) => ({ ...current, isForced: event.target.checked }))} />This is a forced loan</label>
          <MoneyField id="edit-amount" label="Amount received" value={editForm.amount} onChange={(amount) => setEditForm((current) => ({ ...current, amount }))} required />
          <label className="checkboxRow"><input type="checkbox" checked={editForm.hasInterest} onChange={(event) => setEditForm((current) => ({ ...current, hasInterest: event.target.checked }))} />This loan charges interest</label>
          {editForm.hasInterest ? <InterestFields prefix="edit" ratePct={editForm.interestRatePct} termMonths={editForm.interestTermMonths} onRateChange={(interestRatePct) => setEditForm((current) => ({ ...current, interestRatePct }))} onTermChange={(interestTermMonths) => setEditForm((current) => ({ ...current, interestTermMonths }))} /> : null}
        </div>
      </FormDialog>

      <FormDialog open={repayOpen} title={`Repay ${selectedRepaymentLoan?.creditorName ?? "loan"}`} description={selectedRepaymentLoan?.groupId ? `This payment will also increase ${groupNames.get(selectedRepaymentLoan.groupId) ?? "the savings group"}'s balance.` : "Payments clear fees, then interest, then principal."} submitLabel="Record repayment" pending={saving} error={status.startsWith("Failed") ? status : undefined} onSubmit={(event) => recordMovement(event, "repay")} onClose={() => setRepayOpen(false)}>
        <MovementFields prefix="repay" form={repayForm} setForm={setRepayForm} accounts={cashAccounts} />
        {selectedRepaymentLoan ? <p className="mt-4 rounded-md border border-outline bg-surface-soft p-3 text-sm text-on-surface-soft">Outstanding: {formatMoney(selectedRepaymentLoan.totalRemainingBalance, userCurrency)}. The suggested amount pays it off in full; you can enter a partial payment.</p> : null}
      </FormDialog>

      <FormDialog open={borrowOpen} title="Record more money from this loan" description="Adds money to your selected account and increases the loan principal." submitLabel="Record money received" pending={saving} error={status.startsWith("Failed") ? status : undefined} onSubmit={(event) => recordMovement(event, "borrow")} onClose={() => setBorrowOpen(false)}><MovementFields prefix="borrow" form={borrowForm} setForm={setBorrowForm} accounts={cashAccounts} /></FormDialog>
    </section>
  );
}

type MovementForm = ReturnType<typeof blankMovement>;
function MovementFields({ prefix, form, setForm, accounts }: { prefix: string; form: MovementForm; setForm: React.Dispatch<React.SetStateAction<MovementForm>>; accounts: Account[] }) {
  return <div className="grid gap-4"><div className="splitFields"><MoneyField id={`${prefix}-amount`} label="Amount" value={form.amount} onChange={(amount) => setForm((current) => ({ ...current, amount }))} required /><div className="field"><label htmlFor={`${prefix}-account`}>{prefix === "repay" ? "Pay from" : "Send money to"}</label><AccountSelect id={`${prefix}-account`} accounts={accounts} value={form.cashAccountId} onChange={(cashAccountId) => setForm((current) => ({ ...current, cashAccountId }))} /></div></div><div className="splitFields"><div className="field"><label htmlFor={`${prefix}-date`}>Date</label><input id={`${prefix}-date`} type="date" value={form.transactionDate} onChange={(event) => setForm((current) => ({ ...current, transactionDate: event.target.value }))} required /></div><MoneyField id={`${prefix}-fee`} label="Transaction fee (optional)" value={form.transactionFee} onChange={(transactionFee) => setForm((current) => ({ ...current, transactionFee }))} /></div><div className="field"><label htmlFor={`${prefix}-note`}>Note (optional)</label><input id={`${prefix}-note`} value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></div></div>;
}

function InterestFields({ prefix, ratePct, termMonths, onRateChange, onTermChange }: { prefix: string; ratePct: string; termMonths: string; onRateChange: (value: string) => void; onTermChange: (value: string) => void }) {
  return <div className="splitFields">
    <div className="field"><label htmlFor={`${prefix}-interest-rate`}>Interest rate (% per month)</label><input id={`${prefix}-interest-rate`} type="number" min="0" step="0.01" value={ratePct} onChange={(event) => onRateChange(event.target.value)} required /></div>
    <div className="field"><label htmlFor={`${prefix}-interest-term`}>Loan term (months)</label><input id={`${prefix}-interest-term`} type="number" min="1" step="1" value={termMonths} onChange={(event) => onTermChange(event.target.value)} required /></div>
  </div>;
}

function MoneyField({ id, label, value, onChange, required = false }: { id: string; label: string; value: string; onChange: (value: string) => void; required?: boolean }) { return <div className="field"><label htmlFor={id}>{label}</label><input id={id} type="number" min="0" step="0.01" value={value} onChange={(event) => onChange(event.target.value)} required={required} /></div>; }
function AccountSelect({ id, accounts, value, onChange }: { id: string; accounts: Account[]; value: string; onChange: (value: string) => void }) { return <select id={id} value={value} onChange={(event) => onChange(event.target.value)} required><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{[account.name, account.accountType?.replaceAll("_", " "), account.currency].filter(Boolean).join(" · ")}</option>)}</select>; }
