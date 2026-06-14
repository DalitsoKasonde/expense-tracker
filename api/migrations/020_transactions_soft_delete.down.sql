drop index if exists idx_transactions_user_deleted_at;

alter table transactions
  drop column if exists deleted_at;

