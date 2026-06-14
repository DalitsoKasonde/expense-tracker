drop index if exists idx_accounts_user_archived;

alter table accounts
  drop column if exists archived_at;

alter table accounts
  alter column account_type drop default;

