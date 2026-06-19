alter table accounts
add column if not exists account_class text not null default 'asset';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'accounts_account_class_check'
  ) then
    alter table accounts
      add constraint accounts_account_class_check
      check (account_class in ('asset', 'liability'));
  end if;
end $$;

alter table assets
add column if not exists asset_class text not null default 'other';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assets_asset_class_check'
  ) then
    alter table assets
      add constraint assets_asset_class_check
      check (asset_class in ('bond', 'stock', 'cash_equivalent', 'other'));
  end if;
end $$;

create table if not exists asset_valuations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  valuation_date date not null,
  current_value_minor bigint not null,
  currency text not null default 'ZMW',
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_id, valuation_date, source)
);

create table if not exists bond_positions (
  asset_id uuid primary key references assets(id) on delete cascade,
  cash_account_id uuid not null references accounts(id) on delete restrict,
  principal_minor bigint not null,
  coupon_rate_bps integer not null,
  issue_date date not null,
  maturity_date date not null,
  coupon_frequency_per_year integer not null default 2,
  reinvestment_cutoff_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bond_cashflows (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  cash_account_id uuid not null references accounts(id) on delete restrict,
  event_type text not null check (event_type in ('coupon', 'principal_redemption')),
  disposition text not null check (disposition in ('reinvest', 'cash_balance')),
  scheduled_date date not null,
  gross_amount_minor bigint not null,
  net_amount_minor bigint not null,
  status text not null default 'projected' check (status in ('projected', 'posted', 'cancelled')),
  posted_transaction_id uuid references transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_id, event_type, scheduled_date)
);
