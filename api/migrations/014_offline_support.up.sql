-- Add client_id to transactions for offline tracking
alter table transactions add column client_id text;
create index idx_transactions_client_id on transactions(user_id, client_id);

-- Create idempotency_keys table to track processed requests
create table if not exists idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  key text not null,
  request_hash text not null,
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  constraint uk_idempotency_keys unique (user_id, key)
);

create index idx_idempotency_keys_user on idempotency_keys(user_id);
