-- Historical entries may omit the funding account for expenses too, not just
-- savings and investment purchases: backfilled years often record what was
-- spent without recording which account it left.
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
        'expense_living',
        'expense_interest',
        'expense_fee'
      )
    )
  );
