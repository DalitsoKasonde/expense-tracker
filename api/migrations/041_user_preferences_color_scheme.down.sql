alter table user_preferences
  drop constraint if exists user_preferences_color_scheme_check;

alter table user_preferences
  drop column if exists color_scheme;
