alter table asset_lots
  add column if not exists unit_price bigint,
  add column if not exists fees bigint not null default 0,
  add column if not exists total_cost bigint,
  add column if not exists acquisition_date date;

update asset_lots
set
  unit_price = coalesce(unit_price, round(unit_cost)::bigint),
  total_cost = coalesce(total_cost, round(unit_cost * quantity)::bigint),
  acquisition_date = coalesce(acquisition_date, acquired_at)
where unit_price is null
   or total_cost is null
   or acquisition_date is null;

alter table asset_lots
  alter column unit_price set not null,
  alter column total_cost set not null,
  alter column acquisition_date set not null;

alter table transactions
  drop constraint if exists transactions_entry_kind_check;

alter table transactions
  add constraint transactions_entry_kind_check
  check (entry_kind in (
    'income_earned',
    'income_borrowed',
    'expense_living',
    'expense_interest',
    'expense_fee',
    'debt_principal_payment',
    'saving_transfer',
    'investment_buy',
    'investment_sell',
    'investment_income',
    'investment_loss',
    'dividend_drip',
    'bond_principal_redemption'
  ));

create table if not exists savings_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete restrict,
  name text not null,
  is_shareout_group boolean not null default true,
  cycle_start date not null default current_date,
  cycle_length_months integer not null default 12,
  status text not null default 'active',
  target_minor bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, account_id),
  check (status in ('active', 'closed')),
  check (cycle_length_months > 0)
);

create index if not exists idx_savings_groups_user_status
  on savings_groups(user_id, status);

create table if not exists savings_group_cycles (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references savings_groups(id) on delete cascade,
  cycle_start date not null,
  cycle_end date not null,
  contributed_minor bigint not null,
  payout_minor bigint not null,
  realized_result_minor bigint not null,
  origin_event_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_savings_group_cycles_group
  on savings_group_cycles(group_id, cycle_start desc);
