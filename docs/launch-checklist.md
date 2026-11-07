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
4. **Billing: Polar.sh** — the MoR choice for Egyptian sellers (Egypt is in
   Polar's official supported-payout list; LS store creation was 500-ing for
   this seller). Your side: sign up at polar.sh, connect the **Finance →
   Account** payout (Country Egypt → Stripe Connect Express KYC with Egyptian
   bank; submit for review — up to 14 days), create the two subscription
   products (Plus $4.99/mo, Pro $9.99/mo, optionally yearly prices), set the
   webhook to `https://api.codestep.org/v1/webhooks/polar` (copy its secret;
   events: order.created, subscription.created/updated/active/canceled/revoked),
   and create an API key. Polar signs with Standard Webhooks
   (`webhook-id`/`webhook-timestamp`/`webhook-signature`); use the full
   `whsec_…` value as `POLAR_WEBHOOK_SECRET`. Then add these secrets:
   - `BILLING_PROVIDER=polar`
   - `POLAR_API_KEY`, `POLAR_WEBHOOK_SECRET`
   - `POLAR_PRICE_PLUS`, `POLAR_PRICE_PRO`
     (comma-separated if a plan has Monthly **and** Yearly prices)
   Then trigger Deploy.
5. **Uptime monitoring** on
   `https://api.codestep.org/healthz` and `https://avi.codestep.org/` (e.g.
   Better Uptime / UptimeRobot) with an email alert target.
6. **Legal text** — ✅ shipped 2026-11-07. `/legal/privacy` and `/legal/terms`
   are live (linked from the in-app data-sources modal), written for
   Saeed Jumaa (individual, Egypt), contact makymaky757@gmail.com. Swap the
   support email everywhere once a domain mailbox exists.
   **⚠️ Compliance notes surfaced while reviewing provider legal docs:**
   - **Open-Meteo free tier is non-commercial only** (their Terms). Avi has
     paid plans → counts as commercial use. When the first subscription
     revenue lands, subscribe to their API Standard tier (or higher) to stay
     compliant — open-meteo.com/en/pricing.
   - **AeroDataBox Starter plan is compliant** for Avi's use: commercial use
     allowed on paid plans, attribution not required, End-Use sale (users
     viewing results) explicitly allowed. Their **Caching Terms cap flight
     payload retention at 7 days** → the engine now auto-purges stale
     watchlist snapshots after 7 days (`pruneStaleFlightSnapshots` in the
     daily tick). Never republish raw API payloads as datasets or feeds.
   - **Polar** (MoR) covers checkout buyer terms + taxes; AUP satisfied
     (software/SaaS ✅). `/legal/terms → 4` links their Checkout Buyer Terms.

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
