alter table users
  drop constraint if exists users_onboarding_interests_check,
  drop column if exists onboarding_interests,
  drop column if exists onboarding_completed_at;
