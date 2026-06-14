create table if not exists user_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  default_currency text not null default 'ZMW',
  theme text not null default 'light',
  notifications_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_preferences_theme_check check (theme in ('light', 'dark'))
);

