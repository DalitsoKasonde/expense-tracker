drop index if exists idx_categories_user_parent;

alter table categories
  drop column if exists parent_id;

