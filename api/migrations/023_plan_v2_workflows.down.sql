drop index if exists idx_savings_group_cycles_group;
drop table if exists savings_group_cycles;

drop index if exists idx_savings_groups_user_status;
drop table if exists savings_groups;

alter table transactions
  drop constraint if exists transactions_entry_kind_check;

alter table transactions
  add constraint transactions_entry_kind_check
  check (entry_kind in (
    'income_earned',
    'income_borrowed',
    'expense_living',
    'expense_interest',
    'expense_fee',
    'debt_principal_payment',
    'saving_transfer',
    'investment_buy',
    'investment_income',
    'bond_principal_redemption'
  ));

alter table asset_lots
  drop column if exists acquisition_date,
  drop column if exists total_cost,
  drop column if exists fees,
  drop column if exists unit_price;
