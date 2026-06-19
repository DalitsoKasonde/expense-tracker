alter table accounts
  alter column opening_balance type bigint using round(opening_balance * 100)::bigint;

alter table transactions
  alter column amount type bigint using round(amount)::bigint,
  alter column fees type bigint using round(fees)::bigint,
  alter column unit_price type bigint using round(unit_price)::bigint;

alter table transactions
  add column if not exists origin_event_id uuid,
  add column if not exists origin_event_type text;

create index if not exists idx_transactions_user_origin_event
  on transactions(user_id, origin_event_id)
  where origin_event_id is not null;

update transactions
set entry_kind = case entry_kind
  when 'income' then 'income_earned'
  when 'expense' then 'expense_living'
  else entry_kind
end
where entry_kind in ('income', 'expense');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_entry_kind_check'
  ) then
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
        'investment_income',
        'bond_principal_redemption'
      ));
  end if;
end $$;

alter table categories
  add column if not exists insight_bucket text;

create table if not exists loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  liability_account_id uuid not null references accounts(id) on delete restrict,
  creditor_name text not null,
  loan_type text not null default 'personal',
  interest_method text not null default 'fixed',
  interest_rate_bps integer,
  fixed_interest_minor bigint not null default 0,
  stated_period_end date,
  is_forced boolean not null default false,
  group_id uuid,
  status text not null default 'active',
  opened_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, liability_account_id),
  check (interest_method in ('fixed', 'compound')),
  check (status in ('active', 'closed', 'defaulted'))
);

create index if not exists idx_loans_user_status
  on loans(user_id, status);

create table if not exists loan_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  loan_id uuid not null references loans(id) on delete cascade,
  charge_type text not null,
  amount_minor bigint not null,
  note text not null default '',
  charge_date date not null default current_date,
  created_at timestamptz not null default now(),
  check (charge_type in ('interest', 'fee')),
  check (amount_minor >= 0)
);

create index if not exists idx_loan_charges_loan_date
  on loan_charges(loan_id, charge_date);

alter table transactions
  add column if not exists loan_id uuid references loans(id) on delete set null;

create index if not exists idx_transactions_user_loan
  on transactions(user_id, loan_id)
  where loan_id is not null;
