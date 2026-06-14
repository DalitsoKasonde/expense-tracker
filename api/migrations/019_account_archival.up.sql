alter table accounts
  alter column account_type set default 'cash';

alter table accounts
  add column if not exists archived_at timestamptz;

create index if not exists idx_accounts_user_archived
  on accounts(user_id, archived_at);

