-- Subscription plans and beta invitations.

-- A person's plan is (plan, plan_expires_at). A null expiry means it never
-- lapses, which is how a complimentary account is represented — there is no
-- separate "free forever" plan to keep in step with the paid one.
alter table users
  add column if not exists plan text not null default 'free',
  add column if not exists plan_expires_at timestamptz,
  add column if not exists plan_source text not null default 'signup';

alter table users drop constraint if exists users_plan_check;
alter table users
  add constraint users_plan_check check (plan in ('free', 'premium'));

alter table users drop constraint if exists users_plan_source_check;
alter table users
  add constraint users_plan_source_check
  check (plan_source in ('signup', 'invite', 'comp', 'paid'));

-- Finding everyone whose trial is about to lapse is the one query this table
-- will be asked for repeatedly.
create index if not exists idx_users_plan_expires_at
  on users(plan_expires_at)
  where plan_expires_at is not null;

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  -- Only the hash is stored, for the same reason password reset tokens are:
  -- a leaked table must not yield working invitation links.
  token_hash text not null unique,
  invited_by uuid references users(id) on delete set null,
  -- How long the invitee's premium period runs once they accept. Held on the
  -- invitation rather than read from config at accept time, so an invitation
  -- honours the offer that was made when it was sent.
  premium_months integer not null default 6,
  note text,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_user_id uuid references users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_premium_months_check check (premium_months between 0 and 60)
);

-- One live invitation per address: re-inviting someone should replace the open
-- invitation rather than leave two working links in two different inboxes.
create unique index if not exists uk_invitations_open_email
  on invitations(lower(email))
  where accepted_at is null and revoked_at is null;

create index if not exists idx_invitations_created_at
  on invitations(created_at desc);
