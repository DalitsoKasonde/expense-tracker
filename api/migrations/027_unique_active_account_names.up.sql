with ranked_accounts as (
  select
    id,
    row_number() over (
      partition by user_id, lower(btrim(name))
      order by created_at asc, id asc
    ) as duplicate_number
  from accounts
  where archived_at is null
)
update accounts account
set name = account.name || ' (duplicate ' || left(account.id::text, 8) || ')'
from ranked_accounts ranked
where ranked.id = account.id
  and ranked.duplicate_number > 1;

create unique index if not exists accounts_user_active_name_unique
  on accounts(user_id, lower(btrim(name)))
  where archived_at is null;
