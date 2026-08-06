alter table loans
  drop constraint if exists loans_interest_method_check;

alter table loans
  add constraint loans_interest_method_check
  check (interest_method in ('fixed', 'compound'));

alter table loans
  drop column if exists interest_term_months;
