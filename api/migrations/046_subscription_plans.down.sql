drop index if exists idx_invitations_created_at;
drop index if exists uk_invitations_open_email;
drop table if exists invitations;

drop index if exists idx_users_plan_expires_at;

alter table users drop constraint if exists users_plan_source_check;
alter table users drop constraint if exists users_plan_check;

alter table users
  drop column if exists plan_source,
  drop column if exists plan_expires_at,
  drop column if exists plan;
