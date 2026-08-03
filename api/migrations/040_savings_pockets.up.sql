create table if not exists savings_pockets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  annual_interest_rate_bps integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, account_id),
  check (annual_interest_rate_bps is null or annual_interest_rate_bps >= 0)
);

create index if not exists idx_savings_pockets_user
  on savings_pockets(user_id, created_at desc);
