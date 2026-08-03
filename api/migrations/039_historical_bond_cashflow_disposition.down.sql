alter table bond_cashflows
  drop constraint if exists bond_cashflows_disposition_check;

-- Historical coupons have no account to point at, so the narrower vocabulary
-- can only describe them as ordinary cash.
update bond_cashflows
set disposition = 'cash_balance'
where disposition = 'historical_cash';

alter table bond_cashflows
  add constraint bond_cashflows_disposition_check
  check (disposition in ('reinvest', 'cash_balance'));
