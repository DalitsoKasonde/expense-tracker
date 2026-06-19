alter table transactions
  drop constraint if exists transactions_entry_kind_check;

alter table transactions
  drop column if exists loan_id;

drop index if exists idx_loan_charges_loan_date;
drop table if exists loan_charges;

drop index if exists idx_loans_user_status;
drop table if exists loans;

alter table categories
  drop column if exists insight_bucket;

update transactions
set entry_kind = case entry_kind
  when 'income_earned' then 'income'
  when 'expense_living' then 'expense'
  else entry_kind
end
where entry_kind in ('income_earned', 'expense_living');

drop index if exists idx_transactions_user_origin_event;

alter table transactions
  drop column if exists origin_event_type,
  drop column if exists origin_event_id;

alter table transactions
  alter column amount type numeric(14,2) using amount::numeric,
  alter column fees type numeric(14,2) using fees::numeric,
  alter column unit_price type numeric(18,6) using unit_price::numeric;

alter table accounts
  alter column opening_balance type numeric(14,2) using (opening_balance::numeric / 100);
