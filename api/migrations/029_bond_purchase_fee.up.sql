alter table bond_positions
  add column if not exists purchase_fee_minor bigint not null default 0;

alter table bond_positions
  drop constraint if exists bond_positions_purchase_fee_check;

alter table bond_positions
  add constraint bond_positions_purchase_fee_check
  check (purchase_fee_minor >= 0);
