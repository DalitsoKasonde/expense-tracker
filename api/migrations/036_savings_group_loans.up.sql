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
    'savings_group_loan_repayment',
    'investment_buy',
    'investment_sell',
    'investment_income',
    'investment_loss',
    'dividend_drip',
    'bond_principal_redemption'
  ));

alter table loans
  add constraint loans_group_id_fkey
  foreign key (group_id) references savings_groups(id) on delete set null;

create index if not exists idx_loans_group_id on loans(group_id);
