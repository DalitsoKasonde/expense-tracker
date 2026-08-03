-- Confirming a coupon that was received before tracking started records the
-- cashflow as 'historical_cash': the money is real history, but no account
-- balance moves. Migration 035 widened the matching constraint on transactions
-- and missed this one, so every historical coupon confirmation failed.
alter table bond_cashflows
  drop constraint if exists bond_cashflows_disposition_check;

alter table bond_cashflows
  add constraint bond_cashflows_disposition_check
  check (disposition in ('reinvest', 'cash_balance', 'historical_cash'));
