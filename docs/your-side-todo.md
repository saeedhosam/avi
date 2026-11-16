# Project: things still on your plate

One file for every step that needs **you** — the operator — rather than code.
Grouped by priority. Everything code-side is done and deployed; nothing below
blocks the app from running today.

Last updated: 2026-11-07

---

## 1. Quick wins (~15 minutes, do anytime)

### 1a. Enable account recovery + support email for free (Cloudflare Email Routing)

You can't afford a mailbox provider yet — you don't need one. Cloudflare gives
you **free email forwarding** on your domain:

1. Cloudflare dashboard → `codestep.org` zone → **Email** → **Email Routing**
2. Enable it; follow the wizard (it verifies your destination address —
   `makymaky757@gmail.com`).
3. Create these routes:
   - `support@avi.codestep.org` → `makymaky757@gmail.com`
   - `billing@avi.codestep.org` → `makymaky757@gmail.com`
4. Once they exist, **the email swap happens in exactly 3 places** (search for
   `makymaky757@gmail.com`):
   - `apps/web/src/app/legal/privacy/page.tsx` — §1 (Who we are) and §10 (Contact)
   - `apps/web/src/app/legal/terms/page.tsx` — §12 (Contact)
   - `apps/web/src/components/source-banner.tsx` — the legal-links line
5. Replace the value with `support@avi.codestep.org`, commit, push (auto-Deploys).

Use these in any policy-reply, Polar-support correspondence, or Google OAuth
support URLs from then on.

### 1b. Uptime monitoring (~3 minutes)

1. Sign up at Better Uptime / UptimeRobot (free tier is fine).
2. Add two monitors:
   - `https://api.codestep.org/healthz` (HTTP, every 1–5 min)
   - `https://avi.codestep.org/` (HTTP, every 1–5 min)
3. Set alerts to your support email.
4. Optional extra: an SSL-expiry monitor on `avi.codestep.org` (Caddy renews
   automatically, but a monitor notices if that ever breaks.)

---

## 2. Polar billing — finish and flip live

Current state: products, webhook, API key, and GitHub secrets exist in
**test mode**. Checkout works but shows "Payments are currently unavailable"
because Stripe Connect onboarding is ~90% done ("Setup required" on the
payout account). The upgrade buttons in the app are still visible but point
at a frozen checkout page; billing remains limped in `manual` mode
(`BILLING_PROVIDER=manual` on the server), which shows "assigned manually"
email-based plan grants instead.

### 2a. Finish Stripe Connect onboarding

1. Polar dashboard → **Account Review → Connect a payout account** → click
   **Complete Setup** next to the Stripe row (`EG · EGP · Setup required`).
2. In Stripe's Express onboarding finish what's left — typically the Egyptian
   bank account (must be **your name, EGP, a real local bank**), any tax-ID
   details, and final identity confirmations.
3. When Stripe shows the account fully set up, go back to Polar →
   **Account Review → Check status**. The ✗ "Connect a payout account" should
   flip to ✓.
4. If Stripe *rejects* the `transfers` capability for Egypt (rare, but the
   listing-vs-support gap we hit) or Polar support doesn't resolve the
   "Payouts are paused" state: stop, and consider a fallback — either
   accepting bank transfers manually + me building the Paymob adapter
   (~1–2 days), or a foreign entity later.

### 2b. Test-mode upgrade test (repeatable)

1. In-app: avatar → Account dialog → **Upgrade to Plus**
2. Add discount `AVITEST100` → first payment shows **$0.00** → Subscribe now
3. Expect: redirect to `avi.codestep.org/?upgraded=1`, dialog refreshes to
   **PLAN: PLUS, limit 15**, Polar dashboard → Webhooks shows green deliveries
4. Same flow on the **Pro** product if you want both tiers verified

### 2c. Flip the store to live

Usually one toggle in the store dashboard; when you flip:

- **Regenerate the API key and webhook secret as live values** (they differ
  from test ones) — swap them in the GitHub secrets:
  - `POLAR_API_KEY` → live key
  - `POLAR_WEBHOOK_SECRET` → live secret
- Keep `BILLING_PROVIDER=polar`
- Run **Actions → Deploy → Run workflow**
- Do one real, small live upgrade to prove it, then refund it in Polar

### 2d. Plan-refresh secret flip (the "money on" switch)

1. GitHub → Settings → Secrets → Actions → update `BILLING_PROVIDER`
   from `manual` to `polar`
2. Actions → Deploy → Run workflow
3. Verify: in-app Account dialog shows Upgrade buttons; `/v1/billing/checkout`
   (unauthenticated) returns `502`, not `503`

### 2e. Recurring admin

- After your first ~14 days from account submission, Polar's **Account
  Review** clears asynchronously (no action needed).
- If Polar reports chargebacks/disputes, it notifies you by email; you won't
  have to respond as often as you might expect since Polar is Merchant of
  Record.

---

## 3. When the first subscription revenue lands

### 3a. Open-Meteo paid tier (compliance, not technical)

The free Open-Meteo tier is **non-commercial only** (their Terms of Use),
which is why I flagged it in two places. Since Avi now has paid plans, it
counts as commercial use by their definition.

1. open-meteo.com/en/pricing → pick the **API Standard** tier (or higher)
2. Set the new API key in the web container env — add these GitHub secrets:
   - none exist today; the weather fetch happens through the **web container**
     (server-side env), not the gateway — currently keyless is fine at low
     volume, but the compliant configuration needs the Standard tier
3. Run **Actions → Deploy → Run workflow**

Cost-justification note: this is a real monthly cost (~$29+/mo at their
current pricing) — take it from the first subscriptions rather than paying
out of pocket.

### 3b. Google Workspace / mailbox alternative

If Cloudflare routing isn't enough later (sending *from* the domain rather
than receiving), set up a proper mailbox and re-sweep the 3 places in §1a.

---

## 4. Web platform

The Android/iOS and Expo clients are retired. Remaining work is web-focused:

### 4a. Ongoing hygiene (when convenient)

- A Playwright/E2E pass on web; RLS tests against a local Supabase in CI — on
  request.
- Re-check the provider Terms pages every ~6–12 months: AeroDataBox and
  Open-Meteo both updated theirs in Sep–Oct 2026, and that's what surfaced the
  attribution/caching/commercial-use notes in `docs/launch-checklist.md`.

---

## 5. Records to keep

- **Account credentials**: only Polar, Supabase, Cloudflare, GitHub, Google
  Cloud — nothing else carries production authority. If you lose the backup,
  Supabase and Cloudflare are the two that matter for recovery.
- **The pre-migration schema backup**: every Deploy run uploads a
  `schema-backup-<sha>.sql` workflow artifact (retained 90 days) — grab the
  one from just before any deploy if you ever want to diff/roll back.
- **The screenshot/photo-ID set** used in Stripe Identity — keep private.

---

## 6. What to ask me (code) for, when ready

These are pre-scoped, so "go with [name]" is enough:

| Item | Size | Trigger |
|---|---|---|
| Playwright smoke + CI migration/RLS jobs | ~2 days | "tests next" |
| Paymob adapter (if Polar/Egypt fails permanently) | ~1–2 days | decide only after Polar support replies |
| Legal-page email/porting sweep after mailbox swap | ~5 min | traded in §1a steps |
| Annual Terms/Privacy/ToS review + re-attribution audit | ad hoc | every 6–12 months |
