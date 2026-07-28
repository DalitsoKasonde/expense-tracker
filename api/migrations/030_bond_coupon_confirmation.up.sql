alter table bond_cashflows
  add column if not exists tax_amount_minor bigint not null default 0,
  add column if not exists destination_asset_id uuid references assets(id) on delete set null,
  add column if not exists reinvest_transaction_id uuid references transactions(id) on delete set null,
  add column if not exists payment_date date,
  add column if not exists confirmed_at timestamptz;

alter table bond_cashflows
  drop constraint if exists bond_cashflows_tax_check;

alter table bond_cashflows
  add constraint bond_cashflows_tax_check
  check (tax_amount_minor >= 0 and tax_amount_minor <= gross_amount_minor);
