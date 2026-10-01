-- An evening email when the record falls behind. Off by default: unlike the
-- digest's figures, a reminder is only welcome to someone who asked for it.
alter table user_preferences
  add column if not exists email_logging_reminder boolean not null default false;
