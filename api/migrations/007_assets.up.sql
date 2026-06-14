create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  investment_type_id uuid not null references investment_types(id) on delete restrict,
  symbol text not null,
  name text not null,
  currency text not null default 'ZMW',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, symbol)
);

