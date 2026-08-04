alter table user_preferences
  add column if not exists color_scheme text not null default 'default';

alter table user_preferences
  add constraint user_preferences_color_scheme_check check (color_scheme in ('default', 'sonto'));
