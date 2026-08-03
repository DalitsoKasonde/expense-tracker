alter table transactions
  drop constraint if exists transactions_account_or_historical_check;

delete from transactions
where account_id is null
  and entry_kind in ('investment_income', 'dividend_drip');

alter table transactions
  add constraint transactions_account_or_historical_check
  check (
    account_id is not null
    or (
      source = 'historical_backfill'
      and entry_kind in (
        'saving_transfer',
        'investment_buy',
        'expense_living',
        'expense_interest',
        'expense_fee'
      )
    )
  );
