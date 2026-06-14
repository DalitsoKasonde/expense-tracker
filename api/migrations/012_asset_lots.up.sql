create table if not exists asset_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete set null,
  quantity numeric(18,6) not null,
  remaining_quantity numeric(18,6) not null,
  unit_cost numeric(18,6) not null,
  acquired_at date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

