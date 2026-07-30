alter table imports
  add column if not exists error_message text;
