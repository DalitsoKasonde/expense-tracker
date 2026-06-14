-- Drop idempotency_keys table
drop table if exists idempotency_keys;

-- Remove client_id from transactions
alter table transactions drop column if exists client_id;
