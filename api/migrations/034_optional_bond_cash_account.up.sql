-- A bond bought years ago may have no account to name: the money left an
-- account that was never tracked here. The cash account stays required for
-- bonds recorded normally, and can be filled in later when a coupon is
-- confirmed against a real account.
alter table bond_positions
  alter column cash_account_id drop not null;

alter table bond_cashflows
  alter column cash_account_id drop not null;
