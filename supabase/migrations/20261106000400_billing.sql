-- Billing (Track M). Plans are assigned by the billing provider; the column
-- stays backend-only (column-level grants from the earlier migration).
alter table public.profiles
  add column if not exists billing_customer_id text;
