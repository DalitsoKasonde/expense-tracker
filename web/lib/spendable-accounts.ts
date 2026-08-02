export type AccountLike = {
  accountClass?: string;
  accountType?: string;
  isSavingsGroupAccount?: boolean;
};

/**
 * Whether money can actually be paid out of this account.
 *
 * Liabilities are what you owe, and a receivable is money someone owes you —
 * neither can fund a payment. Offering them in a "pay from" list invites
 * postings that quietly corrupt both balances.
 */
export function isSpendableAccount(account: AccountLike) {
  return account.accountClass !== "liability"
    && account.accountType !== "receivable"
    && !account.isSavingsGroupAccount;
}

export function spendableAccounts<T extends AccountLike>(accounts: T[]): T[] {
  return accounts.filter(isSpendableAccount);
}
