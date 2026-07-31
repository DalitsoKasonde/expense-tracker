alter table transactions
  drop constraint if exists transactions_account_or_historical_check;

-- The narrower constraint cannot admit account-less expenses, so they go with it.
delete from transactions
where account_id is null
  and entry_kind in ('expense_living', 'expense_interest', 'expense_fee');

alter table transactions
  add constraint transactions_account_or_historical_check
  check (
    account_id is not null
    or (
      source = 'historical_backfill'
      and entry_kind in ('saving_transfer', 'investment_buy')
    )
  );
