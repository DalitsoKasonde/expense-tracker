create table if not exists imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  status text not null,
  template_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

