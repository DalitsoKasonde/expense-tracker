drop index if exists idx_loans_group_id;

alter table loans
  drop constraint if exists loans_group_id_fkey;

delete from transactions
where entry_kind = 'savings_group_loan_repayment';

alter table transactions
  drop constraint if exists transactions_entry_kind_check;

alter table transactions
  add constraint transactions_entry_kind_check
  check (entry_kind in (
    'income_earned',
    'income_borrowed',
    'expense_living',
    'expense_interest',
    'expense_fee',
    'debt_principal_payment',
    'loan_receivable_advance',
    'loan_receivable_repayment',
    'saving_transfer',
    'investment_buy',
    'investment_sell',
    'investment_income',
    'investment_loss',
    'dividend_drip',
    'bond_principal_redemption'
  ));
