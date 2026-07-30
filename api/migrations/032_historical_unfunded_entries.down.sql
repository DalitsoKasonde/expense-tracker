alter table transactions
  drop constraint if exists historical_saving_destination_check;

alter table transactions
  drop constraint if exists transactions_account_or_historical_check;

delete from transactions
where account_id is null;

alter table transactions
  alter column account_id set not null;
