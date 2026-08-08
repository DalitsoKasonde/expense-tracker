create table if not exists user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  message text not null,
  page_path text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_feedback_status_check check (status in ('new', 'reviewed', 'resolved')),
  constraint user_feedback_message_not_blank check (btrim(message) <> '')
);

create index if not exists idx_user_feedback_status_created_at
  on user_feedback(status, created_at desc);
