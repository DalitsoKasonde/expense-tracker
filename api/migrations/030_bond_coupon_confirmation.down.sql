alter table bond_cashflows
  drop constraint if exists bond_cashflows_tax_check;

alter table bond_cashflows
  drop column if exists confirmed_at,
  drop column if exists payment_date,
  drop column if exists reinvest_transaction_id,
  drop column if exists destination_asset_id,
  drop column if exists tax_amount_minor;
