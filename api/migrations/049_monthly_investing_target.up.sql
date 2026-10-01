-- An optional amount a person means to put into stocks each month, in their
-- default currency. Null is "no target", which is the default: a goal the
-- person did not set would only read as falling short.
alter table user_preferences
  add column if not exists monthly_investing_target_minor bigint
    check (monthly_investing_target_minor is null or monthly_investing_target_minor > 0);
