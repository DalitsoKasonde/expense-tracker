alter table bond_positions
  drop constraint if exists bond_positions_purchase_fee_check;

alter table bond_positions
  drop column if exists purchase_fee_minor;
