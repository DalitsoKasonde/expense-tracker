-- Recurring transaction templates
create table if not exists recurring_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  entry_kind text not null,
  frequency text not null, -- daily, weekly, monthly, yearly
  amount int not null,
  currency text not null default 'ZMW',
  account_id uuid not null references accounts(id),
  category_id uuid references categories(id),
  income_source_id uuid references income_sources(id),
  business_id uuid references businesses(id),
  note text,
  next_due_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_recurring_templates_user on recurring_templates(user_id);
create index idx_recurring_templates_due on recurring_templates(user_id, next_due_date);
