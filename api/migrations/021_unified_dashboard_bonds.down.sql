drop table if exists bond_cashflows;
drop table if exists bond_positions;
drop table if exists asset_valuations;

alter table assets
  drop constraint if exists assets_asset_class_check;

alter table assets
  drop column if exists asset_class;

alter table accounts
  drop constraint if exists accounts_account_class_check;

alter table accounts
  drop column if exists account_class;
