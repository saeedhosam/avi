# Ops runbook — manual plan assignment (Track M phase 0)

⚠️ Billing integration note (2026-11-06): Lemon Squeezy store creation is
currently failing with HTTP 500 at the create-store step for an Egypt-based
seller (under investigation — retry/other countries). Until self-serve billing
is live (`BILLING_PROVIDER=manual` remains), assign plans by hand here:

```bash
# Supabase SQL editor (project uiabvbndrpscsscvwofc), service-role context.

-- Find the user (by the email they paid from)
select id, email, plan from public.profiles where email = 'customer@example.com';

-- Grant a plan ('FREE' | 'PLUS' | 'PRO')
update public.profiles
set plan = 'PLUS'
where email = 'customer@example.com';

-- Optional: record what it was paid through
update public.profiles
set billing_customer_id = 'manual:2026-11-06'
where email = 'customer@example.com';
```

Notes:
- `plan` is backend-only: clients cannot self-set it, so this is the only
  write path in manual mode.
- The watch engine picks up the new plan on its next tick (~30 s) and the
  account dialog shows it at the next usage refresh.
- Downgrade the same way (`set plan = 'FREE'`) when a subscription lapses.
- Suggested flow: ask users to email you on payment; script these two queries.

Payout handling in this mode: direct transfer (InstaPay / bank / PayPal) from
the customer to you — no intermediary, no fees, matches the low early-user
count. Once Lemon Squeezy (or Paymob for local card flow) is available,
self-serve checkout lights up without further schema changes.
