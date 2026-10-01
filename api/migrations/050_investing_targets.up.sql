-- A monthly investing target per part of the portfolio: the whole of it, or
-- one kind of holding. 049 put a single stock target on user_preferences;
-- that value moves here as the 'stock' target. The old column is left in
-- place for one release so an API still running mid-deploy keeps working.
create table if not exists investing_targets (
  user_id uuid not null references users(id) on delete cascade,
  scope text not null check (scope in ('all', 'stock', 'bond', 'savings_pocket', 'savings_group')),
  target_minor bigint not null check (target_minor > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, scope)
);

insert into investing_targets (user_id, scope, target_minor)
select user_id, 'stock', monthly_investing_target_minor
from user_preferences
where monthly_investing_target_minor is not null
on conflict (user_id, scope) do nothing;
