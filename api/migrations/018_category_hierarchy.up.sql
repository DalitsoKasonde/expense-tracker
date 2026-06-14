alter table categories
  add column if not exists parent_id uuid references categories(id) on delete set null;

create index if not exists idx_categories_user_parent
  on categories(user_id, parent_id);

