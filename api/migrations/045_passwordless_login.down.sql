drop table if exists login_pins;
drop index if exists idx_users_google_subject;
alter table users drop column if exists google_subject;

