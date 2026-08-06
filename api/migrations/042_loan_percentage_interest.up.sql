alter table loans
  add column if not exists interest_term_months integer;

alter table loans
  drop constraint if exists loans_interest_method_check;

alter table loans
  add constraint loans_interest_method_check
  check (interest_method in ('fixed', 'compound', 'percentage'));

-- Existing loans keep their flat interest_rate_bps/fixed_interest_minor values untouched;
-- editing a loan now lets you convert it to a monthly percentage rate + term.
