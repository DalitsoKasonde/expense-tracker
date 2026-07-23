alter table users
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_interests text[] not null default '{}';

update users u
set onboarding_completed_at = now()
where onboarding_completed_at is null
  and exists (
    select 1
    from accounts a
    where a.user_id = u.id
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_onboarding_interests_check'
  ) then
    alter table users
      add constraint users_onboarding_interests_check
      check (
        onboarding_interests <@ array['loans', 'stocks', 'bonds']::text[]
      );
  end if;
end $$;
