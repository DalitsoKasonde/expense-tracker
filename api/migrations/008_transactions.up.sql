create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete restrict,
  destination_account_id uuid references accounts(id) on delete restrict,
  category_id uuid references categories(id) on delete set null,
  income_source_id uuid references income_sources(id) on delete set null,
  business_id uuid references businesses(id) on delete set null,
  asset_id uuid references assets(id) on delete set null,
  entry_kind text not null,
  amount numeric(14,2) not null,
  currency text not null default 'ZMW',
  quantity numeric(18,6),
  unit_price numeric(18,6),
  fees numeric(14,2) not null default 0,
  note text not null default '',
  source text not null default 'manual',
  import_id uuid,
  transaction_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

