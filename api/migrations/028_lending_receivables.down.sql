update transactions
set entry_kind = 'saving_transfer'
where entry_kind in ('loan_receivable_advance', 'loan_receivable_repayment');

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
    'saving_transfer',
    'investment_buy',
    'investment_sell',
    'investment_income',
    'investment_loss',
    'dividend_drip',
    'bond_principal_redemption'
  ));
