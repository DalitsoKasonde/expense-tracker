alter table transactions
  add column if not exists deleted_at timestamptz;

create index if not exists idx_transactions_user_deleted_at
  on transactions(user_id, deleted_at);

