alter table transactions
  alter column account_id drop not null;

alter table transactions
  add constraint transactions_account_or_historical_check
  check (
    account_id is not null
    or (
      source = 'historical_backfill'
      and entry_kind in ('saving_transfer', 'investment_buy')
    )
  );

alter table transactions
  add constraint historical_saving_destination_check
  check (
    source <> 'historical_backfill'
    or entry_kind <> 'saving_transfer'
    or destination_account_id is not null
  );
