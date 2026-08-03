alter table users
  drop constraint if exists users_role_check;

alter table users
  add constraint users_role_check check (role in ('admin', 'member', 'system_admin'));

alter table users
  add column if not exists last_login_at timestamptz;

create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references users(id),
  action text not null,
  target_type text not null,
  target_id text,
  request_id text,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_logs_created_at
  on admin_audit_logs(created_at desc);

create or replace function prevent_admin_audit_log_mutation()
returns trigger as $$
begin
  raise exception 'administrative audit logs are immutable';
end;
$$ language plpgsql;

create trigger admin_audit_logs_immutable
  before update or delete on admin_audit_logs
  for each row execute function prevent_admin_audit_log_mutation();

create table if not exists backup_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references users(id),
  status text not null default 'queued',
  file_name text,
  size_bytes bigint,
  checksum_sha256 text,
  error_message text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint backup_jobs_status_check check (status in ('queued', 'running', 'completed', 'failed'))
);

create index if not exists idx_backup_jobs_requested_at
  on backup_jobs(requested_at desc);
