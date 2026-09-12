-- Passwordless sign-in state. Google accounts are linked by Google's stable
-- subject identifier; email PINs keep only a server-keyed digest of the code.

alter table users
  add column if not exists google_subject text;

create unique index if not exists idx_users_google_subject
  on users(google_subject)
  where google_subject is not null;

create table if not exists login_pins (
  user_id uuid primary key references users(id) on delete cascade,
  pin_hash text not null,
  attempt_count smallint not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint login_pins_attempt_count_check check (attempt_count between 0 and 5)
);

