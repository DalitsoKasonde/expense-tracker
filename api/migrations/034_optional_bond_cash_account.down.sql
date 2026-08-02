-- Account-less bonds cannot survive the not-null constraint. Their assets and
-- transactions are left in place; only the bond schedule goes.
delete from bond_cashflows
where cash_account_id is null
   or asset_id in (select asset_id from bond_positions where cash_account_id is null);

delete from bond_positions
where cash_account_id is null;

alter table bond_positions
  alter column cash_account_id set not null;

alter table bond_cashflows
  alter column cash_account_id set not null;
