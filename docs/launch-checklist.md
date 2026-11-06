# Avi launch checklist

Everything split between "code" and "your side" for going live at
`avi.codestep.org` / `api.codestep.org`.

## Your side (no code changes possible)

1. **DNS** — create two records on the `codestep.org` zone pointing at the
   Hetzner box (`2.31.110.53`, AAAA `2a01:4f8:c015:b0::1`):
   - `avi` → A `2.31.110.53`, AAAA `2a01:4f8:c015:b0::1`
   - `api` → A `2.31.110.53`, AAAA `2a01:4f8:c015:b0::1`
   - Keep the records **DNS-only (grey cloud)** so Caddy can issue Let's Encrypt
     certs directly; proxying works later if desired.
2. **Supabase dashboard → Auth → URL configuration**
   - `Site URL`: `https://avi.codestep.org`
   - Add redirect URLs: `https://avi.codestep.org/auth/callback`,
     `http://localhost:3000/auth/callback`
   - If Google provider is enabled, add
     `https://avi.codestep.org/auth/callback` to the Google Cloud OAuth client's
     authorized redirect URIs.
3. **GitHub secret update** (the `Deploy` workflow defaults include the new
   domains, but these secrets override them):
   - `AVI_API_BASE_URL` → `https://api.codestep.org`
   - optional `APP_ORIGIN` → `https://avi.codestep.org`
   - optional `APP_API_ORIGIN` → `https://api.codestep.org`
4. **Lemon Squeezy account** — signup must confirm Egypt seller support and a
   payout method (PayPal or bank). Then create the store, two subscription
   products (Plus, Pro; monthly + annual variants), and add these secrets:
   - `BILLING_PROVIDER=lemon_squeezy`
   - `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`
   - `LEMONSQUEEZY_VARIANT_PLUS`, `LEMONSQUEEZY_VARIANT_PRO`
     (comma-separated lists if a plan has Monthly **and** Yearly variants:
     `41,44`)
   - `LEMONSQUEEZY_WEBHOOK_SECRET`
   - In the store set the webhook to
     `https://api.codestep.org/v1/webhooks/lemon-squeezy` and connect the
     secret. Untested payment events land in gateway logs.
5. **Uptime monitoring** on
   `https://api.codestep.org/healthz` and `https://avi.codestep.org/` (e.g.
   Better Uptime / UptimeRobot) with an email alert target.
6. **Legal pages** — privacy policy + terms text (jurisdiction/support email
   needed), to be linked from the web app footer.

## Already done in code

- Caddy serves both new domains (sslip kept until the cutover completes).
- Deploy workflow derives origins from `APP_ORIGIN`/`APP_API_ORIGIN` with the
  production values as defaults.
- Billing surface: `POST /v1/webhooks/lemon-squeezy` (signature-verified plan
  writes), `POST /v1/billing/checkout` (authed hosted-checkout creation),
  `/v1/me` reports `billing.upgradeEnabled`, and the account dialog renders
  Upgrade buttons; without checkout config they gracefully say billing is
  assigned manually.
- Unit-budget threshold warnings at 80% / 95% (gateway logs) once per month.
- Account deletion, per-user local storage, error boundaries — all shipped in
  earlier passes.
