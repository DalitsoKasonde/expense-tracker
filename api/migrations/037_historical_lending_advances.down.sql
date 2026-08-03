delete from transactions
where source = 'historical_backfill'
  and account_id is null
  and entry_kind = 'loan_receivable_advance';

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
        'expense_fee'
      )
    )
  );
