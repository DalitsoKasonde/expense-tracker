-- Web push subscriptions for notifications
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  endpoint text not null,
  auth_key text not null,
  p256dh_key text not null,
  last_active timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint uk_push_subscriptions unique (user_id, endpoint)
);

create index idx_push_subscriptions_user on push_subscriptions(user_id);
