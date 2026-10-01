-- The Today page asks for the newest entry date on every load, and lists and
-- reports filter by date per user. Without this, each of those scans every
-- row the user has ever recorded.
create index if not exists idx_transactions_user_date
  on transactions (user_id, transaction_date desc)
  where deleted_at is null;
