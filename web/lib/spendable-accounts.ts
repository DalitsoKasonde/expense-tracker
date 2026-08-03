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
 *
 * Savings sit out too: a pocket is money set aside, not a wallet you spend from.
 * Taking money out of one is a transfer back to a spending account first, which
 * is both how it happens and what keeps the pocket's balance honest. Savings
 * accounts remain available as transfer destinations.
 */
export function isSpendableAccount(account: AccountLike) {
  return account.accountClass !== "liability"
    && account.accountType !== "receivable"
    && account.accountType !== "savings"
    && !account.isSavingsGroupAccount;
}

export function spendableAccounts<T extends AccountLike>(accounts: T[]): T[] {
  return accounts.filter(isSpendableAccount);
}
