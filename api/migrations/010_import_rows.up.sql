create table if not exists import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references imports(id) on delete cascade,
  sheet_name text not null,
  row_number integer not null,
  raw_values jsonb not null default '{}'::jsonb,
  normalized_values jsonb not null default '{}'::jsonb,
  status text not null,
  error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

