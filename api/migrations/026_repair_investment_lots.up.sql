insert into asset_lots (
  user_id,
  asset_id,
  transaction_id,
  quantity,
  remaining_quantity,
  unit_cost,
  unit_price,
  fees,
  total_cost,
  acquired_at,
  acquisition_date
)
select
  t.user_id,
  t.asset_id,
  t.id,
  t.quantity,
  t.quantity,
  t.unit_price,
  t.unit_price,
  coalesce(t.fees, 0),
  round(t.quantity * t.unit_price)::bigint + coalesce(t.fees, 0),
  t.transaction_date,
  t.transaction_date
from transactions t
join assets a
  on a.id = t.asset_id
 and a.user_id = t.user_id
where t.entry_kind = 'investment_buy'
  and t.deleted_at is null
  and t.asset_id is not null
  and t.quantity > 0
  and t.unit_price > 0
  and not exists (
    select 1
    from asset_lots lot
    where lot.transaction_id = t.id
  );

create unique index if not exists asset_lots_transaction_id_unique
  on asset_lots(transaction_id)
  where transaction_id is not null;
