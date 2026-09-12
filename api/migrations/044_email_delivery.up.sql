-- Outgoing email: account tokens, per-user digest settings, and a delivery log.

-- Password reset and email verification share one table because they are the
-- same shape — a single-use secret with an expiry — and a purpose column keeps
-- one from being replayed as the other.
create table if not exists auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  purpose text not null,
  -- Only the hash is stored. A leaked database must not hand over working
  -- reset links, exactly as it must not hand over passwords.
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint auth_tokens_purpose_check check (purpose in ('password_reset', 'email_verification'))
);

create index if not exists idx_auth_tokens_user_purpose
  on auth_tokens(user_id, purpose, created_at desc);

alter table users
  add column if not exists email_verified_at timestamptz;

-- The delivery log is what makes sending idempotent. dedupe_key is unique, so
-- a restart mid-digest or a second scheduler tick cannot mail the same user
-- the same summary twice.
create table if not exists email_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  recipient text not null,
  kind text not null,
  dedupe_key text unique,
  subject text not null,
  status text not null default 'sent',
  error text,
  created_at timestamptz not null default now(),
  constraint email_deliveries_status_check check (status in ('sent', 'failed'))
);

create index if not exists idx_email_deliveries_user_created_at
  on email_deliveries(user_id, created_at desc);

-- Digest settings. The muted list stores the alert types a person has turned
-- OFF rather than the ones they left on, so an alert type added later is on by
-- default for everyone instead of silently reaching nobody.
alter table user_preferences
  add column if not exists email_digest_frequency text not null default 'off',
  add column if not exists email_muted_notification_types text[] not null default '{}',
  add column if not exists email_digest_last_sent_at timestamptz;

alter table user_preferences
  drop constraint if exists user_preferences_email_digest_frequency_check;

alter table user_preferences
  add constraint user_preferences_email_digest_frequency_check
  check (email_digest_frequency in ('off', 'daily', 'weekly', 'monthly'));
