# Provider identity & per-user quotas

## Why

Provider-backed routes now cost real money per call (AeroDataBox units), so an
**unauthenticated** route is a denial-of-wallet vector. At the same time all
traffic used to share a single IP at the gateway (via the Next proxy / Caddy),
so per-IP rate limits were nearly useless. This pass introduces:

- A required Supabase access token on each provider-backed route.
- Per-identity unit budgets (anonymous hourly, plan-based daily).
- A `log` → `enforce` rollout gate so no hard cutover is needed.
- Optional Redis for shared counters (falls back to in-memory).

## Gateway (`services/api`)

| Route                                | Gate     | Quota   |
| ------------------------------------ | -------- | ------- |
| `GET /v1/flights/search`             | required | 2 units |
| `GET /v1/flights/lookup`             | required | 2 units |
| `GET /v1/airports/:code/flights`     | required | 2 units |
| `GET /v1/airports/:code/routes`      | required | 6 units |
| `GET /v1/airports/search`            | required | 2 units |

- Config: `PROVIDER_AUTH_MODE=log|enforce` (defaults to `log`).
- Identity: Supabase `GET /auth/v1/user`, cached for 60 s by token digest.
- Anonymous callers: `20 units/hour`.
- Plans (`FREE|PLUS|PRO`): `100|500|2000 units/day`.
- Quota never trusts the token; it resolves the plan via the service key
  (`listUserPlans`), already backend-only per column-level grants.
- `/v1/me` now reports `providerQuota: { used, limit, resetsAt }` so the
  account dialog can show remaining lookups.

Quota `429` copy never mentions infrastructure; it frames it as plan/guest
limits and points to sign-in/upgrade.

## Web (`apps/web`)

- `lib/authed-fetch.ts` resolves a token and calls gateway routes with it.
- If there is no session, one anonymous Supabase session is created per
  browser (this only supplies a token, never an account).
- `observeSupabaseAuth` filters `is_anonymous` sessions so they never appear
  as a signed-in account; they only carry the token.
- `gatewayFetchJson` forwards the browser's `Authorization` header to the
  gateway from `/api/*` proxies. `/api/me`, `/api/billing/*` and
  `/api/account/delete` already supply their own explicit token in the body.

## Android

- `GatewayAuthInterceptor` plus `SupabaseGatewayTokenProvider` attach the
  Supabase session's access token to every gateway request through OkHttp.
- On `401` it retries once with a refreshed session.
- Every device keeps its own identity, so quota stays per-user even when
  phones share a hotspot.

## Enabling anonymous guest sessions in production

`supabase/config.toml` sets `enable_anonymous_sign_ins = true` for local dev.
The hosted Supabase project must also be switched on:

> Dashboard → **Providers → Anonymous sign-in** → enable.

Until it is enabled, `lib/authed-fetch.ts` falls back to a plain request.
That is safe in `log` mode (no quota is applied) and blocks anonymous callers
in `enforce` mode.

## Rollout

1. Deploy with `PROVIDER_AUTH_MODE=log`. Watch container logs for
   `provider auth: unauthenticated request (log mode)`.
2. After 24–48 h of clean logs, set the `PROVIDER_AUTH_MODE` secret to
   `enforce` and re-run Deploy.
3. When demand changes, adjust `PROVIDER_QUOTA_LIMITS`
   (`services/api/src/lib/user-quota.ts`).

## Engine split (P2 Track B)

The watch engine moved out of the gateway into a dedicated container. The
poll ladder lives in Postgres (`watchlist_items.next_poll_at`), and dedup is
enforced by a unique index on `flight_alerts`. That makes restarts and
future scale-out safe.

- `avi-api`: HTTP gateway, `WATCH_ENGINE_ENABLED=false`; reads engine stats
  from Redis (`avi:engine:status`, TTL 90 s) under `/v1/status`.
- `avi-engine`: worker image from the same codebase
  (`node dist/engine/worker.js`), `WATCH_ENGINE_ENABLED=true` by default.
- No new service dependency: single-writer via compose, plus advisory lock is
  added only if you scale `avi-engine` beyond one replica.
- See `docs/engine.md` for the split and the grading rules.

## Later

- Move quota counters to Redis-backed sliding windows (currently fixed
  hour/day buckets) if abuse patterns show they are too coarse.
- Add admin tooling to grant one-off quota extensions.
- Add a Postgres advisory lock as soon as `avi-engine` scales above one
  replica.

