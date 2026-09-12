alter table user_preferences
  drop constraint if exists user_preferences_email_digest_frequency_check;

alter table user_preferences
  drop column if exists email_digest_last_sent_at,
  drop column if exists email_muted_notification_types,
  drop column if exists email_digest_frequency;

drop index if exists idx_email_deliveries_user_created_at;
drop table if exists email_deliveries;

alter table users
  drop column if exists email_verified_at;

drop index if exists idx_auth_tokens_user_purpose;
drop table if exists auth_tokens;
