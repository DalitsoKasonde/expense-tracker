drop index if exists idx_backup_jobs_requested_at;
drop table if exists backup_jobs;
drop index if exists idx_admin_audit_logs_created_at;
drop trigger if exists admin_audit_logs_immutable on admin_audit_logs;
drop function if exists prevent_admin_audit_log_mutation();
drop table if exists admin_audit_logs;

update users set role = 'admin' where role = 'system_admin';

alter table users
  drop constraint if exists users_role_check;

alter table users
  add constraint users_role_check check (role in ('admin', 'member'));

alter table users drop column if exists last_login_at;
