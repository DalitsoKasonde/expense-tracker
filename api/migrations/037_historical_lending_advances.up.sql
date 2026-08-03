-- Money lent before account tracking began should still appear as a receivable
-- without retroactively reducing a current cash balance.
alter table transactions
  drop constraint if exists transactions_account_or_historical_check;

alter table transactions
  add constraint transactions_account_or_historical_check
  check (
    account_id is not null
    or (
      source = 'historical_backfill'
      and entry_kind in (
        'saving_transfer',
        'investment_buy',
        'investment_income',
        'dividend_drip',
        'expense_living',
        'expense_interest',
        'expense_fee',
        'loan_receivable_advance'
      )
    )
  );
